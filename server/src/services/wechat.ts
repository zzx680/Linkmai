import axios from 'axios'
import { config } from '../config'

const codeSessionUrl = 'https://api.weixin.qq.com/sns/jscode2session'

export class WechatLoginError extends Error {
  constructor(
    public readonly code: 'NOT_CONFIGURED' | 'INVALID_CODE' | 'UPSTREAM_ERROR',
    message: string
  ) {
    super(message)
  }
}

interface CodeSessionResponse {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

export async function exchangeWechatCode(code: string) {
  if (config.wechat.allowMockLogin && config.nodeEnv !== 'production') {
    return { openid: `mock_${code}` }
  }

  if (!config.wechat.appId || !config.wechat.appSecret) {
    throw new WechatLoginError('NOT_CONFIGURED', '微信登录服务未配置')
  }

  try {
    const response = await axios.get<CodeSessionResponse>(codeSessionUrl, {
      params: {
        appid: config.wechat.appId,
        secret: config.wechat.appSecret,
        js_code: code,
        grant_type: 'authorization_code',
      },
      timeout: 5000,
    })
    const result = response.data

    if (result.errcode || !result.openid || !result.session_key) {
      const codeType = result.errcode === 40029 || result.errcode === 40163
        ? 'INVALID_CODE'
        : 'UPSTREAM_ERROR'
      throw new WechatLoginError(codeType, result.errmsg || '微信登录失败')
    }

    return {
      openid: result.openid,
      unionid: result.unionid,
    }
  } catch (error) {
    if (error instanceof WechatLoginError) throw error
    throw new WechatLoginError('UPSTREAM_ERROR', '微信登录服务暂不可用')
  }
}
