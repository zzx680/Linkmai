import { Router, Request, Response, NextFunction } from 'express'

const router = Router()

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('服务器错误:', err)

  // API 错误响应
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      error: err.message || '服务器内部错误',
      code: 'INTERNAL_ERROR',
    })
  }

  // 其他错误
  res.status(500).send('服务器错误')
}

/**
 * 404 处理
 */
export function notFoundHandler(req: Request, res: Response) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: '接口不存在',
      code: 'NOT_FOUND',
    })
  }

  res.status(404).send('页面未找到')
}

/**
 * 业务异常类
 */
export class BusinessError extends Error {
  constructor(
    public message: string,
    public code: string = 'BUSINESS_ERROR',
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

/**
 * 异步路由处理包装器
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export default router
