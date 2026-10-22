// Authorized for the LinkMai account; keep normal builds enabled and allow an explicit opt-out.
export function voiceInputConfig(flag = process.env.TARO_APP_VOICE_INPUT_ENABLED) {
  if (flag !== undefined && flag !== '' && flag !== 'false' && flag !== 'true') throw new Error('TARO_APP_VOICE_INPUT_ENABLED must be true or false')
  return flag !== 'false' ? {
    plugins: { WechatSI: { version: '0.3.3', provider: 'wx069ba97219f66d99' } },
    permission: { 'scope.record': { desc: '用于将你口述的事故经过转成可编辑文字' } }
  } : {}
}
