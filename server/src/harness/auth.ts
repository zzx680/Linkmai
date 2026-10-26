import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { config } from '../config'
import { workflowStore } from './store'

export function reviewerSecret(): string {
  const key = process.env.REVIEW_JWT_SECRET || ''
  if (key.length < 32 || key === config.jwtSecret) throw new Error('REVIEW_AUTH_NOT_CONFIGURED')
  return key
}
export async function reviewerLogin(email: string, password: string) {
  const key = reviewerSecret()
  const reviewer = await workflowStore.control(c => c.reviewers.find(r => r.email === email.toLowerCase() && r.active))
  if (!reviewer || !await bcrypt.compare(password, reviewer.passwordHash)) throw new Error('INVALID_REVIEW_CREDENTIALS')
  return { token: jwt.sign({ sub: reviewer.id, role: reviewer.role }, key, { algorithm: 'HS256', expiresIn: '2h', issuer: 'linkmai-review', audience: 'review-api' }),
    reviewer: { id: reviewer.id, role: reviewer.role } }
}
export type ReviewRequest = Request & { reviewerId?: string; reviewerRole?: 'reviewer' | 'review_admin' }
export async function reviewerAuth(req: ReviewRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    if (!token) throw new Error('MISSING_REVIEW_TOKEN')
    const decoded = jwt.verify(token, reviewerSecret(), { algorithms: ['HS256'], issuer: 'linkmai-review', audience: 'review-api' })
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') throw new Error('INVALID_REVIEW_TOKEN')
    const actor = await workflowStore.control(c => c.reviewers.find(r => r.id === decoded.sub && r.active))
    if (!actor || actor.role !== decoded.role) throw new Error('REVIEWER_DISABLED')
    req.reviewerId = actor.id; req.reviewerRole = actor.role; next()
  } catch { res.status(401).json({ success: false, error: '审核身份无效或已过期' }) }
}
export function reviewAdmin(req: ReviewRequest, res: Response, next: NextFunction) {
  if (req.reviewerRole !== 'review_admin') return res.status(403).json({ success: false, error: '需要审核管理员权限' })
  next()
}
