// 材料识别服务
import { ocrService } from './ocr'
import { analyzeText } from './deepseek'

export interface MaterialField {
  key: string
  label: string
  value: string
  confidence: 'high' | 'medium' | 'low'
}

export interface MaterialProcessResult {
  type: string
  fields: MaterialField[]
  rawText?: string
}

/**
 * 处理上传的材料（OCR + AI 提取）
 */
export async function processMaterial(
  materialType: string,
  imageUrl: string
): Promise<MaterialProcessResult> {
  try {
    // 1. OCR 识别文字
    const ocrResult = await ocrService.recognizeText(imageUrl)
    const rawText = ocrResult.text || ''

    // 2. 根据材料类型调用 DeepSeek 提取结构化字段
    const fields = await extractFieldsByType(materialType, rawText, imageUrl)

    return {
      type: materialType,
      fields,
      rawText,
    }
  } catch (error) {
    console.error('材料处理失败:', error)
    throw error
  }
}

/**
 * 根据材料类型提取字段
 */
async function extractFieldsByType(
  type: string,
  ocrText: string,
  imageUrl: string
): Promise<MaterialField[]> {
  switch (type) {
    case 'police-report':
      return extractPoliceReportFields(ocrText, imageUrl)

    case 'medical-record':
      return extractMedicalFields(ocrText)

    case 'damage-photo':
      return extractDamageFields(imageUrl)

    case 'invoice':
      return extractInvoiceFields(ocrText)

    default:
      return extractGenericFields(ocrText)
  }
}

/**
 * 提取交警认定书字段
 */
async function extractPoliceReportFields(
  ocrText: string,
  imageUrl: string
): Promise<MaterialField[]> {
  const prompt = `
你是一个专业的交通事故材料分析助手。请从以下交警认定书的 OCR 文本中提取关键信息：

OCR 文本：
${ocrText}

请提取以下字段（JSON 格式）：
{
  "accident_date": "事故日期",
  "accident_location": "事故地点",
  "parties_a": "甲方信息（姓名、车牌号）",
  "parties_b": "乙方信息（姓名、车牌号）",
  "liability": "责任认定（如：甲方全责、双方同等责任等）",
  "accident_description": "事故经过简述"
}

如果某个字段无法提取，设为 null。
`.trim()

  const response = await analyzeText(prompt)
  const extracted = parseJsonFromResponse(response)

  const fields: MaterialField[] = []

  if (extracted.accident_date) {
    fields.push({
      key: 'accident_date',
      label: '事故日期',
      value: extracted.accident_date,
      confidence: 'high',
    })
  }

  if (extracted.accident_location) {
    fields.push({
      key: 'accident_location',
      label: '事故地点',
      value: extracted.accident_location,
      confidence: 'high',
    })
  }

  if (extracted.parties_a) {
    fields.push({
      key: 'parties_a',
      label: '甲方',
      value: extracted.parties_a,
      confidence: 'high',
    })
  }

  if (extracted.parties_b) {
    fields.push({
      key: 'parties_b',
      label: '乙方',
      value: extracted.parties_b,
      confidence: 'high',
    })
  }

  if (extracted.liability) {
    fields.push({
      key: 'liability',
      label: '责任认定',
      value: extracted.liability,
      confidence: 'high',
    })
  }

  if (extracted.accident_description) {
    fields.push({
      key: 'accident_description',
      label: '事故经过',
      value: extracted.accident_description,
      confidence: 'medium',
    })
  }

  return fields
}

/**
 * 提取医疗材料字段
 */
async function extractMedicalFields(ocrText: string): Promise<MaterialField[]> {
  const prompt = `
从以下医疗材料的 OCR 文本中提取信息：

${ocrText}

提取字段（JSON）：
{
  "patient_name": "患者姓名",
  "diagnosis": "诊断结果",
  "treatment_date": "就诊日期",
  "medical_cost": "医疗费用（数字）",
  "hospital": "医院名称"
}
`.trim()

  const response = await analyzeText(prompt)
  const extracted = parseJsonFromResponse(response)

  const fields: MaterialField[] = []

  Object.entries(extracted).forEach(([key, value]) => {
    if (value) {
      fields.push({
        key,
        label: getLabelForKey(key),
        value: String(value),
        confidence: 'medium',
      })
    }
  })

  return fields
}

/**
 * 提取车损照片信息（使用 Vision API）
 */
async function extractDamageFields(imageUrl: string): Promise<MaterialField[]> {
  const prompt = '请描述图片中的车辆损伤情况，包括损伤部位、严重程度等。'

  const response = await analyzeText(prompt, [imageUrl])

  return [
    {
      key: 'damage_description',
      label: '损伤描述',
      value: response,
      confidence: 'medium',
    },
  ]
}

/**
 * 提取发票字段
 */
async function extractInvoiceFields(ocrText: string): Promise<MaterialField[]> {
  const prompt = `
从发票 OCR 文本中提取：

${ocrText}

提取（JSON）：
{
  "invoice_number": "发票号码",
  "amount": "金额",
  "date": "日期",
  "item": "项目/品名"
}
`.trim()

  const response = await analyzeText(prompt)
  const extracted = parseJsonFromResponse(response)

  const fields: MaterialField[] = []

  Object.entries(extracted).forEach(([key, value]) => {
    if (value) {
      fields.push({
        key,
        label: getLabelForKey(key),
        value: String(value),
        confidence: 'high',
      })
    }
  })

  return fields
}

/**
 * 通用字段提取
 */
async function extractGenericFields(ocrText: string): Promise<MaterialField[]> {
  return [
    {
      key: 'raw_text',
      label: '识别文本',
      value: ocrText,
      confidence: 'low',
    },
  ]
}

/**
 * 从 AI 响应中解析 JSON
 */
function parseJsonFromResponse(response: string): any {
  try {
    // 尝试直接解析
    return JSON.parse(response)
  } catch {
    // 尝试提取 JSON 代码块
    const match = response.match(/```json\s*([\s\S]*?)\s*```/)
    if (match) {
      return JSON.parse(match[1])
    }

    // 尝试提取花括号内容
    const objMatch = response.match(/\{[\s\S]*\}/)
    if (objMatch) {
      return JSON.parse(objMatch[0])
    }

    return {}
  }
}

/**
 * 获取字段的中文标签
 */
function getLabelForKey(key: string): string {
  const labels: Record<string, string> = {
    patient_name: '患者姓名',
    diagnosis: '诊断',
    treatment_date: '就诊日期',
    medical_cost: '医疗费用',
    hospital: '医院',
    invoice_number: '发票号',
    amount: '金额',
    date: '日期',
    item: '项目',
    damage_description: '损伤描述',
  }

  return labels[key] || key
}
