import { Router, Request, Response } from 'express'
import multer from 'multer'
import { uploadFile } from '../services/oss'
import { db } from '../db'

const router = Router()
const imageMimes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    callback(null, imageMimes.has(file.mimetype))
  },
})

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
})

function hasValidImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
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

    if (!imageMimes.has(req.file.mimetype) || !hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
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
      data: { ...result, artifactId: artifact.id },
    })
  } catch (error) {
    console.error('Upload error:', error)
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
    if (!allowedMimes.includes(req.file.mimetype)) {
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
      data: { ...result, artifactId: artifact.id },
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: '上传失败' })
  }
})

export default router
