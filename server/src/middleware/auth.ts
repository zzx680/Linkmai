import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: '未提供认证令牌' })
    }

    const token = authHeader.substring(7)

    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    if (typeof decoded === 'string' || typeof decoded.userId !== 'string' || !decoded.userId
      || typeof decoded.openid !== 'string' || !decoded.openid) {
      return res.status(401).json({ success: false, error: '认证令牌无效' })
    }

    req.userId = decoded.userId
    req.user = {
      id: decoded.userId,
      openid: decoded.openid,
    }

    next()
  } catch (err) {
    return res.status(401).json({ success: false, error: '认证令牌无效' })
  }
}
