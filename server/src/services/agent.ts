// Agent 对话状态管理服务

export interface AgentState {
  stage: 'collecting' | 'confirming' | 'analyzing' | 'ready'
  collectedFacts: CollectedFact[]
  pendingConfirmation?: CollectedFact[]
  nextQuestion?: string
  quickReplies?: QuickReply[]
}

export interface CollectedFact {
  key: string
  label: string
  value: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  confirmed: boolean
  materialId?: string
}

export interface QuickReply {
  label: string
  value: string
  action?: string
}

// 必需字段定义
const REQUIRED_FACTS = [
  { key: 'accident_type', label: '事故类型' },
  { key: 'accident_date', label: '事故日期' },
  { key: 'accident_location', label: '事故地点' },
  { key: 'parties_involved', label: '涉事方信息' },
  { key: 'accident_description', label: '事故经过' },
]

/**
 * 根据已收集的事实生成下一个问题
 */
export function generateNextQuestion(state: AgentState): { question: string; quickReplies?: QuickReply[] } {
  const collected = state.collectedFacts.filter(f => f.confirmed)
  const collectedKeys = new Set(collected.map(f => f.key))

  // 找出第一个未收集的必需字段
  for (const required of REQUIRED_FACTS) {
    if (!collectedKeys.has(required.key)) {
      return getQuestionForFact(required.key, collected)
    }
  }

  // 所有必需字段已收集，询问是否有其他材料
  if (state.stage === 'collecting') {
    return {
      question: '已收集到主要信息。您还有其他材料需要补充吗？（如行车记录仪视频、现场照片等）',
      quickReplies: [
        { label: '上传材料', value: '', action: 'upload' },
        { label: '没有了', value: 'no_more_materials', action: 'confirm' },
      ],
    }
  }

  // 进入确认阶段
  return {
    question: '信息收集完成，我来帮您生成事故分析报告',
    quickReplies: [
      { label: '生成报告', value: '', action: 'generate_report' },
    ],
  }
}

/**
 * 根据字段类型生成提问
 */
function getQuestionForFact(key: string, collected: CollectedFact[]): { question: string; quickReplies?: QuickReply[] } {
  switch (key) {
    case 'accident_type':
      return {
        question: '请问您遇到了什么类型的事故？',
        quickReplies: [
          { label: '交通事故', value: 'traffic_accident' },
          { label: '工伤事故', value: 'work_injury' },
          { label: '意外伤害', value: 'personal_injury' },
        ],
      }

    case 'accident_date':
      return {
        question: '事故发生在什么时间？',
      }

    case 'accident_location':
      return {
        question: '事故发生在哪里？请描述具体地点。',
      }

    case 'parties_involved':
      const accidentType = collected.find(f => f.key === 'accident_type')?.value
      if (accidentType === 'traffic_accident') {
        return {
          question: '请提供对方车辆和驾驶员信息（如有交警认定书可直接上传）',
          quickReplies: [
            { label: '上传认定书', value: '', action: 'upload' },
            { label: '手动输入', value: 'manual_input' },
          ],
        }
      }
      return {
        question: '请提供涉事方的相关信息',
      }

    case 'accident_description':
      return {
        question: '请详细描述事故经过',
      }

    default:
      return {
        question: `请提供${key}相关信息`,
      }
  }
}

/**
 * 处理用户消息，更新状态
 */
export async function processUserMessage(
  state: AgentState,
  userMessage: string,
  materials?: Array<{ type: string; url: string; extractedData?: any }>
): Promise<AgentState> {
  const newState = { ...state }

  // 处理材料上传（OCR/AI 识别结果）
  if (materials && materials.length > 0) {
    for (const material of materials) {
      if (material.extractedData) {
        const facts = extractFactsFromMaterial(material)
        newState.collectedFacts.push(...facts)
      }
    }
  }

  // 处理文本消息
  if (userMessage) {
    const extractedFacts = extractFactsFromText(userMessage, state.collectedFacts)
    newState.collectedFacts.push(...extractedFacts)
  }

  // 更新下一个问题
  const next = generateNextQuestion(newState)
  newState.nextQuestion = next.question
  newState.quickReplies = next.quickReplies

  return newState
}

/**
 * 从材料中提取事实
 */
function extractFactsFromMaterial(material: { type: string; url: string; extractedData?: any }): CollectedFact[] {
  const facts: CollectedFact[] = []
  const data = material.extractedData

  if (!data) return facts

  // 从交警认定书中提取
  if (data.accident_date) {
    facts.push({
      key: 'accident_date',
      label: '事故日期',
      value: data.accident_date,
      source: 'ocr',
      confidence: 'high',
      confirmed: false,
      materialId: material.url,
    })
  }

  if (data.accident_location) {
    facts.push({
      key: 'accident_location',
      label: '事故地点',
      value: data.accident_location,
      source: 'ocr',
      confidence: 'high',
      confirmed: false,
      materialId: material.url,
    })
  }

  if (data.parties_a) {
    facts.push({
      key: 'parties_involved',
      label: '涉事方信息',
      value: `甲方：${data.parties_a}\n乙方：${data.parties_b || ''}`,
      source: 'ocr',
      confidence: 'high',
      confirmed: false,
      materialId: material.url,
    })
  }

  if (data.liability) {
    facts.push({
      key: 'liability',
      label: '责任认定',
      value: data.liability,
      source: 'ocr',
      confidence: 'high',
      confirmed: false,
      materialId: material.url,
    })
  }

  return facts
}

/**
 * 从文本中提取事实（简单版本）
 */
function extractFactsFromText(text: string, existingFacts: CollectedFact[]): CollectedFact[] {
  const facts: CollectedFact[] = []
  const collectedKeys = new Set(existingFacts.map(f => f.key))

  // 识别事故类型
  if (!collectedKeys.has('accident_type')) {
    if (text.includes('交通') || text.includes('车祸') || text.includes('追尾')) {
      facts.push({
        key: 'accident_type',
        label: '事故类型',
        value: 'traffic_accident',
        source: 'user_text',
        confidence: 'high',
        confirmed: true,
      })
    } else if (text.includes('工伤') || text.includes('上班') || text.includes('工作')) {
      facts.push({
        key: 'accident_type',
        label: '事故类型',
        value: 'work_injury',
        source: 'user_text',
        confidence: 'medium',
        confirmed: true,
      })
    }
  }

  // 识别日期（简单正则）
  if (!collectedKeys.has('accident_date')) {
    const dateMatch = text.match(/(\d{4}年\d{1,2}月\d{1,2}日)|(\d{1,2}月\d{1,2}日)|(今天)|(昨天)/)
    if (dateMatch) {
      facts.push({
        key: 'accident_date',
        label: '事故日期',
        value: dateMatch[0],
        source: 'user_text',
        confidence: 'medium',
        confirmed: true,
      })
    }
  }

  // 识别地点（简单关键词）
  if (!collectedKeys.has('accident_location') && text.length > 5) {
    const locationKeywords = ['在', '路', '街', '区', '市', '省', '号', '路口']
    if (locationKeywords.some(kw => text.includes(kw))) {
      facts.push({
        key: 'accident_location',
        label: '事故地点',
        value: text,
        source: 'user_text',
        confidence: 'low',
        confirmed: true,
      })
    }
  }

  return facts
}

/**
 * 检查是否可以生成报告
 */
export function canGenerateReport(state: AgentState): boolean {
  const confirmed = state.collectedFacts.filter(f => f.confirmed)
  const confirmedKeys = new Set(confirmed.map(f => f.key))

  // 至少需要：事故类型、日期、地点、经过描述
  const criticalFacts = ['accident_type', 'accident_date', 'accident_location', 'accident_description']
  return criticalFacts.every(key => confirmedKeys.has(key))
}
