import OSS from 'ali-oss'
import { randomUUID } from 'crypto'
import { config } from '../config'

let client: OSS | null = null

function getClient(): OSS {
  if (!client) {
    client = new OSS({
      region: config.oss.region,
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      bucket: config.oss.bucket,
      secure: true,
    })
  }
  return client
}

export interface UploadResult {
  url: string
  key: string
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
  const ext = filename.split('.').pop()?.toLowerCase()
  const safeExtension = ext && /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin'
  const objectName = `${folder}/${Date.now()}-${randomUUID()}.${safeExtension}`

  const result = await client.put(objectName, buffer, { headers: { 'x-oss-object-acl': 'private' } })

  return {
    url: result.url,
    key: objectName,
    name: objectName,
    size: buffer.length,
  }
}

export async function uploadUserAvatar(
  userId: string,
  buffer: Buffer,
  extension: string
): Promise<UploadResult> {
  const client = getClient()
  const objectName = `avatars/${userId}/avatar`
  const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
  const result = await client.put(objectName, buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, max-age=0',
      'x-oss-object-acl': 'private',
    },
  })
  return { url: result.url, key: objectName, name: objectName, size: buffer.length }
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
  const objectKey = `cases/${caseId}/${fileType}/${Date.now()}-${randomUUID()}.${ext}`

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
export async function getSignedUrl(objectName: string, expires = 3600): Promise<string> {
  const client = getClient()
  return client.signatureUrl(objectName, {
    expires,
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
