import { CollectedFact } from './agent'
import { isEffective, jurisdictionMatches, LegalCitation, LegalReference, LegalSearchInput } from '../legal/types'

const legalFactTerms: Record<string, string[]> = {
  accident_description: ['交通事故', '责任', '损害赔偿'],
  liability: ['责任认定', '赔偿责任'],
  injury: ['人身损害', '医疗费', '误工费', '护理费'],
  vehicle_damage: ['财产损失', '车辆损失'],
  insurance: ['机动车保险', '交强险'],
}

export function accidentDateFromFacts(facts: CollectedFact[]): string | null {
  const value = facts.find(fact => fact.confirmed && fact.key === 'accident_date')?.value.trim()
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  return value
}

export function buildLegalSearchInput(facts: CollectedFact[], jurisdiction = 'CN'): LegalSearchInput {
  const accidentDate = accidentDateFromFacts(facts)
  if (!accidentDate) throw new Error('LEGAL_ACCIDENT_DATE_REQUIRED')
  const terms = new Set<string>(['道路交通事故', '机动车', '损害赔偿'])
  for (const fact of facts.filter(item => item.confirmed)) {
    for (const term of legalFactTerms[fact.key] || []) terms.add(term)
    if (fact.key === 'accident_description' || fact.key === 'liability') {
      for (const token of fact.value.split(/[，。；、\s]+/).filter(token => token.length >= 2 && token.length <= 12)) terms.add(token)
    }
  }
  return { query: [...terms].join(' '), accidentDate, jurisdiction, limit: 12 }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s，。；、：“”‘’（）()《》]/g, '')
}

export function rankLegalReferences(references: LegalReference[], input: LegalSearchInput): LegalReference[] {
  const terms = input.query.split(/\s+/).map(normalize).filter(Boolean)
  const articleNumbers = new Set((input.articleNumbers || []).map(normalize))
  return references
    .filter(reference => reference.reviewStatus === 'approved' && reference.status === 'active')
    .filter(reference => jurisdictionMatches(reference.jurisdiction, input.jurisdiction))
    .filter(reference => isEffective(reference, input.accidentDate))
    .map(reference => {
      const article = normalize(reference.articleNumber)
      const title = normalize(reference.title)
      const content = normalize(reference.content)
      const keywords = reference.keywords.map(normalize)
      let score = articleNumbers.has(article) ? 100 : 0
      for (const term of terms) {
        if (title.includes(term)) score += 12
        if (article.includes(term)) score += 20
        if (keywords.some(keyword => keyword.includes(term) || term.includes(keyword))) score += 8
        if (content.includes(term)) score += 3
      }
      return { ...reference, score }
    })
    .filter(reference => reference.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'zh-CN') || left.articleNumber.localeCompare(right.articleNumber, 'zh-CN'))
    .slice(0, input.limit || 12)
}

export function assertLegalCitations(citations: LegalCitation[], references: LegalReference[], accidentDate: string): void {
  if (!Array.isArray(citations) || citations.length === 0) throw new Error('LEGAL_CITATION_REQUIRED')
  const available = new Map(references.map(reference => [reference.legalRefId, reference]))
  for (const citation of citations) {
    if (!citation || typeof citation.legalRefId !== 'string' || typeof citation.proposition !== 'string' || !citation.proposition.trim() || typeof citation.supportingText !== 'string') {
      throw new Error('INVALID_LEGAL_CITATION')
    }
    const reference = available.get(citation.legalRefId)
    const supportingText = citation.supportingText.trim()
    const proposition = citation.proposition.trim()
    if (!reference || reference.reviewStatus !== 'approved' || reference.status !== 'active' || !isEffective(reference, accidentDate) || supportingText.length < 6 || proposition !== supportingText || !reference.content.includes(supportingText)) {
      throw new Error('INVALID_LEGAL_CITATION')
    }
  }
}
