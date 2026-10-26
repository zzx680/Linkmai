import { createHash } from 'node:crypto'

export type LegalReviewStatus = 'pending' | 'approved' | 'rejected'
export type LegalDocumentStatus = 'active' | 'repealed' | 'superseded'

export interface LegalDocument {
  id: string
  title: string
  authority: string
  documentType: string
  documentNumber?: string
  jurisdiction: string
  publishDate?: string
  effectiveFrom: string
  effectiveTo?: string
  status: LegalDocumentStatus
  reviewStatus: LegalReviewStatus
  sourceUrl: string
  sourceHash: string
  version: string
  supersedesId?: string
}

export interface LegalSection {
  id: string
  documentId: string
  legalRefId: string
  articleNumber: string
  content: string
  keywords: string[]
  contentHash: string
}

export interface LegalReference extends LegalDocument, LegalSection {
  score: number
}

export interface LegalSearchInput {
  query: string
  accidentDate: string
  jurisdiction?: string
  articleNumbers?: string[]
  limit?: number
}

export interface LegalCitation {
  legalRefId: string
  proposition: string
  supportingText: string
}

export interface LegalReferenceSnapshot {
  legalRefId: string
  title: string
  articleNumber: string
  content: string
  contentHash: string
  sourceUrl: string
  sourceHash: string
  version: string
  effectiveFrom: string
  effectiveTo?: string
}

export function legalContentHash(content: string): string {
  return createHash('sha256').update(content.trim()).digest('hex')
}

export function isEffective(reference: Pick<LegalDocument, 'effectiveFrom' | 'effectiveTo'>, accidentDate: string): boolean {
  return reference.effectiveFrom <= accidentDate && (!reference.effectiveTo || accidentDate <= reference.effectiveTo)
}

export function jurisdictionMatches(referenceJurisdiction: string, requested = 'CN'): boolean {
  return referenceJurisdiction === 'CN' || referenceJurisdiction === requested
}
