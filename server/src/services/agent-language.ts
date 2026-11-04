import { z } from 'zod'
import { config } from '../config'
import { callDeepSeek } from './deepseek'
import type { AgentState } from './agent'
import { caseAgentFactKeys, caseAgentPrompt, type CaseAgentContext } from '../harness/case-agent'

const keys = caseAgentFactKeys
export type FactKey = typeof keys[number]
export interface LanguageFact { key: FactKey; value: string; evidence: string }
export interface LanguageResult { facts: LanguageFact[]; reply: string; status?: 'model' }
export type MessageInterpreter = (state: AgentState, text: string, context?: CaseAgentContext) => Promise<LanguageResult>

const resultSchema = z.object({
  facts: z.array(z.object({
    key: z.enum(keys), value: z.string().trim().min(1).max(3000),
    evidence: z.string().trim().min(1).max(3000),
  }).strict()).max(keys.length),
  reply: z.string().trim().min(1).max(1200),
}).strict()

export function isGreeting(text: string) {
  return /^(?:你好|您好|嗨|哈喽|hello|hi)[\s，。！？,.!?]*$/i.test(text.trim())
}

export function isAcknowledgement(text: string) {
  return /^(嗯+|哦+|好[的啊呀]?|行|可以|知道了|明白了|收到|谢谢[你您]?|不清楚|不知道|还不知道|暂时不知道|没有|不记得)[\s，。！？,.!?]*$/.test(text.trim())
}

export function isQuestion(text: string) {
  return /[？?]|怎么|干嘛|能否|能不能|请问|(?:吗|呢)[\s。！!]*$/.test(text)
}

export function detectAccidentType(text: string): string | undefined {
  // Check road collisions before work-related context such as “下班路上”.
  if (text === 'traffic_accident' || /交通事故|车祸|追尾|撞车|车辆.*碰撞|(?:车|汽车|轿车|货车|电动[车自]|摩托|自行车|司机).{0,35}(?:撞|碰|剐|刮)|(?:撞|碰|剐|刮).{0,20}(?:车|司机)|过马路.{0,20}撞/.test(text)) return 'traffic_accident'
  if (text === 'work_injury' || /工伤|工作时.{0,20}(?:受伤|摔|砸)|上班时.{0,20}(?:受伤|摔|砸)/.test(text)) return 'work_injury'
  if (text === 'personal_injury' || /意外伤害|意外受伤|摔伤/.test(text)) return 'personal_injury'
}

export function validFactValue(key: string, text: string) {
  const value = text.trim()
  if (!value || isAcknowledgement(value)) return false
  if (key === 'accident_type') return Boolean(detectAccidentType(value))
  if (key === 'accident_date') return !isQuestion(value) && /(?:\d{4}[-年/.]\d{1,2}|\d{1,2}月\d{1,2}[日号]?|今天|昨天|前天|昨晚|今晚|昨[天日]晚上|今[天日]早上|上周[一二三四五六日天]|星期[一二三四五六日天]|周[一二三四五六日天]|\d{1,2}[:：点时]|[一二三四五六七八九十两]{1,3}点)/.test(value)
  if (key === 'accident_location') return value.length >= 2 && !/[？?]|^(怎么办|怎么处理|应该|能不能|请问)/.test(value)
  if (key === 'parties_involved') return value.length >= 2 && !/[？?]|^(怎么办|怎么处理|应该|能不能|请问)/.test(value)
  if (key === 'accident_description') return value.length >= 4 && !/^(我想|我要|开始|请帮我)(描述|口述|讲述)/.test(value)
  return value.length >= 2
}

export function localMessageFacts(text: string): LanguageFact[] {
  if (isAcknowledgement(text)) return []
  if (/如果|假如|假设|举个例子|没有发生|并未发生/.test(text)) return []
  if (isQuestion(text) && !/撞|碰撞|追尾|摔倒|摔伤|砸伤|发生.{0,6}事故|事故发生/.test(text)) return []
  const facts: LanguageFact[] = []
  const type = detectAccidentType(text)
  if (type) facts.push({ key: 'accident_type', value: type, evidence: text })
  const date = text.match(/\d{4}[-年/.]\d{1,2}[-月/.]\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]?|今天|昨天|前天|昨晚|上周[一二三四五六日天]|星期[一二三四五六日天]|周[一二三四五六日天]/)?.[0]
  if (date) facts.push({ key: 'accident_date', value: date, evidence: date })
  const location = text.match(/(?:在|地点[是为：:]?)([^，。！？\n]{2,35}(?:路口|交叉口|路段|大街|大道|街道|高速|停车场|小区门口|学校门口))/)?.[1]
  if (location) facts.push({ key: 'accident_location', value: location, evidence: location })
  // Keep the user's words; “红绿灯” alone does not identify a specific location.
  const parties = text.match(/(?:被|和|与)([^，。！？\n]{1,30}(?:汽车|轿车|货车|电动车|摩托车|自行车|行人|司机|驾驶员))/)?.[1]
  if (parties) facts.push({ key: 'parties_involved', value: parties, evidence: parties })
  if (/(?:撞|碰撞|追尾|剐蹭|刮蹭|摔倒|摔伤|砸伤)/.test(text) && text.length >= 8) {
    facts.push({ key: 'accident_description', value: text.slice(0, 3000), evidence: text.slice(0, 3000) })
  }
  return facts
}

export function contextualAdvice(text: string): string {
  if (/(?:特别|很|剧烈|一直|非常).{0,4}(?:痛|疼)|(?:撞|摔|受伤).{0,30}(?:痛|疼)|(?:头晕|出血|昏迷|呼吸困难|站不起来)/.test(text)
    && !/(?:没有|没|不)(?:有)?(?:疼痛|痛|疼|头晕|出血)/.test(text)) {
    return '你提到撞倒后疼痛，先确保人身安全，尽快就医检查；若疼痛剧烈、头晕、出血或无法活动，请拨打 120 并避免勉强移动\n尚未报警可拨打 122／110，条件允许时保留现场照片、对方车牌和联系方式，并保存病历及费用票据；不要为收集材料耽误就医'
  }
  if (/诉状|起诉书|文书|PDF|Word|word|导出|赔偿报告/.test(text)) {
    return '目前可在核对材料并解锁案件后生成包含赔偿建议的事故分析报告，暂不支持生成诉状或导出 PDF／Word 文件'
  }
  if (/(?:现在|接下来|下一步).{0,6}(?:怎么办|干嘛|做什么)|该怎么办|应该怎么|怎么处理/.test(text)) {
    return '先确保现场安全；有伤情先就医，未报警可联系 122／110 记录事故，条件允许时保留现场照片、对方车辆信息和就医票据，再根据认定书及实际损失核对后续处理事项'
  }
  return ''
}

// Model facts must quote literal evidence from this user's message. Unknown
// fields, instructions masquerading as fields, and invented values are rejected.
export function parseLanguageResult(raw: string, text: string): LanguageResult {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = resultSchema.parse(JSON.parse(json))
  const facts = parsed.facts.filter(fact => text.includes(fact.evidence)
    && (fact.key === 'accident_type'
      ? ['traffic_accident', 'work_injury', 'personal_injury'].includes(fact.value) && detectAccidentType(fact.evidence) === fact.value
      : fact.evidence.includes(fact.value) && validFactValue(fact.key, fact.value)))
  return { facts, reply: parsed.reply }
}

export const interpretUserMessage: MessageInterpreter = async (state, text, context) => {
  if (!config.deepseek.apiKey) throw new Error('MODEL_UNAVAILABLE')
  const prompt = caseAgentPrompt(state, text, context)
  try {
    const response = await callDeepSeek([
      { role: 'system', content: prompt.instructions },
      { role: 'user', content: JSON.stringify(prompt.input) },
    ], { temperature: 0.3, maxTokens: 1200, timeoutMs: 6500 })
    return { ...parseLanguageResult(response.choices[0].message.content, text), status: 'model' }
  } catch {
    throw new Error('MODEL_UNAVAILABLE')
  }
}
