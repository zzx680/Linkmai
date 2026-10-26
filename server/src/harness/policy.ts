import { Calculation, Control, Document, Fact, Workspace } from './types'
import { CALCULATOR_VERSION, fingerprint, money } from './calculator'

export const bundleSkill = Object.freeze({ id: 'case-bundle', version: 'case-bundle-v1', promptVersion: 'facts-template-v1',
  templateVersion: 'case-documents-v1', allowedStates: ['collecting','confirming','analyzing','analysis_available','review_pending','ready'],
  maxAttempts: 3, leaseMs: 30_000, tools: ['confirmed-facts','approved-laws','calculate','validate-draft'],
  forbiddenActions: ['assign-liability','invent-amounts','external-submit'], confirmationRequired: true })
export const SkillRegistry = { get: (name: string) => { if (name !== bundleSkill.id) throw new Error('UNKNOWN_SKILL'); return bundleSkill } }
// These first documents are controlled templates. No model receives personal data or writes monetary values.
export const ModelRouter = { snapshot: () => ({ provider: 'internal', modelId: 'deterministic-template', modelConfigVersion: 'v1' }) }
export function policyHash(control: Control): string {
  return fingerprint({ calculators: [...control.calculators].sort((a,b) => a.id.localeCompare(b.id)),
    parameters: [...control.parameters].sort((a,b) => a.id.localeCompare(b.id)), legal: [...control.legal].sort((a,b) => a.id.localeCompare(b.id)) })
}
export function contextHash(state: Workspace, control: Control): string {
  return fingerprint([state.revision, state.sourceHash, policyHash(control), bundleSkill.version])
}
export function currentLegalRefs(control: Control, date: string, jurisdiction: string): string[] {
  return control.legal.filter(ref => ref.active && ref.approved && ref.from <= date && (!ref.to || ref.to >= date)
    && (ref.jurisdiction === 'CN' || ref.jurisdiction === jurisdiction)).map(ref => ref.id)
}
export function requireCalculator(control: Control, date: string, jurisdiction: string) {
  const version = control.calculators.find(item => item.id === CALCULATOR_VERSION && item.status === 'approved')
  const legal = new Set(currentLegalRefs(control, date, jurisdiction))
  if (!version?.reviewedBy || !version.legalRefs.length || version.legalRefs.some(ref => !legal.has(ref))) throw new Error('CALCULATOR_NOT_APPROVED')
  return version
}
export function applicableParameters(control: Control, date: string, jurisdiction: string) {
  const legal = new Set(currentLegalRefs(control, date, jurisdiction))
  return control.parameters.filter(parameter => parameter.reviewedBy && parameter.legalRefs.length
    && parameter.legalRefs.every(ref => legal.has(ref)))
}
const mask = (value: string) => value.replace(/\b\d{17}[\dXx]\b/g, '[身份证号已遮盖]').replace(/\b1[3-9]\d{9}\b/g, '[手机号已遮盖]')
export const ContextBuilder = {
  build(state: Workspace) {
    if (state.conflicts.some(conflict => conflict.status === 'open')) throw new Error('FACT_CONFLICT')
    const facts = state.facts.filter(fact => fact.status === 'confirmed')
    if (!facts.length) throw new Error('FACTS_REQUIRED')
    if (facts.length > 300) throw new Error('CONTEXT_TOO_LARGE')
    const uniqueValues = new Map<string, string>()
    for (const fact of facts) {
      if (uniqueValues.has(fact.key) && uniqueValues.get(fact.key) !== fact.value) throw new Error('FACT_CONFLICT')
      uniqueValues.set(fact.key, fact.value)
    }
    const value = (key: string) => facts.find(fact => fact.key === key)?.value
    const accidentDate = value('accident_date') || ''
    const date = new Date(accidentDate)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(accidentDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== accidentDate) throw new Error('ACCIDENT_DATE_REQUIRED')
    const jurisdiction = value('jurisdiction') || ''
    if (!/^CN(?:-[A-Z0-9]{2,12}){0,2}$/.test(jurisdiction)) throw new Error('JURISDICTION_REQUIRED')
    return { facts, accidentDate, jurisdiction, displayFacts: facts.filter(f => !/identity|phone|address|身份证|电话|住址/.test(f.key))
      .map(fact => ({ ...fact, label: mask(fact.label), value: mask(fact.value.slice(0,2000)) })) }
  },
}
export const RiskValidator = {
  check(facts: Fact[], calculation: Calculation): string[] {
    const values = new Map(facts.map(fact => [fact.key, fact.value]))
    const text = facts.map(fact => fact.value).join('\n')
    const reasons: string[] = []
    if (/死亡|重伤|伤残|骨折|截肢|昏迷/.test(text)) reasons.push('SERIOUS_INJURY')
    if (/逃逸|酒驾|醉驾|毒驾|无证|刑事/.test(text)) reasons.push('CRIMINAL_RISK')
    if (/未成年|拒赔|诉讼|复核|时效/.test(text)) reasons.push('SPECIAL_OR_DEADLINE_RISK')
    if (!['none','minor'].includes(values.get('injury_severity') || '')) reasons.push('INJURY_SEVERITY_UNCONFIRMED')
    // Material fields are user-editable too. Until trusted triage is recorded by a reviewer,
    // neither an uploaded field nor a checkbox can waive the human risk screening.
    const supported = (key: string) => facts.some(f => f.key === key && f.value === 'yes' && f.source === 'material' && f.evidenceRefs.length > 0)
    reasons.push('RISK_SCREENING_REQUIRED')
    if (!supported('has_liability_document')) reasons.push('OFFICIAL_FINDING_MISSING')
    if (calculation.status !== 'complete') reasons.push(calculation.status === 'incomplete' ? 'CALCULATION_INCOMPLETE' : 'AMOUNT_EVIDENCE_REQUIRED')
    if ((calculation.totalCents || 0) >= 10_000_000) reasons.push('LARGE_AMOUNT')
    return [...new Set(reasons)]
  },
}
export function draftSections(type: Document['type'], state: Workspace, calculation: Calculation): Document['sections'] {
  const { displayFacts } = ContextBuilder.build(state)
  const facts = displayFacts.filter(fact => !fact.key.startsWith('claim_'))
  const shortages = calculation.missingInputs.map(key => `补充并确认：${key}`)
  if (type === 'evidence_catalog') return [{ title: '已确认信息与来源', paragraphs: facts.map(f => `${f.label}：${f.value}（事实 ${f.id}；来源 ${f.evidenceRefs.join('、') || '用户陈述，待凭证复核'}）`) },
    { title: '核对要求', paragraphs: ['目录只列出当前案件有效引用；材料是否足以证明争议事实仍需结合原件复核。'] }]
  if (type === 'action_plan') return [{ title: '材料补充清单', paragraphs: shortages.length ? shortages : ['当前计算字段已齐备，请继续核对原始票据和事故认定书。'] },
    { title: '下一步', paragraphs: ['核对事故日期、地区和事实来源。', '保存票据、病历、事故认定书及保险材料，避免遗漏。', '确认草稿；需人工复核的案件等待律师审核后再使用。', '涉及就医或法定期限时及时联系相关机构，不等待本系统处理。'] }]
  return [{ title: '已确认事故事实', paragraphs: facts.map(f => `${f.label}：${f.value}`) },
    { title: '损失项目试算', paragraphs: calculation.items.map(item => `${item.label}：${item.amountCents === undefined ? '输入不全，未计算' : money(item.amountCents)}；${item.formula}`) },
    { title: '计算范围', paragraphs: [calculation.totalCents === undefined ? '存在缺失输入，不提供确定总额。' : `所选损失项目合计：${money(calculation.totalCents)}。`,
      '这是基于已确认输入的损失项目试算，尚未扣除已付款、保险赔付或按责任比例分摊，不是最终可获赔金额。',
      '不自动认定事故责任；伤残、死亡等项目不在当前计算范围。', ...shortages] }]
}
export const OutputValidator = {
  validate(document: Document, state: Workspace, calculation: Calculation) {
    const facts = new Set(state.facts.filter(f => f.status === 'confirmed').map(f => f.id))
    const evidence = new Set(state.evidence.filter(e => e.status === 'active').map(e => e.id))
    if (document.inputRevision !== state.revision || document.contextHash !== state.contextHash || calculation.contextHash !== state.contextHash) throw new Error('INPUT_STALE')
    if (document.factRefs.some(ref => !facts.has(ref)) || document.evidenceRefs.some(ref => !evidence.has(ref))) throw new Error('INVALID_REFERENCE')
    const sameRefs = (actual: string[], expected: string[]) => fingerprint([...actual].sort()) === fingerprint([...new Set(expected)].sort())
    if (!sameRefs(document.factRefs, [...facts]) || !sameRefs(document.evidenceRefs, state.facts.filter(f => f.status === 'confirmed').flatMap(f => f.evidenceRefs))) throw new Error('INVALID_REFERENCE')
    if (document.skillVersion !== bundleSkill.version || document.promptVersion !== bundleSkill.promptVersion || document.templateVersion !== bundleSkill.templateVersion) throw new Error('INVALID_TEMPLATE_VERSION')
    if (document.calculationId !== calculation.id) throw new Error('INVALID_CALCULATION_REFERENCE')
    if (fingerprint(document.sections) !== fingerprint(draftSections(document.type, state, calculation))) throw new Error('DOCUMENT_TAMPERED')
  },
}
