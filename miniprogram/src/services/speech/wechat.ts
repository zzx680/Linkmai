import Taro from '@tarojs/taro'
import { IS_H5, VOICE_INPUT_ENABLED } from '../../config/env'
import { ensureSpeechConsent } from '../../utils/privacy-consent'
import { SpeechCancelled, SpeechSession, type RecognitionManager } from './session'

export async function prepareSpeechInput(userId: string, cancelled = () => false): Promise<RecognitionManager> {
  if (IS_H5) throw new Error('请在微信小程序中使用口述输入')
  if (!VOICE_INPUT_ENABLED) throw new Error('口述输入暂不可用，请使用键盘输入')
  if (!await ensureSpeechConsent(userId)) throw new SpeechCancelled()
  if (cancelled()) throw new SpeechCancelled()
  if (typeof Taro.requirePrivacyAuthorize === 'function') {
    await new Promise<void>((resolve, reject) => Taro.requirePrivacyAuthorize({ success: () => resolve(), fail: () => reject(new SpeechCancelled()) }))
  }
  if (cancelled()) throw new SpeechCancelled()
  const settings = await Taro.getSetting()
  if (cancelled()) throw new SpeechCancelled()
  if (settings.authSetting['scope.record'] === false) {
    const result = await Taro.showModal({ title: '需要麦克风权限', content: '开启麦克风后，才能把口述内容转成文字', confirmText: '去设置', cancelText: '暂不使用', confirmColor: '#2A64F0' })
    if (!result.confirm) throw new SpeechCancelled()
    if (cancelled()) throw new SpeechCancelled()
    const updated = await Taro.openSetting()
    if (!updated.authSetting['scope.record']) throw new SpeechCancelled()
  } else {
    try { await Taro.authorize({ scope: 'scope.record' }) } catch { throw new SpeechCancelled() }
  }
  if (cancelled()) throw new SpeechCancelled()
  try {
    const plugin = Taro.requirePlugin('WechatSI') as { getRecordRecognitionManager?: () => RecognitionManager } | undefined
    const manager = plugin?.getRecordRecognitionManager?.()
    if (manager && typeof manager.start === 'function' && typeof manager.stop === 'function') return manager
  } catch { /* A missing / unauthorized plugin must not break text chat. */ }
  throw new Error('口述输入暂不可用，请使用键盘输入')
}

let sharedSession: SpeechSession | undefined
export function getWechatSpeechSession() {
  sharedSession ||= new SpeechSession(async () => { throw new Error('请先登录后使用口述输入') }, path => {
    // The plugin may create a temporary audio file. Never upload or keep it as a message.
    try { Taro.getFileSystemManager().unlink({ filePath: path, fail: () => undefined }) } catch { /* No persistent application copy is created. */ }
  })
  return sharedSession
}
