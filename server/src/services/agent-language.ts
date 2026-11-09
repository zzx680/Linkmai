import { config } from '../config'
import { callDeepSeek } from './deepseek'
import type { AgentState } from './agent'
import { caseAgentFactKeys, reportFactDefinitions, type CaseAgentContext } from '../harness/case-agent'

const keys = caseAgentFactKeys
export type FactKey = typeof keys[number]
export interface LanguageFact { key: FactKey; value: string; evidence: string }
export interface LanguageResult { facts: LanguageFact[]; reply: string; status?: 'model' }
export type MessageInterpreter = (state: AgentState, text: string, context?: CaseAgentContext) => Promise<LanguageResult>

export const CONVERSATION_SYSTEM_PROMPT = '你是交通事故律师，熟悉中国大陆交通事故处理、责任认定、保险理赔及人身损害赔偿。请结合对话上下文理解用户处境，先回答用户当前的问题，再给出具体、可执行的建议。信息不足时只追问必要问题，避免重复询问。区分已知事实与推测，不编造事实、法条或赔偿金额；结论取决于证据、地区或时间时，说明依据和不确定之处。使用自然、清晰、简洁的中文交流。'

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

// Action-only requests still need a user message, both now and in saved history.
export function conversationText(text: string, context?: Pick<CaseAgentContext, 'action' | 'attachedMaterials'>): string {
  const eventLabels: Record<string, string> = {
    confirm: '确认信息', edit: '修改信息', finish: '结束收集',
    upload: '上传材料', generate_report: '查看报告', manual_input: '手动输入',
  }
  const event = context?.action?.startsWith('edit:')
    ? `修改${reportFactDefinitions.find(fact => fact.key === context.action!.slice(5))?.label || '案件信息'}`
    : context?.action && Object.hasOwn(eventLabels, context.action) ? eventLabels[context.action] : ''
  return text.trim() || event || (context?.attachedMaterials?.length ? '上传了材料' : '')
}

// Build ordinary chat history separately from the single system prompt.
// The bounded history comes from the owned case snapshot.
export function conversationMessages(text: string, context?: CaseAgentContext): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let remaining = 48_000
  for (const item of [...(context?.recentMessages || [])].slice(-20).reverse()) {
    if ((item.role !== 'user' && item.role !== 'assistant') || !item.text.trim()) continue
    if (item.text.length > remaining) break
    messages.unshift({ role: item.role, content: item.text })
    remaining -= item.text.length
  }
  // A bounded window may begin with the previous answer; keep complete turns.
  while (messages[0]?.role === 'assistant') messages.shift()
  const content = conversationText(text, context)
  if (!content) throw new Error('MODEL_UNAVAILABLE')
  messages.push({ role: 'user', content })
  return messages
}

export const interpretUserMessage: MessageInterpreter = async (_state, text, context) => {
  if (!config.deepseek.apiKey) throw new Error('MODEL_UNAVAILABLE')
  try {
    const response = await callDeepSeek([
      { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
      ...conversationMessages(text, context),
    ], { timeoutMs: 6500 })
    const reply = response.choices?.[0]?.message?.content
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('MODEL_UNAVAILABLE')
    return { facts: [], reply: reply.trim(), status: 'model' }
  } catch {
    throw new Error('MODEL_UNAVAILABLE')
  }
}
