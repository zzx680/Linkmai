import { createHash } from 'node:crypto'
import { Calculation, CalculationItem, CalculatorVersion, Fact, RegionalParameter } from './types'

export const CALCULATOR_VERSION = 'compensation-v1'
export const expenseDefinitions = [
  { code: 'medical', label: '医疗费', keys: ['medical_expense_cents'] },
  { code: 'lost_income', label: '误工损失', keys: ['lost_income_daily_cents', 'lost_work_days'] },
  { code: 'nursing', label: '护理费', keys: ['nursing_daily_cents', 'nursing_days', 'nursing_people'] },
  { code: 'transportation', label: '交通费', keys: ['transportation_expense_cents'] },
  { code: 'meals', label: '住院伙食补助费', keys: ['hospital_days'], parameter: 'meals_daily_cents' },
  { code: 'nutrition', label: '营养费', keys: ['nutrition_days'], parameter: 'nutrition_daily_cents' },
  { code: 'vehicle', label: '车辆损失', keys: ['vehicle_damage_cents'] },
] as const
export const numericFactKeys = new Set<string>(expenseDefinitions.flatMap(item => [...item.keys]))
export const fingerprint = (value: unknown) => {
  // PostgreSQL JSONB reorders object keys; fingerprints must survive persistence and restarts.
  const normalized = JSON.parse(JSON.stringify(value) ?? 'null')
  const canonical = (item: any): any => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item
  return createHash('sha256').update(JSON.stringify(canonical(normalized))).digest('hex')
}

// Decimal yuan are converted without floating-point multiplication or implicit rounding.
export function yuanToCents(value: string): number {
  if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) throw new Error('INVALID_MONEY')
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error('INVALID_MONEY')
  return cents
}
export function integerInput(value: string): number {
  if (!/^(0|[1-9]\d{0,11})$/.test(value)) throw new Error('INVALID_CALCULATION_INPUT')
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw new Error('INVALID_CALCULATION_INPUT')
  return result
}
export function calculate(input: {
  id: string; revision: number; contextHash: string; facts: Fact[]; jurisdiction: string; accidentDate: string
  version: CalculatorVersion; parameters: RegionalParameter[]
}): Calculation {
  if (input.version.id !== CALCULATOR_VERSION || input.version.status !== 'approved') throw new Error('CALCULATOR_NOT_APPROVED')
  const facts = new Map(input.facts.filter(f => f.status === 'confirmed').map(f => [f.key, f]))
  const items: CalculationItem[] = []
  for (const definition of expenseDefinitions) {
    // Claim scope is explicit. Excluded items are never interpreted as zero.
    const scope = facts.get(`claim_${definition.code}`)
    if (scope?.value === 'no') continue
    const missing: string[] = []
    if (scope?.value !== 'yes') missing.push(`claim_${definition.code}`)
    const used: Fact[] = scope ? [scope] : []
    const factors = definition.keys.map(key => {
      const fact = facts.get(key)
      if (!fact) { missing.push(key); return null }
      used.push(fact)
      const value = integerInput(fact.value)
      if ((key.endsWith('_days') && value > 36500) || (key === 'nursing_people' && (value < 1 || value > 10))) throw new Error('INVALID_CALCULATION_INPUT')
      return value
    })
    const parameterRefs: string[] = []
    if ('parameter' in definition) {
      const candidates = input.parameters.filter(p => p.code === definition.parameter && p.status === 'approved'
        && p.jurisdiction === input.jurisdiction && p.from <= input.accidentDate && (!p.to || p.to >= input.accidentDate))
      if (candidates.length !== 1) missing.push(definition.parameter)
      else {
        if (!Number.isSafeInteger(candidates[0].value) || candidates[0].value < 0 || candidates[0].value > 10_000_000) throw new Error('INVALID_PARAMETER')
        factors.push(candidates[0].value); parameterRefs.push(candidates[0].id)
      }
    }
    let amountCents: number | undefined
    if (!missing.length) {
      const product = factors.reduce<bigint>((sum, value) => sum * BigInt(value!), 1n)
      if (product > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CALCULATION_OVERFLOW')
      amountCents = Number(product)
    }
    items.push({ code: definition.code, label: definition.label, amountCents,
      formula: [...definition.keys, ...('parameter' in definition ? [definition.parameter] : [])].join(' × '),
      factRefs: used.map(f => f.id), parameterRefs, missingInputs: missing,
      requiresReview: used.some(f => numericFactKeys.has(f.key) && f.evidenceRefs.length === 0) })
  }
  const missingInputs = [...new Set(items.flatMap(item => item.missingInputs))]
  const sum = items.reduce((total, item) => total + BigInt(item.amountCents || 0), 0n)
  if (sum > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CALCULATION_OVERFLOW')
  return { id: input.id, inputRevision: input.revision, contextHash: input.contextHash, calculatorVersion: input.version.id,
    jurisdiction: input.jurisdiction, accidentDate: input.accidentDate, items, missingInputs,
    totalCents: missingInputs.length ? undefined : Number(sum),
    status: missingInputs.length ? 'incomplete' : items.some(item => item.requiresReview) ? 'requires_review' : 'complete' }
}
export const money = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')} 元`
