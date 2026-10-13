import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, Method } from 'axios'
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

export interface ProviderOrder {
  orderNo: string
  transactionId?: string
  tradeState: string
  tradeStateDescription?: string
  amountCents: number
  currency: string
  appId: string
  mchId: string
  userId?: string
}

export interface VerifiedPaymentNotification extends ProviderOrder {
  userId: string
  transactionId: string
}

export interface PaymentProvider {
  createOrder(input: CreateProviderOrderInput): Promise<{ prepayId: string; payment: PaymentLaunchParams }>
  createPaymentParams(prepayId: string): PaymentLaunchParams
  queryOrder(orderNo: string): Promise<ProviderOrder>
  closeOrder(orderNo: string): Promise<void>
  verifyNotification(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedPaymentNotification
}

function required(value: string, name: string): string {
  if (!value) throw new Error(`Missing payment configuration: ${name}`)
  return value
}

function pem(value: string): string {
  return value.replace(/\\n/g, '\n')
}

export function signWithPrivateKey(message: string, privateKey: string): string {
  const signer = createSign('RSA-SHA256')
  signer.update(message)
  signer.end()
  return signer.sign(pem(privateKey), 'base64')
}

export function verifyWithPublicKey(message: string, signature: string, publicKey: string): boolean {
  const verifier = createVerify('RSA-SHA256')
  verifier.update(message)
  verifier.end()
  return verifier.verify(pem(publicKey), signature, 'base64')
}

function sign(message: string): string {
  return signWithPrivateKey(message, required(config.payment.wechat.privateKey, 'WECHAT_MCH_PRIVATE_KEY'))
}

function verify(message: string, signature: string): boolean {
  return verifyWithPublicKey(
    message,
    signature,
    required(config.payment.wechat.platformPublicKey, 'WECHAT_PAY_PUBLIC_KEY'),
  )
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function verifyWechatSignature(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
): void {
  const timestamp = header(headers, 'Wechatpay-Timestamp')
  const nonce = header(headers, 'Wechatpay-Nonce')
  const signature = header(headers, 'Wechatpay-Signature')
  const serial = header(headers, 'Wechatpay-Serial')
  if (!timestamp || !nonce || !signature || !serial) throw new Error('PAYMENT_SIGNATURE_HEADERS_MISSING')
  if (serial !== required(config.payment.wechat.platformPublicKeyId, 'WECHAT_PAY_PUBLIC_KEY_ID')) {
    throw new Error('PAYMENT_PUBLIC_KEY_ID_MISMATCH')
  }
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    throw new Error('PAYMENT_SIGNATURE_EXPIRED')
  }
  if (!verify(`${timestamp}\n${nonce}\n${rawBody}\n`, signature)) throw new Error('PAYMENT_SIGNATURE_INVALID')
}

function buildAuthorization(method: Method, canonicalUrl: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString('hex')
  const signature = sign(`${method.toUpperCase()}\n${canonicalUrl}\n${timestamp}\n${nonce}\n${body}\n`)
  const mchId = required(config.payment.wechat.mchId, 'WECHAT_MCH_ID')
  const serialNo = required(config.payment.wechat.serialNo, 'WECHAT_MCH_SERIAL_NO')
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`
}

function createClientPaymentParams(prepayId: string): PaymentLaunchParams {
  const appId = required(config.payment.wechat.appId, 'WECHAT_APP_ID')
  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomBytes(16).toString('hex')
  const packageValue = `prepay_id=${prepayId}`
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign: sign(`${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`),
  }
}

export function decryptWechatResource(
  resource: { ciphertext: string; nonce: string; associated_data?: string },
  apiV3Key: string,
) {
  const key = Buffer.from(apiV3Key, 'utf8')
  if (key.length !== 32) throw new Error('PAYMENT_API_V3_KEY_INVALID')
  const encrypted = Buffer.from(resource.ciphertext, 'base64')
  if (encrypted.length <= 16) throw new Error('PAYMENT_NOTIFICATION_INVALID')
  const data = encrypted.subarray(0, encrypted.length - 16)
  const authTag = encrypted.subarray(encrypted.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'))
  decipher.setAuthTag(authTag)
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'))
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'))
}

function toProviderOrder(result: any): ProviderOrder {
  return {
    orderNo: result.out_trade_no,
    transactionId: result.transaction_id,
    tradeState: result.trade_state,
    tradeStateDescription: result.trade_state_desc,
    amountCents: result.amount?.total,
    currency: result.amount?.currency,
    appId: result.appid,
    mchId: result.mchid,
    userId: result.attach,
  }
}

export function providerErrorCode(code?: string): Error {
  if (code === 'ORDER_NOT_EXIST' || code === 'ORDERNOTEXIST') return new Error('PAYMENT_ORDER_NOT_FOUND')
  if (code === 'ORDERPAID') return new Error('ALREADY_PAID')
  if (code === 'ORDERCLOSED') return new Error('ORDER_NOT_PAYABLE')
  return new Error('PAYMENT_PROVIDER_ERROR')
}

function paymentError(error: unknown): Error {
  if (!(error instanceof AxiosError)) return error instanceof Error ? error : new Error('PAYMENT_PROVIDER_ERROR')
  return providerErrorCode(error.response?.data?.code)
}

async function requestWechat<T>(method: Method, path: string, data?: Record<string, unknown>): Promise<T> {
  const body = data === undefined ? '' : JSON.stringify(data)
  const request: AxiosRequestConfig = {
    baseURL: 'https://api.mch.weixin.qq.com',
    url: path,
    method,
    data: data === undefined ? undefined : body,
    headers: {
      Accept: 'application/json',
      Authorization: buildAuthorization(method, path, body),
      'Content-Type': 'application/json',
      'User-Agent': 'linkmai-server/1.0',
      'Wechatpay-Serial': required(config.payment.wechat.platformPublicKeyId, 'WECHAT_PAY_PUBLIC_KEY_ID'),
    },
    timeout: 10000,
    transformResponse: [(value) => value],
    validateStatus: () => true,
  }

  let response: AxiosResponse<string>
  try {
    response = await axios.request<string>(request)
  } catch (error) {
    throw paymentError(error)
  }
  const rawBody = response.data || ''
  verifyWechatSignature(response.headers as Record<string, string | string[] | undefined>, rawBody)
  const result = rawBody ? JSON.parse(rawBody) : {}
  if (response.status < 200 || response.status >= 300) {
    throw providerErrorCode(result.code)
  }
  return result as T
}

export function verifyNotification(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
): VerifiedPaymentNotification {
  const body = rawBody.toString('utf8')
  verifyWechatSignature(headers, body)
  const envelope = JSON.parse(body)
  const result = decryptWechatResource(
    envelope.resource,
    required(config.payment.wechat.apiV3Key, 'WECHAT_API_V3_KEY'),
  )
  return {
    ...toProviderOrder(result),
    userId: result.attach || '',
    transactionId: result.transaction_id || '',
  }
}

const mockProvider: PaymentProvider = {
  async createOrder(input) {
    const prepayId = `mock_${input.orderNo}`
    return { prepayId, payment: createClientPaymentParams(prepayId) }
  },
  createPaymentParams: createClientPaymentParams,
  async queryOrder(orderNo) {
    return {
      orderNo,
      tradeState: 'NOTPAY',
      amountCents: config.payment.amountCents,
      currency: config.payment.currency,
      appId: config.payment.wechat.appId,
      mchId: config.payment.wechat.mchId,
    }
  },
  async closeOrder() {},
  verifyNotification,
}

const disabledProvider: PaymentProvider = {
  async createOrder() { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
  createPaymentParams() { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
  async queryOrder() { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
  async closeOrder() { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
  verifyNotification() { throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED') },
}

const wechatProvider: PaymentProvider = {
  async createOrder(input) {
    const appId = required(config.payment.wechat.appId, 'WECHAT_APP_ID')
    const mchId = required(config.payment.wechat.mchId, 'WECHAT_MCH_ID')
    const result = await requestWechat<{ prepay_id: string }>('POST', '/v3/pay/transactions/jsapi', {
      appid: appId,
      mchid: mchId,
      description: input.description,
      out_trade_no: input.orderNo,
      time_expire: input.expiresAt.toISOString(),
      notify_url: required(config.payment.wechat.notifyUrl, 'WECHAT_PAY_NOTIFY_URL'),
      attach: input.userId,
      amount: { total: input.amountCents, currency: input.currency },
      payer: { openid: input.openid },
    })
    return { prepayId: result.prepay_id, payment: createClientPaymentParams(result.prepay_id) }
  },
  createPaymentParams: createClientPaymentParams,
  async queryOrder(orderNo) {
    const mchId = required(config.payment.wechat.mchId, 'WECHAT_MCH_ID')
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(mchId)}`
    return toProviderOrder(await requestWechat('GET', path))
  },
  async closeOrder(orderNo) {
    const mchId = required(config.payment.wechat.mchId, 'WECHAT_MCH_ID')
    await requestWechat('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}/close`, { mchid: mchId })
  },
  verifyNotification,
}

export const paymentProvider = config.payment.provider === 'wechat'
  ? wechatProvider
  : config.payment.provider === 'disabled'
    ? disabledProvider
    : mockProvider

export { createClientPaymentParams, requestWechat, verifyWechatSignature }
