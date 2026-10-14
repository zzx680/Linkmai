import assert from 'node:assert/strict'
import { createCipheriv, generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import {
  decryptWechatResource,
  providerErrorCode,
  signWithPrivateKey,
  verifyNotification,
  verifyWechatSignature,
  verifyWithPublicKey,
} from '../src/services/payment/provider'
import { config } from '../src/config'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

test('WeChat Pay order-not-found codes map to a retryable local error', () => {
  for (const code of ['ORDER_NOT_EXIST', 'ORDERNOTEXIST']) {
    assert.equal(providerErrorCode(code).message, 'PAYMENT_ORDER_NOT_FOUND')
  }
})

test('WeChat Pay RSA signatures verify and reject tampering', () => {
  const message = 'POST\n/v3/pay/transactions/jsapi\n1710000000\nnonce\n{"amount":{"total":1}}\n'
  const signature = signWithPrivateKey(message, privateKey)
  assert.equal(verifyWithPublicKey(message, signature, publicKey), true)
  assert.equal(verifyWithPublicKey(`${message}tampered`, signature, publicKey), false)
})

test('WeChat Pay notification resource decrypts with API v3 key', () => {
  const apiV3Key = '12345678901234567890123456789012'
  const nonceText = 'paymentnonce'
  const nonce = Buffer.from(nonceText)
  const associatedData = 'transaction'
  const payload = {
    appid: 'wx-test',
    mchid: '1748822650',
    out_trade_no: 'LM_TEST_ORDER',
    transaction_id: '4200000000',
    trade_state: 'SUCCESS',
    attach: 'user-test',
    amount: { total: 1, currency: 'CNY' },
  }
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), nonce)
  cipher.setAAD(Buffer.from(associatedData))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()])
  const resource = {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonceText,
    associated_data: associatedData,
  }

  assert.deepEqual(decryptWechatResource(resource, apiV3Key), payload)
  assert.throws(() => decryptWechatResource(resource, 'invalid'), { message: 'PAYMENT_API_V3_KEY_INVALID' })
  assert.throws(() => decryptWechatResource(resource, 'abcdefghijklmnopqrstuvwxyz123456'))
})

test('WeChat Pay notification verifies headers and decrypts transaction', () => {
  const apiV3Key = '12345678901234567890123456789012'
  const publicKeyId = 'PUB_KEY_ID_0123456789ABCDEF'
  const nonceText = 'notice-nonce'
  const associatedData = 'transaction'
  const payload = {
    appid: 'wx-test-app',
    mchid: '1748822650',
    out_trade_no: 'LM_TEST_ORDER',
    transaction_id: '4200000000',
    trade_state: 'SUCCESS',
    attach: 'user-test',
    amount: { total: 1, currency: 'CNY' },
  }
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonceText))
  cipher.setAAD(Buffer.from(associatedData))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()])
  const body = JSON.stringify({
    resource: {
      ciphertext: ciphertext.toString('base64'),
      nonce: nonceText,
      associated_data: associatedData,
    },
  })
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const requestNonce = 'header-nonce'
  const signature = signWithPrivateKey(`${timestamp}\n${requestNonce}\n${body}\n`, privateKey)
  const headers = {
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': requestNonce,
    'wechatpay-signature': signature,
    'wechatpay-serial': publicKeyId,
  }
  const previous = { ...config.payment.wechat }
  Object.assign(config.payment.wechat, {
    appId: payload.appid,
    mchId: payload.mchid,
    apiV3Key,
    platformPublicKey: publicKey,
    platformPublicKeyId: publicKeyId,
  })

  try {
    assert.deepEqual(verifyNotification(headers, Buffer.from(body)), {
      orderNo: payload.out_trade_no,
      transactionId: payload.transaction_id,
      tradeState: payload.trade_state,
      tradeStateDescription: undefined,
      amountCents: 1,
      currency: 'CNY',
      appId: payload.appid,
      mchId: payload.mchid,
      userId: payload.attach,
    })
    assert.throws(
      () => verifyWechatSignature({ ...headers, 'wechatpay-serial': 'PUB_KEY_ID_BAD' }, body),
      { message: 'PAYMENT_PUBLIC_KEY_ID_MISMATCH' },
    )
    const expiredTimestamp = `${Number(timestamp) - 301}`
    const expiredSignature = signWithPrivateKey(`${expiredTimestamp}\n${requestNonce}\n${body}\n`, privateKey)
    assert.throws(
      () => verifyWechatSignature({
        ...headers,
        'wechatpay-timestamp': expiredTimestamp,
        'wechatpay-signature': expiredSignature,
      }, body),
      { message: 'PAYMENT_SIGNATURE_EXPIRED' },
    )
    assert.throws(
      () => verifyWechatSignature({ ...headers, 'wechatpay-signature': signature.slice(0, -4) + 'AAAA' }, body),
      { message: 'PAYMENT_SIGNATURE_INVALID' },
    )
  } finally {
    Object.assign(config.payment.wechat, previous)
  }
})

test('WeChat Pay refund notification keeps the original transaction identity', () => {
  const apiV3Key = '12345678901234567890123456789012'
  const publicKeyId = 'PUB_KEY_ID_0123456789ABCDEF'
  const nonceText = 'refund-nonce'
  const associatedData = 'refund'
  const payload = {
    out_trade_no: 'LM_REFUND_ORDER',
    transaction_id: '4200000001',
    refund_id: '5000000001',
    refund_status: 'SUCCESS',
  }
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonceText))
  cipher.setAAD(Buffer.from(associatedData))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()])
  const body = JSON.stringify({
    event_type: 'REFUND.SUCCESS',
    resource: {
      ciphertext: ciphertext.toString('base64'),
      nonce: nonceText,
      associated_data: associatedData,
    },
  })
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const requestNonce = 'refund-header-nonce'
  const signature = signWithPrivateKey(`${timestamp}\n${requestNonce}\n${body}\n`, privateKey)
  const headers = {
    'wechatpay-timestamp': timestamp,
    'wechatpay-nonce': requestNonce,
    'wechatpay-signature': signature,
    'wechatpay-serial': publicKeyId,
  }
  const previous = { ...config.payment.wechat }
  Object.assign(config.payment.wechat, {
    apiV3Key,
    platformPublicKey: publicKey,
    platformPublicKeyId: publicKeyId,
  })

  try {
    assert.deepEqual(verifyNotification(headers, Buffer.from(body)), {
      orderNo: payload.out_trade_no,
      transactionId: payload.transaction_id,
      tradeState: 'REFUND',
      tradeStateDescription: 'SUCCESS',
      amountCents: 0,
      currency: '',
      appId: '',
      mchId: '',
      userId: '',
      eventType: 'REFUND.SUCCESS',
    })
  } finally {
    Object.assign(config.payment.wechat, previous)
  }
})
