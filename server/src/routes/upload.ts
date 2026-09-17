import { Router, Request, Response } from 'express'
import multer from 'multer'
import { uploadFile } from '../services/oss'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

/**
 * POST /api/upload/image
 * 上传事故现场照片
 */
router.post('/image', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' })
    }

    // 验证文件类型
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: '仅支持 JPG/PNG/WEBP 格式' })
    }

    // 验证文件大小（最大 10MB）
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: '文件大小不能超过 10MB' })
    }

    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      'accident-photos'
    )

    res.json({
      success: true,
      data: result,
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
router.post('/video', upload.single('file'), async (req: Request, res: Response) => {
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

    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      'accident-videos'
    )

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: '上传失败' })
  }
})

export default router
