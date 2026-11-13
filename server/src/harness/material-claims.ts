// Deterministic bridge from confirmed material fields to calculator fact keys.
// Only explicit, unambiguous mappings are produced. Anything else stays a manual
// choice so the system never invents which loss item an amount belongs to.
import { Sources, Workspace } from './types'
import { fingerprint, yuanToCents } from './calculator'

export interface MaterialClaimCandidate {
  id: string
  key: string | null
  label: string
  // Total for this loss item across every confirmed material, so accepting a newly
  // uploaded receipt never drops the ones already counted.
  amountCents: number
  // How much of the total is not yet part of the calculation.
  pendingCents: number
  evidenceIds: string[]
  sourceLabel: string
  alternatives: string[]
}

const CLAIM_LABEL: Record<string, string> = {
  medical_expense_cents: '医疗费',
  transportation_expense_cents: '交通费',
  vehicle_damage_cents: '车辆损失',
}

// primary key per loss item, used when accepting a claim to mark the scope as claimed
export const claimCodeByKey: Readonly<Record<string, string>> = Object.freeze({
  medical_expense_cents: 'medical',
  transportation_expense_cents: 'transportation',
  vehicle_damage_cents: 'vehicle',
})

export const claimableFactKeys: ReadonlySet<string> = new Set(Object.keys(claimCodeByKey))

// Materials whose OCR values are amounts. Kept next to the mapping so a new
// material type cannot silently start feeding the calculator.
const MEDICAL_FIELDS = new Set(['medical_cost', 'amount'])
const INVOICE_ITEM_MATCHERS: Array<[RegExp, string]> = [
  [/医疗|医药|挂号|住院|诊查|诊费|检查费|药费|护理/, 'medical_expense_cents'],
  [/维修|配件|钣金|喷漆|车损|定损|拖车|施救/, 'vehicle_damage_cents'],
  [/交通|打车|出租|网约车|代驾|停车/, 'transportation_expense_cents'],
]

// OCR output is free text: strip currency marks, separators and full-width digits
// before the strict cents parser decides whether this is a usable amount.
export function normalizeAmountText(raw: string): string | null {
  const cleaned = raw
    .replace(/[０-９．]/g, char => char === '．' ? '.' : String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[¥￥,，\s]/g, '')
    .replace(/^人民币/, '')
    .replace(/元$/, '')
  if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(cleaned)) return null
  try {
    const cents = yuanToCents(cleaned)
    // A zero-amount receipt says nothing about a loss item.
    return cents > 0 ? String(cents) : null
  } catch {
    return null
  }
}

export function mapMaterialAmount(
  artifactType: string,
  fieldKey: string,
  value: string,
  fields: Array<{ key: string; value: string }>,
): { key: string | null; label: string; alternatives: string[] } | null {
  if (!normalizeAmountText(value)) return null

  if (artifactType === 'medical_record' && MEDICAL_FIELDS.has(fieldKey)) {
    return { key: 'medical_expense_cents', label: CLAIM_LABEL.medical_expense_cents, alternatives: [] }
  }

  if (artifactType === 'invoice' && (fieldKey === 'amount' || fieldKey === 'item')) {
    const item = fields.find(field => field.key === 'item')?.value || ''
    const matches = INVOICE_ITEM_MATCHERS.filter(([pattern]) => pattern.test(item))
    // No keyword, or several conflicting keywords: the user chooses, we never guess.
    if (matches.length === 1) return { key: matches[0][1], label: CLAIM_LABEL[matches[0][1]], alternatives: [] }
    return { key: null, label: '发票金额', alternatives: Object.keys(CLAIM_LABEL) }
  }

  return null
}

export function materialClaimCandidates(state: Workspace, sources: Sources): MaterialClaimCandidate[] {
  const aggregated = new Map<string, { evidenceIds: string[]; amountCents: number; pendingCents: number; label: string }>()
  const unattached: MaterialClaimCandidate[] = []

  for (const artifact of sources.artifacts) {
    if (!artifact.metadata?.confirmed) continue
    const fields = artifact.metadata.fields || []
    for (const field of fields) {
      const mapped = mapMaterialAmount(artifact.type, field.key, String(field.value), fields)
      if (!mapped) continue
      const amountCents = Number(normalizeAmountText(String(field.value)))
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) continue
      const evidenceId = fingerprint(['evidence', fingerprint([artifact.id, field.key, field.value])])
      if (!state.evidence.some(item => item.id === evidenceId && item.status === 'active')) continue

      if (!mapped.key) {
        // Ambiguous invoices stay one-at-a-time so two unrelated receipts cannot be merged.
        if (unattached.some(item => item.evidenceIds.includes(evidenceId))) continue
        unattached.push({ id: `unassigned:${evidenceId}`, key: null, label: mapped.label, amountCents, pendingCents: amountCents,
          evidenceIds: [evidenceId], sourceLabel: mapped.label, alternatives: mapped.alternatives })
        continue
      }

      const key = mapped.key
      const counted = state.facts.some(fact => fact.key === key && fact.status === 'confirmed' && fact.evidenceRefs.includes(evidenceId))
      const entry = aggregated.get(key) || { evidenceIds: [], amountCents: 0, pendingCents: 0, label: mapped.label }
      if (entry.evidenceIds.includes(evidenceId)) continue
      entry.evidenceIds.push(evidenceId)
      entry.amountCents += amountCents
      if (!counted) entry.pendingCents += amountCents
      aggregated.set(key, entry)
    }
  }

  const results: MaterialClaimCandidate[] = []
  for (const [key, entry] of aggregated) {
    // Only offer the item while some material amount is still missing from the calculation.
    if (entry.pendingCents <= 0) continue
    results.push({ id: `claim:${key}`, key, label: entry.label, amountCents: entry.amountCents,
      pendingCents: entry.pendingCents, evidenceIds: entry.evidenceIds, sourceLabel: entry.label, alternatives: [] })
  }
  return [...results, ...unattached]
}
