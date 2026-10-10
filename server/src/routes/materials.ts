import { Router } from 'express'
import { db } from '../db'
import { processMaterial } from '../services/material'

export const materialsRouter = Router()

function toMaterial(artifact: any) {
  const metadata = artifact.metadata || {}
  return {
    id: artifact.id,
    caseId: artifact.caseId,
    type: artifact.type,
    imageUrl: artifact.ossUrl,
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
  try {
    const userId = req.userId
    const { artifactId, materialType, caseId } = req.body
    if (!userId) return res.status(401).json({ success: false, error: '未认证' })
    if (typeof artifactId !== 'string' || !artifactId || typeof caseId !== 'string' || !caseId) {
      return res.status(400).json({ success: false, error: '材料处理参数不完整' })
    }
    const supportedTypes = new Set(['accident_report', 'medical_record', 'scene_photo', 'id_card', 'vehicle_license', 'driver_license', 'invoice', 'other'])
    if (!supportedTypes.has(materialType)) {
      return res.status(400).json({ success: false, error: '不支持的材料类型' })
    }

    const currentCase = await getOwnedCase(userId, caseId)
    if (!currentCase) return res.status(404).json({ success: false, error: '案件不存在' })

    const artifact = await db.findArtifactById(currentCase.id, artifactId)
    if (!artifact || !['uploaded', 'failed'].includes(artifact.status) || !artifact.mimeType?.startsWith('image/')) {
      return res.status(404).json({ success: false, error: '未找到可处理的上传材料' })
    }

    const result = await processMaterial(materialType, artifact.ossUrl)
    const updated = await db.updateArtifact(currentCase.id, artifact.id, {
      type: materialType,
      status: 'processed',
      metadata: { fields: result.fields || [], rawText: result.rawText, confirmed: false },
    })

    if (!updated) {
      return res.status(404).json({ success: false, error: '材料不存在' })
    }

    res.json({ success: true, data: toMaterial(updated) })
  } catch (err: any) {
    console.error('材料处理失败:', err)
    const userId = req.userId
    const { artifactId, caseId } = req.body || {}
    if (userId && typeof caseId === 'string' && typeof artifactId === 'string') {
      const ownedCase = await getOwnedCase(userId, caseId)
      if (ownedCase) {
        await db.updateArtifact(caseId, artifactId, {
          status: 'failed',
          metadata: { error: err.message || '材料处理失败', failedAt: new Date().toISOString() },
        }).catch(() => undefined)
      }
    }
    res.status(422).json({ success: false, error: err.message || '材料处理失败' })
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
    res.json({ success: true, data: artifacts.map(toMaterial) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || '获取材料失败' })
  }
})

/**
 * POST /api/materials/confirm
 */
materialsRouter.post('/confirm', async (req, res) => {
  try {
    const userId = req.userId
    const { caseId, artifactId, fields, rawText } = req.body
    if (!userId) return res.status(401).json({ success: false, error: '未认证' })
    if (!caseId || !artifactId || !Array.isArray(fields)) {
      return res.status(400).json({ success: false, error: '材料确认参数不完整' })
    }
    const currentCase = await getOwnedCase(userId, caseId)
    if (!currentCase) return res.status(404).json({ success: false, error: '案件不存在' })
    const artifact = await db.findArtifactById(caseId, artifactId)
    if (!artifact || artifact.status !== 'processed') {
      return res.status(404).json({ success: false, error: '材料不存在' })
    }
    const updated = await db.confirmArtifact(userId, caseId, artifact.id, fields, rawText)
    if (!updated) return res.status(409).json({ success: false, error: '材料状态已变化，请重新加载' })
    res.json({ success: true, data: { confirmed: true, material: toMaterial(updated) } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || '确认材料失败' })
  }
})
