import type { Case, CollectedFact, ReportReadiness } from '../../services/api'

const accidentTypes: Record<string, string> = {
  traffic_accident: '交通事故', work_injury: '工伤事故', personal_injury: '意外伤害'
}

export function getCaseInformation(item: Case, facts: CollectedFact[], readiness: ReportReadiness | null) {
  const byKey = new Map(facts.filter(fact => fact.value?.trim()).map(fact => [fact.key, fact]))
  for (const [key, label, value] of [
    ['accident_type', '事故类型', item.accidentType],
    ['accident_date', '事故日期', item.accidentDate]
  ] as const) {
    if (value && !byKey.has(key)) byKey.set(key, { key, label, value, confirmed: true })
  }
  const collected = [...byKey.values()].map(fact => ({
    ...fact,
    value: fact.unknown ? '暂不清楚' : fact.key === 'accident_type' ? accidentTypes[fact.value] || fact.value : fact.value
  }))
  return {
    confirmed: collected.filter(fact => fact.confirmed),
    pending: collected.filter(fact => !fact.confirmed),
    missing: (readiness?.missing || []).filter(fact => !byKey.has(fact.key))
  }
}
