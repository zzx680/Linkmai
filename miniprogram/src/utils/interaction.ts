import Taro from '@tarojs/taro'

// 微交互和动画工具函数

export const hapticFeedback = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  Taro.vibrateShort({ type: style })
}

export const successFeedback = () => {
  hapticFeedback('medium')
  Taro.showToast({
    title: '操作成功',
    icon: 'success',
    duration: 1500
  })
}

export const errorFeedback = (message: string = '操作失败') => {
  hapticFeedback('heavy')
  Taro.showToast({
    title: message,
    icon: 'none',
    duration: 2000
  })
}

export const smoothScrollTo = (selector: string, duration: number = 300) => {
  const query = Taro.createSelectorQuery()
  query.select(selector).boundingClientRect()
  query.selectViewport().scrollOffset()
  query.exec(results => {
    const target = results[0] as { top?: number } | undefined
    const viewport = results[1] as { scrollTop?: number } | undefined
    if (target?.top !== undefined) {
      Taro.pageScrollTo({
        scrollTop: (viewport?.scrollTop || 0) + target.top,
        duration
      })
    }
  })
}
