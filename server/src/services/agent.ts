import { recognizeGeneral, recognizePoliceReport } from './ocr'
import { analyzeWithDeepSeek } from './deepseek'

export interface AgentState {
  stage: 'idle' | 'collecting' | 'confirming' | 'analyzing' | 'ready'
  materials: Material[]
  facts: Fact[]
  nextQuestion?: string
  quickReplies?: QuickReply[]
}

export interface Material {
  id: string
  type: 'police-report' | 'medical' | 'damage' | 'image' | 'other'
  url: string
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  extractedFields?: Record<string, any>
  confidence?: 'high' | 'medium' | 'low'
}

export interface Fact {
  key: string
  label: string
  value: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  confirmed: boolean
}

export interface QuickReply {
  label: string
  value: string
}

/**
 * 处理上传的材料
 */
export async function processMaterial(
  materialType: string,
  imageUrl: string
): Promise<{ fields: Fact[]; confidence: string }> {
  try {
    let ocrResult

    // 根据材料类型选择 OCR 方法
    if (materialType === 'police-report') {
      ocrResult = await recognizePoliceReport(imageUrl)
    } else {
      ocrResult = await recognizeGeneral(imageUrl)
    }

    if (!ocrResult.success || !ocrResult.text) {
      throw new Error(ocrResult.error || 'OCR 识别失败')
    }

    // 使用 DeepSeek 提取结构化字段
    const extractedFields = await extractFieldsWithAI(materialType, ocrResult.text)

    return {
      fields: extractedFields,
      confidence: 'medium',
    }
  } catch (err: any) {
    console.error('材料处理错误:', err)
    throw err
  }
}

/**
 * 使用 AI 提取结构化字段
 */
async function extractFieldsWithAI(materialType: string, text: string): Promise<Fact[]> {
  const prompt = buildExtractionPrompt(materialType, text)

  try {
    const result = await analyzeWithDeepSeek(prompt)

    // 解析 AI 返回的结构化数据
    const parsed = parseAIResponse(result)

    return parsed
  } catch (err) {
    console.error('AI 字段提取失败:', err)
    // 返回原始文本作为兜底
    return [
      {
        key: 'raw_text',
        label: '识别文本',
        value: text,
        source: '材料识别',
        confidence: 'low',
        confirmed: false,
      },
    ]
  }
}

function buildExtractionPrompt(materialType: string, text: string): string {
  if (materialType === 'police-report') {
    return `请从以下交警认定书文本中提取关键信息，以 JSON 格式返回：

文本内容：
${text}

需要提取的字段（如果没有则返回 null）：
- 事故时间 (accidentTime)
- 事故地点 (location)
- 事故类型 (accidentType): 追尾/侧碰/对撞等
- 责任划分 (liability): 全责/主要责任/同等责任/次要责任/无责
- 当事人信息 (parties): [{ name, vehicle, responsibility }]
- 人员伤亡 (casualties): 是否有人员受伤或死亡
- 车辆损失 (damage): 描述

返回格式示例：
\`\`\`json
{
  "accidentTime": "2026年9月12日15:30",
  "location": "杭州市西湖区文一路",
  "accidentType": "追尾",
  "liability": "对方全责",
  "casualties": "无人员伤亡",
  "damage": "车辆后部受损"
}
\`\`\`

只返回 JSON，不要其他解释文字。`
  }

  return `请从以下文本中提取关键信息，以 JSON 格式返回：

${text}

返回格式：{ "summary": "文本摘要", "keyPoints": ["要点1", "要点2"] }`
}

function parseAIResponse(response: string): Fact[] {
  try {
    // 提取 JSON 部分
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('无法解析 AI 响应')
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const data = JSON.parse(jsonStr)

    // 转换为 Fact 数组
    const facts: Fact[] = []

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        facts.push({
          key,
          label: fieldLabelMap[key] || key,
          value: String(value),
          source: '交警认定书',
          confidence: 'high',
          confirmed: false,
        })
      }
    }

    return facts
  } catch (err) {
    console.error('解析 AI 响应失败:', err)
    return []
  }
}

const fieldLabelMap: Record<string, string> = {
  accidentTime: '事故时间',
  location: '事故地点',
  accidentType: '事故类型',
  liability: '责任划分',
  casualties: '人员伤亡',
  damage: '车辆损失',
  parties: '当事人',
}

/**
 * 生成下一个问题
 */
export function generateNextQuestion(facts: Fact[]): { question: string; options: QuickReply[] } {
  // 检查缺失的关键字段
  const hasLiability = facts.some((f) => f.key === 'liability' && f.confirmed)
  const hasCasualties = facts.some((f) => f.key === 'casualties' && f.confirmed)
  const hasDamage = facts.some((f) => f.key === 'damage' && f.confirmed)

  if (!hasLiability) {
    return {
      question: '事故责任是如何划分的？',
      options: [
        { label: '对方全责', value: 'liability:对方全责' },
        { label: '我方全责', value: 'liability:我方全责' },
        { label: '双方同等责任', value: 'liability:同等责任' },
        { label: '对方主要责任', value: 'liability:对方主要责任' },
      ],
    }
  }

  if (!hasCasualties) {
    return {
      question: '事故中是否有人员受伤？',
      options: [
        { label: '没有人员受伤', value: 'casualties:无' },
        { label: '有人受伤，已就医', value: 'casualties:有人受伤' },
        { label: '伤情严重，在治疗中', value: 'casualties:严重受伤' },
      ],
    }
  }

  if (!hasDamage) {
    return {
      question: '车辆损失情况如何？',
      options: [
        { label: '轻微刮擦', value: 'damage:轻微' },
        { label: '中度损坏', value: 'damage:中度' },
        { label: '严重损毁', value: 'damage:严重' },
      ],
    }
  }

  // 所有关键信息已收集
  return {
    question: '信息已收集完成，是否生成分析报告？',
    options: [
      { label: '生成报告', value: 'action:generate-report' },
      { label: '补充更多材料', value: 'action:add-material' },
    ],
  }
}
