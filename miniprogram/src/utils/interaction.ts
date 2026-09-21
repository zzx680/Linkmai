// 微交互和动画工具函数

// 触觉反馈
export const hapticFeedback = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof wx !== 'undefined' && wx.vibrateShort) {
    wx.vibrateShort({ type: style === 'heavy' ? 'heavy' : style === 'medium' ? 'medium' : 'light' })
  }
}

// 成功反馈
export const successFeedback = () => {
  hapticFeedback('medium')
  if (typeof wx !== 'undefined' && wx.showToast) {
    wx.showToast({
      title: '操作成功',
      icon: 'success',
      duration: 1500
    })
  }
}

// 错误反馈
export const errorFeedback = (message: string = '操作失败') => {
  hapticFeedback('heavy')
  if (typeof wx !== 'undefined' && wx.showToast) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    })
  }
}

// 平滑滚动到指定位置
export const smoothScrollTo = (selector: string, duration: number = 300) => {
  if (typeof wx !== 'undefined' && wx.createSelectorQuery) {
    const query = wx.createSelectorQuery()
    query.select(selector).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((res) => {
      if (res[0]) {
        wx.pageScrollTo({
          scrollTop: res[1].scrollTop + res[0].top,
          duration
        })
      }
    })
  }
}
