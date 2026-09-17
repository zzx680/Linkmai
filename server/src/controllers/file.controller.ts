import { Request, Response } from 'express'
import { getUploadCredentials, FileType } from '../services/oss'
import { z } from 'zod'

/**
 * 获取上传凭证的请求 Schema
 */
const GetPresignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  fileType: z.nativeEnum(FileType),
  caseId: z.string().uuid(),
})

/**
 * 获取上传凭证
 * POST /api/files/presign
 */
export async function getPresignUrl(req: Request, res: Response) {
  try {
    const userId = req.user?.id // 从认证中间件获取

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '请先登录',
      })
    }

    const body = GetPresignRequestSchema.parse(req.body)

    const credentials = await getUploadCredentials(
      userId,
      body.caseId,
      body.fileType,
      body.filename
    )

    return res.json({
      success: true,
      data: credentials,
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'ValidationError',
        message: '参数格式错误',
        details: error.errors,
      })
    }

    console.error('获取上传凭证失败:', error)
    return res.status(500).json({
      error: 'InternalError',
      message: '获取上传凭证失败',
    })
  }
}

/**
 * 确认上传完成
 * POST /api/files/confirm
 */
export async function confirmUpload(req: Request, res: Response) {
  try {
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: '请先登录',
      })
    }

    const { objectKey, caseId, fileType } = req.body

    // TODO: 创建 Artifact 记录
    // TODO: 触发异步处理任务（OCR/分类）

    return res.json({
      success: true,
      data: {
        artifactId: 'temp-id', // 临时占位
        objectKey,
        status: 'processing',
      },
    })
  } catch (error) {
    console.error('确认上传失败:', error)
    return res.status(500).json({
      error: 'InternalError',
      message: '确认上传失败',
    })
  }
}
