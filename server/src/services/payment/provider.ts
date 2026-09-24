import { createDecipheriv, createSign, createVerify, randomBytes } from 'crypto'
import { config } from '../../config'

export interface PaymentLaunchParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

export interface CreateProviderOrderInput {
  orderNo: string
  description: string
  amountCents: number
  currency: string
  expiresAt: Date
  openid: string
  userId: string
}

export interface VerifiedPaymentNotification {
  orderNo: string
  amountCents: number
  currency: string
  userId: string
  appId: string
  mchId: string
  transactionId: string
  tradeState: string
}

export interface PaymentProvider {
  createOrder(input: CreateProviderOrderInput): Promise<{ prepayId: string; payment: PaymentLaunchParams }>
  createPaymentParams(prepayId: string): PaymentLaunchParams
  verifyNotification(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedPaymentNotification
}

function required(value: string, name: string): string {
  if (!value) throw new Error(`Missing payment configuration: ${name}`)
  return value
}

function pem(value: string): string {
  return value.replace(/\\n/g, '\n')
}

function buildPaymentSignature(message: string): string {
  const signer = createSign('RSA-SHA256')
  signer.update(message)
  signer.end()
  return signer.sign(pem(required(config.payment.wechat.privateKey, 'WECHAT_MCH_PRIVATE_KEY')), 'base64')
}

export function createClientPaymentParams(prepayId: string): PaymentLaunchParams {
  const appId = required(config.payment.wechat.appId, 'WECHAT_APP_ID')
  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomBytes(16).toString('hex')
  const packageValue = `prepay_id=${prepayId}`
  const paySign = buildPaymentSignature(`${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`)
  return { timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign }
}

async function wechatRequest(path: string, body: Record<string, unknown>): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString('hex')
  const bodyText = JSON.stringify(body)
  const authorizationSignature = buildPaymentSignature(`POST\n${path}\n${timestamp}\n${nonce}\n${bodyText}\n`)
  const mchId = required(config.payment.wechat.mchId, 'WECHAT_MCH_ID')
  const serialNo = required(config.payment.wechat.serialNo, 'WECHAT_MCH_SERIAL_NO')
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",signature="${authorizationSignature}",timestamp="${timestamp}",serial_no="${serialNo}"`
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method: 'POST',
    headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: bodyText,
  })
  const responseBody = await response.json() as any
  if (!response.ok) throw new Error('WECHAT_ORDER_CREATE_FAILED')
  return responseBody
}

function headerValue(headers: Record<string, string | string[] | undefined>, key: string): string {
  const value = headers[key]
  return Array.isArray(value) ? value[0] : value || ''
}

function verifyNotification(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedPaymentNotification {
  const timestamp = headerValue(headers, 'wechatpay-timestamp')
  const nonce = headerValue(headers, 'wechatpay-nonce')
  const signature = headerValue(headers, 'wechatpay-signature')
  const serial = headerValue(headers, 'wechatpay-serial')
  if (!timestamp || !nonce || !signature || !serial) throw new Error('WECHAT_SIGNATURE_HEADERS_MISSING')
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) throw new Error('WECHAT_SIGNATURE_EXPIRED')
  if (serial !== required(config.payment.wechat.platformSerialNo, 'WECHAT_PLATFORM_SERIAL_NO')) throw new Error('WECHAT_CERTIFICATE_SERIAL_MISMATCH')
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`)
  verifier.end()
  const publicKey = pem(required(config.payment.wechat.platformPublicKey, 'WECHAT_PLATFORM_PUBLIC_KEY'))
  if (!verifier.verify(publicKey, signature, 'base64')) throw new Error('WECHAT_SIGNATURE_INVALID')

  const envelope = JSON.parse(rawBody.toString('utf8'))
  const resource = envelope.resource
  if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') throw new Error('WECHAT_RESOURCE_INVALID')
  const key = Buffer.from(required(config.payment.wechat.apiV3Key, 'WECHAT_API_V3_KEY'), 'utf8')
  if (key.length !== 32) throw new Error('WECHAT_API_V3_KEY_INVALID')
  const ciphertext = Buffer.from(resource.ciphertext, 'base64')
  const authTag = ciphertext.subarray(ciphertext.length - 16)
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'))
  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'))
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  const transaction = JSON.parse(plaintext)
  return {
    orderNo: transaction.out_trade_no,
    amountCents: transaction.amount?.total,
    currency: transaction.amount?.currency,
    userId: transaction.attach,
    appId: transaction.appid,
    mchId: transaction.mchid,
    transactionId: transaction.transaction_id,
    tradeState: transaction.trade_state,
  }
}

const mockProvider: PaymentProvider = {
  async createOrder(input) {
    const prepayId = `mock_prepay_${input.orderNo}`
    return {
      prepayId,
      payment: {
        timeStamp: Math.floor(Date.now() / 1000).toString(),
        nonceStr: randomBytes(16).toString('hex'),
        package: `prepay_id=${prepayId}`,
        signType: 'RSA',
        paySign: '',
      },
    }
  },
  createPaymentParams(prepayId: string) {
    return {
      timeStamp: Math.floor(Date.now() / 1000).toString(),
      nonceStr: randomBytes(16).toString('hex'),
      package: `prepay_id=${prepayId}`,
      signType: 'RSA' as const,
      paySign: '',
    }
  },
  verifyNotification() {
    throw new Error('MOCK_PROVIDER_DOES_NOT_ACCEPT_PAYMENT_NOTIFICATIONS')
  },
}

const wechatProvider: PaymentProvider = {
  async createOrder(input) {
    const appId = required(config.payment.wechat.appId, 'WECHAT_APP_ID')
    required(config.payment.wechat.notifyUrl, 'WECHAT_PAY_NOTIFY_URL')
    const path = '/v3/pay/transactions/jsapi'
    const result = await wechatRequest(path, {
      appid: appId,
      mchid: required(config.payment.wechat.mchId, 'WECHAT_MCH_ID'),
      description: input.description,
      out_trade_no: input.orderNo,
      time_expire: input.expiresAt.toISOString(),
      notify_url: config.payment.wechat.notifyUrl,
      attach: input.userId,
      amount: { total: input.amountCents, currency: input.currency },
      payer: { openid: input.openid },
    })
    const prepayId = result.prepay_id
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = randomBytes(16).toString('hex')
    const packageValue = `prepay_id=${prepayId}`
    const paySign = buildPaymentSignature(`${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`)
    return {
      prepayId,
      payment: { timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign },
    }
  },
  createPaymentParams: createClientPaymentParams,
  verifyNotification,
}

export const paymentProvider = config.payment.provider === 'wechat' ? wechatProvider : mockProvider
export { verifyNotification }
