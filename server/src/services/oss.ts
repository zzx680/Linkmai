import OSS from 'ali-oss'
import { v4 as uuidv4 } from 'uuid'

let client: OSS | null = null

function getClient(): OSS {
  if (!client) {
    client = new OSS({
      region: process.env.ALIYUN_OSS_REGION || '',
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
      bucket: process.env.ALIYUN_OSS_BUCKET || '',
    })
  }
  return client
}

export interface UploadResult {
  url: string
  name: string
  size: number
}

export enum FileType {
  PHOTO = 'photo',
  VIDEO = 'video',
  DOCUMENT = 'document',
}

export interface UploadCredentials {
  url: string
  objectKey: string
  headers: Record<string, string>
}

/**
 * 上传文件到 OSS
 * @param buffer 文件 buffer
 * @param filename 原始文件名
 * @param folder 存储文件夹（如 'accident-photos'）
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  folder: string = 'uploads'
): Promise<UploadResult> {
  const client = getClient()
  const ext = filename.split('.').pop()
  const objectName = `${folder}/${Date.now()}-${uuidv4()}.${ext}`

  const result = await client.put(objectName, buffer)

  return {
    url: result.url,
    name: objectName,
    size: buffer.length,
  }
}

/**
 * 获取上传凭证（用于小程序直传 OSS）
 */
export async function getUploadCredentials(
  userId: string,
  caseId: string,
  fileType: FileType,
  filename: string
): Promise<UploadCredentials> {
  const client = getClient()
  const ext = filename.split('.').pop()
  const objectKey = `cases/${caseId}/${fileType}/${Date.now()}-${uuidv4()}.${ext}`

  const url = client.signatureUrl(objectKey, {
    method: 'PUT',
    expires: 3600,
    'Content-Type': getMimeType(fileType),
  })

  return {
    url,
    objectKey,
    headers: {
      'Content-Type': getMimeType(fileType),
    },
  }
}

function getMimeType(fileType: FileType): string {
  switch (fileType) {
    case FileType.PHOTO:
      return 'image/jpeg'
    case FileType.VIDEO:
      return 'video/mp4'
    case FileType.DOCUMENT:
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

/**
 * 生成临时访问签名 URL（1小时有效）
 */
export async function getSignedUrl(objectName: string): Promise<string> {
  const client = getClient()
  return client.signatureUrl(objectName, {
    expires: 3600,
  })
}

/**
 * 删除文件
 */
export async function deleteFile(objectName: string): Promise<void> {
  const client = getClient()
  await client.delete(objectName)
}

/**
 * 批量删除文件
 */
export async function deleteFiles(objectNames: string[]): Promise<void> {
  const client = getClient()
  await client.deleteMulti(objectNames, { quiet: true })
}
