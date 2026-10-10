import Taro from '@tarojs/taro'

export function chooseImage(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    Taro.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        resolve(res.tempFilePaths)
      },
      fail: reject
    })
  })
}

export function chooseVideo(): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.chooseVideo({
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      camera: 'back',
      success: (res) => {
        resolve(res.tempFilePath)
      },
      fail: reject
    })
  })
}
