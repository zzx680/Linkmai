import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { harness, supportedCalculatorVersion } from './service'
import { id, workflowStore } from './store'
import { reviewerAuth, reviewerLogin, reviewAdmin, ReviewRequest } from './auth'
import { createRateLimiter } from '../middleware/security'
import { expenseDefinitions } from './calculator'
import { legalContentHash } from '../legal/types'
import { deliverReportNotificationForRun, linkReportNotificationToRun } from '../services/report-notifications'

export function harnessEnabled(_req: Request, res: Response, next: NextFunction) {
  if (process.env.HARNESS_ENABLED !== 'true') return res.status(503).json({ success: false, error: '案件计算与审核流程暂未启用' })
  next()
}
const identifier = z.string().min(1).max(160)
const candidate = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/), label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(3000), evidenceRefs: z.array(identifier).max(20).default([]) }).strict()
const codeMessage: Record<string,string> = {
  CASE_NOT_FOUND: '案件不存在', PAYMENT_REQUIRED: '请先解锁本案件', FACT_CONFLICT: '请先解决事实冲突', FACTS_REQUIRED: '请先确认事故事实',
  FACT_CONFIRMATION_REQUIRED: '请先确认或拒绝待确认信息，再重新生成当前版本',
  ACCIDENT_DATE_REQUIRED: '请确认 YYYY-MM-DD 格式的事故日期', JURISDICTION_REQUIRED: '请确认事故地区代码',
  CALCULATOR_NOT_APPROVED: '赔偿计算规则尚未审核启用', INPUT_STALE: '案件输入或规则已更新，请刷新并重新生成',
  LAWYER_REVIEW_REQUIRED: '该产物需要律师审核', REVIEWER_FORBIDDEN: '无权处理该审核任务', INVALID_REVIEW_CREDENTIALS: '审核账号或密码错误',
  REVIEW_AUTH_NOT_CONFIGURED: '审核服务尚未配置', DOCUMENT_NOT_APPROVED: '文书尚未批准', NEW_DOCUMENT_VERSION_REQUIRED: '草稿已退回，请核对修改项后生成新版本',
  REVIEW_CONSENT_REQUIRED: '请先确认人工复核的资料使用说明', WORKFLOW_PAUSED: '当前暂停新分析与审核提交，已有审核任务仍可跟进',
}
function endpoint(fn: (req: ReviewRequest) => Promise<unknown>) {
  return async (req: ReviewRequest, res: Response) => {
    try { res.json({ success: true, data: await fn(req) }) }
    catch (error) {
      if (error instanceof z.ZodError) { res.status(400).json({ success: false, error: '输入格式无效' }); return }
      const code = error instanceof Error ? error.message : 'INTERNAL_ERROR'
      const status = !/^[A-Z_]{1,100}$/.test(code) ? 500 : code === 'CASE_NOT_FOUND' || code.endsWith('_NOT_FOUND') ? 404 : code === 'PAYMENT_REQUIRED' ? 402
        : code === 'REVIEWER_FORBIDDEN' ? 403 : code === 'INVALID_REVIEW_CREDENTIALS' ? 401 : code.endsWith('_NOT_CONFIGURED') ? 503
          : /INVALID_|REQUIRED|NOT_PROPOSED/.test(code) ? 400 : 409
      res.status(status).json({ success: false, error: codeMessage[code] || '操作未完成，请核对当前状态后重试', code: /^[A-Z_]{1,100}$/.test(code) ? code : 'WORKFLOW_FAILED' })
    }
  }
}
const param = (req: Request, name: string) => identifier.parse(req.params[name])
const user = (req: Request) => identifier.parse(req.userId)
export const caseWorkflowRouter = Router()
caseWorkflowRouter.use(harnessEnabled)
caseWorkflowRouter.get('/:caseId/workspace', endpoint(req => harness.get(user(req), param(req,'caseId'))))
caseWorkflowRouter.get('/:caseId/calculator-fields', endpoint(async req => {
  await harness.get(user(req), param(req,'caseId')); return expenseDefinitions
}))
caseWorkflowRouter.post('/:caseId/facts', endpoint(req => harness.propose(user(req), param(req,'caseId'), candidate.parse(req.body))))
caseWorkflowRouter.post('/:caseId/facts/:factId/:decision', endpoint(req => harness.decideFact(user(req), param(req,'caseId'), param(req,'factId'), z.enum(['confirm','reject']).parse(req.params.decision))))
caseWorkflowRouter.post('/:caseId/conflicts/:conflictId/resolve', endpoint(req => harness.resolve(user(req), param(req,'caseId'), param(req,'conflictId'), z.object({ factId: identifier }).strict().parse(req.body).factId)))
caseWorkflowRouter.post('/:caseId/calculations', endpoint(req => harness.calculate(user(req), param(req,'caseId'))))
caseWorkflowRouter.post('/:caseId/documents/drafts', endpoint(async req => {
  const userId = user(req)
  const caseId = param(req,'caseId')
  const run = await harness.enqueue(userId, caseId)
  const subscriptionId = req.body?.notificationSubscriptionId
  if (typeof subscriptionId === 'string' && subscriptionId.length <= 64) {
    await linkReportNotificationToRun(subscriptionId, userId, caseId, run.runId)
    try {
      const workspace = await harness.get(userId, caseId)
      if (workspace.runs.some(item => item.id === run.runId && item.status === 'succeeded')) {
        await deliverReportNotificationForRun(run.runId)
      }
    } catch {
      // The report run remains valid if optional notification reconciliation is unavailable.
    }
  }
  return run
}))
caseWorkflowRouter.post('/:caseId/runs/:runId/retry', endpoint(req => harness.retry(user(req), param(req,'caseId'), param(req,'runId'))))
caseWorkflowRouter.post('/:caseId/documents/:documentId/confirm', endpoint(req => {
  const input = z.object({ reviewConsentVersion: z.literal('review-v1').optional() }).strict().parse(req.body || {})
  return harness.confirm(user(req), param(req,'caseId'), param(req,'documentId'), input.reviewConsentVersion)
}))
caseWorkflowRouter.post('/:caseId/documents/:documentId/revise', endpoint(req => harness.revise(user(req), param(req,'caseId'), param(req,'documentId'))))
caseWorkflowRouter.get('/:caseId/documents/:documentId/approved', endpoint(req => harness.approved(user(req), param(req,'caseId'), param(req,'documentId'))))

export const reviewRouter = Router()
reviewRouter.use(harnessEnabled)
reviewRouter.post('/login', createRateLimiter({ windowMs: 60_000, max: 10 }), endpoint(req => {
  const input = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).strict().parse(req.body)
  return reviewerLogin(input.email, input.password)
}))
reviewRouter.use(reviewerAuth)
reviewRouter.get('/queue', endpoint(req => harness.reviewQueue(req.reviewerId!)))
reviewRouter.get('/tasks/:caseId/:taskId/evidence/:evidenceId', endpoint(req => harness.reviewEvidence(req.reviewerId!, param(req,'caseId'), param(req,'taskId'), param(req,'evidenceId'))))
reviewRouter.post('/tasks/:caseId/:taskId/:action', endpoint(req => harness.reviewAction(req.reviewerId!, param(req,'caseId'), param(req,'taskId'),
  z.enum(['assign','open','approve','return']).parse(req.params.action),
  z.object({ reviewerId: identifier.optional(), note: z.string().trim().min(1).max(3000).optional(), returnItems: z.array(z.string().trim().min(1).max(500)).min(1).max(20).optional() }).strict().parse(req.body || {}))))
reviewRouter.get('/members', reviewAdmin, endpoint(async () => workflowStore.control(c => c.reviewers.map(({ passwordHash: _hash, ...member }) => member))))
reviewRouter.post('/members', reviewAdmin, endpoint(async req => {
  const input = z.object({ email: z.string().email().max(200), password: z.string().min(12).max(200) }).strict().parse(req.body)
  const passwordHash = await bcrypt.hash(input.password, 12)
  return workflowStore.control(c => {
    if (c.reviewers.some(r => r.email === input.email.toLowerCase())) throw new Error('REVIEWER_ALREADY_EXISTS')
    const member = { id: id(), email: input.email.toLowerCase(), role: 'reviewer' as const, active: true, passwordHash, invitedBy: req.reviewerId }
    c.reviewers.push(member); return { id: member.id, email: member.email }
  }, req.reviewerId!)
}))
reviewRouter.post('/members/:memberId/status', reviewAdmin, endpoint(req => {
  const { active } = z.object({ active: z.boolean() }).strict().parse(req.body)
  return workflowStore.control(c => {
    const member = c.reviewers.find(r => r.id === param(req,'memberId') && r.role === 'reviewer')
    if (!member) throw new Error('REVIEWER_NOT_FOUND')
    member.active = active; return { id: member.id, active }
  }, req.reviewerId!)
}))
const refs = z.array(identifier).min(1).max(30)
reviewRouter.get('/policies', reviewAdmin, endpoint(async () => workflowStore.control(c => ({ calculators: c.calculators, parameters: c.parameters, legal: c.legal }))))
reviewRouter.post('/calculator/publish', reviewAdmin, endpoint(req => {
  const input = z.object({ version: z.literal(supportedCalculatorVersion), legalRefs: refs }).strict().parse(req.body)
  return workflowStore.control(c => {
    if (input.legalRefs.some(ref => !c.legal.some(l => l.id === ref && l.active && l.approved))) throw new Error('INVALID_LEGAL_REFERENCE')
    const existing = c.calculators.find(v => v.id === input.version)
    if (existing) throw new Error('VERSION_IMMUTABLE')
    const version = { id: input.version, status: 'approved' as const, legalRefs: input.legalRefs, reviewedBy: req.reviewerId }
    if (existing) Object.assign(existing, version); else c.calculators.push(version)
    return version
  }, req.reviewerId!)
}))
reviewRouter.post('/parameters', reviewAdmin, endpoint(req => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s })
  const input = z.object({ id: identifier, version: z.string().min(1).max(100), code: z.enum(['meals_daily_cents','nutrition_daily_cents']),
    jurisdiction: z.string().regex(/^CN(?:-[A-Z0-9]{2,12}){0,2}$/), from: date, to: date.optional(), value: z.number().int().nonnegative().max(10000000), legalRefs: refs }).strict().parse(req.body)
  return workflowStore.control(c => {
    if (input.to && input.to < input.from) throw new Error('INVALID_EFFECTIVE_INTERVAL')
    if (c.parameters.some(p => p.id === input.id)) throw new Error('VERSION_IMMUTABLE')
    if (input.legalRefs.some(ref => !c.legal.some(l => l.id === ref && l.active && l.approved))) throw new Error('INVALID_LEGAL_REFERENCE')
    if (c.parameters.some(p => p.status === 'approved' && p.code === input.code && p.jurisdiction === input.jurisdiction && p.from <= (input.to || '9999-12-31') && input.from <= (p.to || '9999-12-31'))) throw new Error('PARAMETER_OVERLAP')
    const parameter = { ...input, status: 'approved' as const, reviewedBy: req.reviewerId }
    c.parameters.push(parameter); return parameter
  }, req.reviewerId!)
}))
reviewRouter.post('/calculator/retire', reviewAdmin, endpoint(req => workflowStore.control(c => {
  const version = c.calculators.find(v => v.id === supportedCalculatorVersion)
  if (!version) throw new Error('CALCULATOR_NOT_FOUND')
  version.status = 'retired'; return version
}, req.reviewerId!)))
reviewRouter.post('/parameters/:parameterId/retire', reviewAdmin, endpoint(req => workflowStore.control(c => {
  const parameter = c.parameters.find(p => p.id === param(req,'parameterId'))
  if (!parameter) throw new Error('PARAMETER_NOT_FOUND')
  parameter.status = 'retired'; return parameter
}, req.reviewerId!)))

reviewRouter.post('/legal/import', reviewAdmin, endpoint(req => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s })
  const input = z.object({ id: z.string().min(1).max(64), title: z.string().min(1).max(300), authority: z.string().min(1).max(200),
    documentType: z.string().min(1).max(100), jurisdiction: z.string().regex(/^CN(?:-[A-Z0-9]{2,12}){0,2}$/),
    sourceUrl: z.string().url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && /(?:^|\.)(?:gov\.cn|court\.gov\.cn)$/.test(url.hostname) }),
    version: z.string().min(1).max(100), effectiveFrom: date, effectiveTo: date.optional(), sourceText: z.string().min(20).max(800000),
    sections: z.array(z.object({ articleNumber: z.string().min(1).max(100), content: z.string().min(6).max(50000),
      legalRefId: z.string().min(1).max(160), keywords: z.array(z.string().max(50)).max(30) }).strict()).min(1).max(100),
  }).strict().parse(req.body)
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom || input.sections.some(section => !input.sourceText.includes(section.content))) throw new Error('INVALID_LEGAL_SOURCE')
  return workflowStore.importLegal(req.reviewerId!, { id: input.id, title: input.title, authority: input.authority,
    documentType: input.documentType, jurisdiction: input.jurisdiction, sourceUrl: input.sourceUrl, version: input.version,
    effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo, status: 'active', reviewStatus: 'pending', sourceHash: legalContentHash(input.sourceText) },
  input.sections.map(section => ({ ...section, id: id(), documentId: input.id, contentHash: legalContentHash(section.content) })), input.sourceText)
}))
reviewRouter.get('/legal/:documentId/source', reviewAdmin, endpoint(req => workflowStore.legalSource(param(req,'documentId'))))
reviewRouter.post('/legal/:documentId/review', reviewAdmin, endpoint(req => {
  const { approved, active } = z.object({ approved: z.boolean(), active: z.boolean() }).strict().parse(req.body)
  return workflowStore.control(c => {
    const references = c.legal.filter(ref => ref.documentId === param(req,'documentId'))
    if (!references.length) throw new Error('LEGAL_DOCUMENT_NOT_FOUND')
    references.forEach(ref => { ref.approved = approved; ref.active = active; ref.reviewedBy = req.reviewerId })
    return { documentId: param(req,'documentId'), approved, active }
  }, req.reviewerId!)
}))
