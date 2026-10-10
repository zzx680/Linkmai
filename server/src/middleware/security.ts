import { randomUUID } from 'crypto'
import { NextFunction, Request, Response } from 'express'

interface RateLimitOptions {
  windowMs: number
  max: number
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = req.get('x-request-id') || randomUUID()
  const startedAt = Date.now()
  res.setHeader('x-request-id', requestId)
  res.on('finish', () => {
    console.info(JSON.stringify({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }))
  })
  next()
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'no-referrer')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('cache-control', 'no-store')
  next()
}

export function createRateLimiter({ windowMs, max }: RateLimitOptions) {
  const attempts = new Map<string, { count: number; resetAt: number }>()

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const current = attempts.get(key)

    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    current.count += 1
    if (current.count > max) {
      res.setHeader('retry-after', Math.ceil((current.resetAt - now) / 1000).toString())
      return res.status(429).json({ error: 'TooManyRequests', message: '请求过于频繁，请稍后重试' })
    }

    next()
  }
}
