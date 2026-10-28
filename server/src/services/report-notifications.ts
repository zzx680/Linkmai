import axios from 'axios'
import { config } from '../config'
import { db } from '../db'

const accessTokenEndpoint = 'https://api.weixin.qq.com/cgi-bin/token'
const sendEndpoint = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send'

let cachedToken: { value: string; expiresAt: number } | null = null

function fieldName(value: string) {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)
}

export function reportNotificationConfig() {
  const settings = config.wechat.reportNotification
  const fields = [settings.titleField, settings.statusField, settings.timeField]
  const enabled = Boolean(config.wechat.appId && config.wechat.appSecret && settings.templateId
    && fields.every(fieldName) && new Set(fields).size === fields.length)
  return { enabled, templateId: enabled ? settings.templateId : '' }
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value
  const response = await axios.get<{ access_token?: string; expires_in?: number; errcode?: number }>(accessTokenEndpoint, {
    params: { grant_type: 'client_credential', appid: config.wechat.appId, secret: config.wechat.appSecret },
    timeout: 10_000,
  })
  if (!response.data.access_token) throw new Error(`WECHAT_TOKEN_${response.data.errcode || 'INVALID_RESPONSE'}`)
  cachedToken = { value: response.data.access_token, expiresAt: Date.now() + Math.max(60, (response.data.expires_in || 7200) - 300) * 1000 }
  return cachedToken.value
}

async function sendWechatNotification(input: { openid: string; templateId: string; caseId: string }) {
  const token = await getAccessToken()
  const settings = config.wechat.reportNotification
  const now = new Date()
  const timeParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce<Record<string, string>>((parts, part) => {
    parts[part.type] = part.value
    return parts
  }, {})
  const time = `${timeParts.year}-${timeParts.month}-${timeParts.day} ${timeParts.hour}:${timeParts.minute}`
  const response = await axios.post<{ errcode?: number; errmsg?: string }>(sendEndpoint, {
    touser: input.openid,
    template_id: input.templateId,
    page: 'pages/case/index',
    data: {
      [settings.titleField]: { value: '事故分析已整理' },
      [settings.statusField]: { value: '请返回小程序核对' },
      [settings.timeField]: { value: time },
    },
    miniprogram_state: config.nodeEnv === 'production' ? 'formal' : config.nodeEnv === 'staging' ? 'trial' : 'developer',
    lang: 'zh_CN',
  }, { params: { access_token: token }, timeout: 10_000 })
  if (response.data.errcode) throw new Error(`WECHAT_SEND_${response.data.errcode}`)
}

function safeFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return /^WECHAT_[A-Z0-9_-]{1,90}$/.test(message) ? message : 'WECHAT_SEND_FAILED'
}

export async function deliverReportNotificationForRun(
  runId: string,
  sender: typeof sendWechatNotification = sendWechatNotification,
) {
  let subscription
  try {
    subscription = await db.claimReportNotificationSubscription(runId)
  } catch {
    console.error('案件完成提醒领取失败: REPORT_NOTIFICATION_CLAIM_FAILED')
    return false
  }
  if (!subscription) return false
  try {
    const user = await db.findUserById(subscription.userId)
    if (!user?.openid) throw new Error('WECHAT_OPENID_MISSING')
    await sender({ openid: user.openid, templateId: subscription.templateId, caseId: subscription.caseId })
    await db.finishReportNotificationSubscription(subscription.id, 'sent')
  } catch (error) {
    const code = safeFailureCode(error)
    await db.finishReportNotificationSubscription(subscription.id, 'failed', code).catch(() => undefined)
    console.error('案件完成提醒发送失败:', code)
  }
  return true
}

export async function linkReportNotificationToRun(id: string, userId: string, caseId: string, runId: string) {
  try {
    return await db.linkReportNotificationSubscription(id, userId, caseId, runId)
  } catch {
    console.error('案件完成提醒绑定失败: REPORT_NOTIFICATION_LINK_FAILED')
    return false
  }
}

export async function createReportNotificationSubscription(userId: string, caseId: string) {
  const notification = reportNotificationConfig()
  if (!notification.enabled) throw new Error('REPORT_NOTIFICATION_DISABLED')
  const subscription = await db.createReportNotificationSubscription(userId, caseId, notification.templateId)
  return { subscriptionId: subscription.id }
}
