import Taro from '@tarojs/taro'
import { PRIVACY_VERSION } from '../content/privacy'

const accountKey = 'linkmai.privacy.account'
const caseDataKey = (userId: string) => `linkmai.privacy.case-data.${userId}`

function hasConsent(key: string) {
  try { return Taro.getStorageSync(key) === PRIVACY_VERSION } catch { return false }
}

async function ask(key: string, title: string, content: string) {
  if (hasConsent(key)) return true
  const result = await Taro.showModal({ title, content, confirmText: '同意继续', cancelText: '查看说明', confirmColor: '#2A64F0' })
  if (!result.confirm) {
    await Taro.navigateTo({ url: '/pages/privacy/index' })
    return false
  }
  Taro.setStorageSync(key, PRIVACY_VERSION)
  return true
}

export function ensureAccountConsent() {
  return ask(accountKey, '登录与个人信息', '登录将使用微信账户标识建立灵迈账户、保存案件进度。昵称和头像可选。你可以先查看“隐私与安全”，了解资料用途、数据申请与注销方式。')
}

export function ensureCaseDataConsent(userId: string) {
  return ask(caseDataKey(userId), '案件资料与 AI 分析', '你发送的事故描述、身份及医疗资料可能包含敏感个人信息，将由灵迈整理保存，交由阿里云进行材料存储和文字识别，并由 DeepSeek 官方 API 处理必要的案件文本或图片以生成辅助分析。请遮盖无关信息，并确认有权提供他人资料。不同意可先查看说明，不影响浏览其他页面。')
}

export function revokeCaseDataConsent(userId: string) {
  Taro.removeStorageSync(caseDataKey(userId))
  Taro.removeStorageSync(`linkmai.privacy.speech.${userId}`)
}

export function ensureSpeechConsent(userId: string) {
  return ask(`linkmai.privacy.speech.${userId}`, '语音转文字', '使用麦克风采集你主动口述的声音，并交由腾讯微信同声传译服务转成文字。识别结果先放入输入框，只有你点击发送后才作为案件对话保存。你可以随时取消，或继续使用键盘输入。')
}
