import Taro from '@tarojs/taro'

const SERVER_URL = 'http://localhost:3000'

interface UploadCredentials {
  region: string
  bucket: string
  objectKey: string
  accessKeyId: string
  accessKeySecret: string
  stsToken?: string
  expiration: string
}

export async function getUploadCredentials(
  fileType: string
): Promise<UploadCredentials> {
  const response = await Taro.request({
    url: `${SERVER_URL}/api/upload/credentials`,
    method: 'POST',
    data: { fileType }
  })

  if (response.statusCode !== 200) {
    throw new Error('Failed to get upload credentials')
  }

  return response.data
}

export async function uploadToOSS(
  filePath: string,
  fileType: string
): Promise<string> {
  const credentials = await getUploadCredentials(fileType)

  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: `https://${credentials.bucket}.${credentials.region}.aliyuncs.com`,
      filePath,
      name: 'file',
      formData: {
        key: credentials.objectKey,
        policy: '', // 需要后端生成
        OSSAccessKeyId: credentials.accessKeyId,
        signature: '', // 需要后端生成
        'x-oss-security-token': credentials.stsToken || '',
        success_action_status: '200'
      },
      success: (res) => {
        if (res.statusCode === 200) {
          const url = `https://${credentials.bucket}.${credentials.region}.aliyuncs.com/${credentials.objectKey}`
          resolve(url)
        } else {
          reject(new Error('Upload failed'))
        }
      },
      fail: reject
    })
  })
}

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
