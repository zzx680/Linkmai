import type { QuickReply } from '../../services/api'

const accidentLabels: Record<string, string> = {
  traffic_accident: '交通事故',
  work_injury: '工伤事故',
  personal_injury: '意外伤害',
}

const actionLabels: Record<string, string> = {
  confirm: '信息正确',
  'confirm:correct': '信息正确',
  edit: '修改信息',
  'confirm:edit': '需要修改',
  finish: '结束收集',
  no_more_materials: '结束收集',
  upload: '上传材料',
  generate_report: '查看报告',
  manual_input: '手动输入',
  'edit:accident_type': '事故类型',
  'edit:accident_date': '事故日期',
  'edit:accident_location': '事故地点',
  'edit:parties_involved': '涉事方信息',
  'edit:accident_description': '事故经过',
  'edit:liability': '责任认定',
}

function lookup(labels: Record<string, string>, value: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : undefined
}

export function getQuickReplyLabel(reply: QuickReply): string {
  return reply.label || reply.text || lookup(accidentLabels, reply.value) || lookup(actionLabels, reply.value) || reply.value
}

export function getQuickReplySelection(reply: QuickReply): { text: string; action?: string } {
  return {
    text: getQuickReplyLabel(reply),
    // Older responses omit action for manual_input. Keep controls separate
    // from the Chinese text saved and displayed in the conversation.
    action: reply.action || (lookup(actionLabels, reply.value) ? reply.value : undefined),
  }
}

export function getChatMessageText(content: string, role: string): string {
  // Compatibility for already-saved shortcut values; do not replace words
  // inside arbitrary user text or translate unknown identifiers.
  if (role === 'user') return lookup(accidentLabels, content) || lookup(actionLabels, content) || content
  if (role === 'assistant') {
    return content.replace(/(事故类型[：:]\s*)(traffic_accident|work_injury|personal_injury)(?=\s|$)/g,
      (_match, label: string, value: string) => label + accidentLabels[value])
  }
  return content
}
