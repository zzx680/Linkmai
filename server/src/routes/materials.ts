import { safeError } from '../utils/safe-error'
import { Router } from 'express'
import { db } from '../db'
import { config } from '../config'
import { processMaterial, supportedMaterialTypes } from '../services/material'
import { getSignedUrl } from '../services/oss'

export const materialsRouter = Router()

async function toMaterial(artifact: any) {
  const metadata = artifact.metadata || {}
  const imageUrl = config.nodeEnv === 'test' && !config.oss.accessKeyId
    ? artifact.ossUrl
    : await getSignedUrl(artifact.ossKey)
  return {
    id: artifact.id,
    caseId: artifact.caseId,
    type: artifact.type,
    imageUrl,
    fields: metadata.fields || [],
    rawText: metadata.rawText,
    status: artifact.status,
    confirmed: Boolean(metadata.confirmed),
    createdAt: artifact.createdAt,
  }
}

async function getOwnedCase(userId: string, caseId?: string) {
  const currentCase = caseId
    ? await db.findCaseById(userId, caseId)
    : await db.findActiveCase(userId)
  return currentCase
}

/**
 * POST /api/materials/process
 * 处理上传的材料并保存识别结果
 */
materialsRouter.post('/process', async (req, res) => {
  // 只有本次请求成功 claim 后，异常才允许将 processing 改为 failed。
  let claimed: { caseId: string; artifactId: string } | undefined
  try {
    const userId = req.userId
    const { artifactId, materialType, caseId } = req.body || {}
    if (!userId) return res.status(401).json({ success: false, error: '未认证' })
    if (typeof artifactId !== 'string' || !artifactId || typeof caseId !== 'string' || !caseId) {
      return res.status(400).json({ success: false, error: '材料处理参数不完整' })
    }
    if (typeof materialType !== 'string' || !supportedMaterialTypes.has(materialType)) {
      return res.status(400).json({ success: false, error: '不支持的材料类型' })
    }

    const currentCase = await getOwnedCase(userId, caseId)
    if (!currentCase) return res.status(404).json({ success: false, error: '案件不存在' })

    const artifact = await db.findArtifactById(currentCase.id, artifactId)
    if (!artifact) return res.status(404).json({ success: false, error: '材料不存在' })
    if (artifact.status === 'processed') {
      return res.json({ success: true, data: await toMaterial(artifact) })
    }
    if (artifact.status === 'processing') {
      return res.status(409).json({ success: false, error: '材料正在处理中，请稍后重试' })
    }
    if (!['uploaded', 'failed'].includes(artifact.status) || !artifact.mimeType?.startsWith('image/')) {
      return res.status(404).json({ success: false, error: '未找到可处理的上传材料' })
    }

    const processing = await db.updateArtifact(currentCase.id, artifact.id, {
      type: materialType,
      status: 'processing',
    }, ['uploaded', 'failed'])
    if (!processing) {
      const latest = await db.findArtifactById(currentCase.id, artifact.id)
      if (latest?.status === 'processed') {
        return res.json({ success: true, data: await toMaterial(latest) })
      }
      return res.status(409).json({ success: false, error: '材料状态已变化，请稍后重试' })
    }
    claimed = { caseId: currentCase.id, artifactId: artifact.id }

    const processingUrl = config.nodeEnv === 'test' && !config.oss.accessKeyId
      ? processing.ossUrl
      : await getSignedUrl(processing.ossKey)
    const result = await processMaterial(materialType, processingUrl)
    const updated = await db.updateArtifact(currentCase.id, artifact.id, {
      type: materialType,
      status: 'processed',
      metadata: { fields: result.fields, rawText: result.rawText, confirmed: false },
    }, ['processing'])

    if (!updated) {
      return res.status(409).json({ success: false, error: '材料状态已变化，请重新加载' })
    }

    res.json({ success: true, data: await toMaterial(updated) })
  } catch (err: any) {
    console.error('材料处理失败:', safeError(err))
    if (claimed) {
      await db.updateArtifact(claimed.caseId, claimed.artifactId, {
        status: 'failed',
        metadata: { error: '材料处理失败，请稍后重试', failedAt: new Date().toISOString() },
      }, ['processing']).catch(() => undefined)
    }
    res.status(422).json({ success: false, error: '材料处理失败，请稍后重试' })
  }
})

/**
 * GET /api/materials/:caseId
 */
materialsRouter.get('/:caseId', async (req, res) => {
  try {
    const userId = req.userId
    if (!userId) return res.status(401).json({ success: false, error: '未认证' })
    const currentCase = await getOwnedCase(userId, req.params.caseId)
    if (!currentCase) return res.status(404).json({ success: false, error: '案件不存在' })
    const artifacts = await db.getArtifactsByCase(currentCase.id)
    res.json({ success: true, data: await Promise.all(artifacts.map(toMaterial)) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: '获取材料失败' })
  }
})

/**
 * POST /api/materials/confirm
 */
materialsRouter.post('/confirm', async (req, res) => {
  try {
    const userId = req.userId
    const { caseId, artifactId, fields, rawText } = req.body || {}
    if (!userId) return res.status(401).json({ success: false, error: '未认证' })
    if (typeof caseId !== 'string' || !caseId || typeof artifactId !== 'string' || !artifactId || !Array.isArray(fields)) {
      return res.status(400).json({ success: false, error: '材料确认参数不完整' })
    }
    if (!fields.every(field =>
      field !== null && typeof field === 'object' && !Array.isArray(field) &&
      typeof field.key === 'string' && typeof field.label === 'string' && typeof field.value === 'string' &&
      (field.confidence === undefined || ['high', 'medium', 'low'].includes(field.confidence))
    ) || (rawText !== undefined && typeof rawText !== 'string')) {
      return res.status(400).json({ success: false, error: '材料字段或原始文本格式不正确' })
    }
    const currentCase = await getOwnedCase(userId, caseId)
    if (!currentCase) return res.status(404).json({ success: false, error: '案件不存在' })
    const artifact = await db.findArtifactById(caseId, artifactId)
    if (!artifact || artifact.status !== 'processed') {
      return res.status(404).json({ success: false, error: '材料不存在' })
    }
    const updated = await db.confirmArtifact(userId, caseId, artifact.id, fields, rawText)
    if (!updated) return res.status(409).json({ success: false, error: '材料状态已变化，请重新加载' })
    res.json({ success: true, data: { confirmed: true, material: await toMaterial(updated) } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: '确认材料失败' })
  }
})
