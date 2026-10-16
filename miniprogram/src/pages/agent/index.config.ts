export default definePageConfig({
  navigationBarTitleText: '处理案件',
  disableScroll: true,
  usingComponents: process.env.TARO_ENV === 'h5' ? {} : {
    't-chat-message': 'tdesign-miniprogram/miniprogram_dist/chat-message/chat-message',
    't-chat-sender': 'tdesign-miniprogram/miniprogram_dist/chat-sender/chat-sender',
    // Taro 4 does not traverse componentGenerics.default dependencies.
    't-chat-markdown-tail': 'tdesign-miniprogram/miniprogram_dist/chat-markdown/chat-markdown-tail/chat-markdown-tail'
  }
})

function definePageConfig<T>(config: T): T {
  return config
}
