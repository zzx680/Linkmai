import Ocr20191230, * as $Ocr20191230 from '@alicloud/ocr20191230'
import * as $OpenApi from '@alicloud/openapi-client'
import { config } from '../config'

// 创建 OCR 客户端
function createClient(): Ocr20191230 {
  const cfg = new $OpenApi.Config({
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
  })
  cfg.endpoint = 'ocr.cn-shanghai.aliyuncs.com'
  return new Ocr20191230(cfg)
}

export interface OcrResult {
  success: boolean
  text?: string
  fields?: Record<string, any>
  error?: string
}

/**
 * 通用文字识别 - 使用高精度版本
 */
export async function recognizeGeneral(imageUrl: string): Promise<OcrResult> {
  try {
    const client = createClient()
    const request = new $Ocr20191230.RecognizeTableRequest({
      imageURL: imageUrl,
    })

    const response = await client.recognizeTable(request)

    if (response.statusCode !== 200 || !response.body || !response.body.data) {
      return {
        success: false,
        error: 'OCR 识别失败',
      }
    }

    // 提取所有识别的文字
    const text = JSON.stringify(response.body.data)

    return {
      success: true,
      text,
    }
  } catch (err: any) {
    console.error('OCR 识别错误:', err)
    return {
      success: false,
      error: err.message || 'OCR 识别失败',
    }
  }
}

// OCR 服务导出
export const ocrService = {
  recognizeText: recognizeGeneral,
  recognizePoliceReport,
  recognizeIdCard,
  recognizeBusinessLicense,
}

/**
 * 交警认定书识别（使用通用 OCR + 结构化提取）
 */
export async function recognizePoliceReport(imageUrl: string): Promise<OcrResult> {
  try {
    // 先进行通用文字识别
    const generalResult = await recognizeGeneral(imageUrl)

    if (!generalResult.success || !generalResult.text) {
      return generalResult
    }

    return {
      success: true,
      text: generalResult.text,
      fields: {
        raw: generalResult.text,
      },
    }
  } catch (err: any) {
    console.error('交警认定书识别错误:', err)
    return {
      success: false,
      error: err.message || '识别失败',
    }
  }
}

/**
 * 身份证识别
 */
export async function recognizeIdCard(imageUrl: string): Promise<OcrResult> {
  try {
    const client = createClient()
    const request = new $Ocr20191230.RecognizeBankCardRequest({
      imageURL: imageUrl,
    })

    const response = await client.recognizeBankCard(request)

    if (response.statusCode !== 200 || !response.body || !response.body.data) {
      return {
        success: false,
        error: '身份证识别失败',
      }
    }

    const data = response.body.data

    return {
      success: true,
      fields: {
        bankName: data.bankName || '',
        cardNumber: data.cardNumber || '',
      },
    }
  } catch (err: any) {
    console.error('身份证识别错误:', err)
    return {
      success: false,
      error: err.message || '身份证识别失败',
    }
  }
}

/**
 * 营业执照识别
 */
export async function recognizeBusinessLicense(imageUrl: string): Promise<OcrResult> {
  try {
    const client = createClient()
    const request = new $Ocr20191230.RecognizeBusinessLicenseRequest({
      imageURL: imageUrl,
    })

    const response = await client.recognizeBusinessLicense(request)

    if (response.statusCode !== 200 || !response.body || !response.body.data) {
      return {
        success: false,
        error: '营业执照识别失败',
      }
    }

    const data = response.body.data

    return {
      success: true,
      fields: {
        name: data.name || '',
        type: data.type || '',
        address: data.address || '',
      },
    }
  } catch (err: any) {
    console.error('营业执照识别错误:', err)
    return {
      success: false,
      error: err.message || '营业执照识别失败',
    }
  }
}
