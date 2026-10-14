import { safeError } from '../utils/safe-error'
import { Router, Request, Response } from 'express'
import multer from 'multer'
import { uploadFile, getSignedUrl } from '../services/oss'
import { hasValidImageSignature, isSupportedImageMime } from '../utils/image'
import { db } from '../db'

const router = Router()

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    callback(null, isSupportedImageMime(file.mimetype))
  },
})

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
})

function hasValidVideoSignature(buffer: Buffer) {
  return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
}

/**
 * POST /api/upload/image
 * 上传事故现场照片
 */
router.post('/image', imageUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' })
    }

    if (!isSupportedImageMime(req.file.mimetype) || !hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: '仅支持有效的 JPG/PNG/WEBP 图片' })
    }

    const userId = req.userId
    const requestedCaseId = typeof req.body.caseId === 'string' ? req.body.caseId : undefined
    const currentCase = userId
      ? (requestedCaseId ? await db.findCaseById(userId, requestedCaseId) : await db.findActiveCase(userId))
      : null
    if (!currentCase) {
      return res.status(409).json({ error: '请先创建案件' })
    }

    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      'accident-photos'
    )

    const artifact = await db.createArtifact({
      caseId: currentCase.id,
      name: req.file.originalname,
      type: 'image',
      ossUrl: result.url,
      ossKey: result.key,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'uploaded',
    })

    res.json({
      success: true,
      data: { ...result, url: await getSignedUrl(result.key), artifactId: artifact.id },
    })
  } catch (error) {
    console.error('Upload error:', safeError(error))
    res.status(500).json({ error: '上传失败' })
  }
})

/**
 * POST /api/upload/video
 * 上传事故现场视频
 */
router.post('/video', videoUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' })
    }

    // 验证文件类型
    const allowedMimes = ['video/mp4', 'video/quicktime']
    if (!allowedMimes.includes(req.file.mimetype) || !hasValidVideoSignature(req.file.buffer)) {
      return res.status(400).json({ error: '仅支持 MP4/MOV 格式' })
    }

    // 验证文件大小（最大 50MB）
    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: '文件大小不能超过 50MB' })
    }

    const userId = req.userId
    const requestedCaseId = typeof req.body.caseId === 'string' ? req.body.caseId : undefined
    const currentCase = userId
      ? (requestedCaseId ? await db.findCaseById(userId, requestedCaseId) : await db.findActiveCase(userId))
      : null
    if (!currentCase) {
      return res.status(409).json({ error: '请先创建案件' })
    }

    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      'accident-videos'
    )

    const artifact = await db.createArtifact({
      caseId: currentCase.id,
      name: req.file.originalname,
      type: 'video',
      ossUrl: result.url,
      ossKey: result.key,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'uploaded',
    })

    res.json({
      success: true,
      data: { ...result, url: await getSignedUrl(result.key), artifactId: artifact.id },
    })
  } catch (error) {
    console.error('Upload error:', safeError(error))
    res.status(500).json({ error: '上传失败' })
  }
})

export default router
