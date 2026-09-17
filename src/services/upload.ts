import Taro from '@tarojs/taro'

const API_BASE_URL = process.env.TARO_APP_API_URL || 'http://localhost:8000'

interface UploadResult {
  url: string
  name: string
  size: number
}

/**
 * 上传图片到 OSS
 */
export async function uploadImage(filePath: string): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: `${API_BASE_URL}/api/upload/image`,
      filePath,
      name: 'file',
      success: (res) => {
        if (res.statusCode === 200) {
          const data = JSON.parse(res.data)
          if (data.success) {
            resolve(data.data)
          } else {
            reject(new Error(data.error || '上传失败'))
          }
        } else {
          reject(new Error(`上传失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        reject(err)
      },
    })
  })
}

/**
 * 批量上传图片
 */
export async function uploadImages(filePaths: string[]): Promise<UploadResult[]> {
  const results: UploadResult[] = []

  for (const filePath of filePaths) {
    try {
      const result = await uploadImage(filePath)
      results.push(result)
    } catch (error) {
      console.error('图片上传失败:', filePath, error)
      // 继续上传其他图片
    }
  }

  return results
}

/**
 * 上传视频到 OSS
 */
export async function uploadVideo(filePath: string): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: `${API_BASE_URL}/api/upload/video`,
      filePath,
      name: 'file',
      success: (res) => {
        if (res.statusCode === 200) {
          const data = JSON.parse(res.data)
          if (data.success) {
            resolve(data.data)
          } else {
            reject(new Error(data.error || '上传失败'))
          }
        } else {
          reject(new Error(`上传失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        reject(err)
      },
    })
  })
}
