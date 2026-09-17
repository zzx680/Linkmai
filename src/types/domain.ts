export type CaseStatus =
  | 'collecting'
  | 'processing'
  | 'ready'
  | 'needs_review'
  | 'consulting'

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageKind =
  | 'text'
  | 'artifact'
  | 'fields'
  | 'quick-replies'
  | 'loading'
  | 'report'

export interface CurrentCase {
  id: string
  title: string
  accidentType: string
  updatedAt: string
  status: CaseStatus
  statusLabel: string
  materialCount: number
  materialProgress: string
  liability?: string
  compensation?: string
  hasReport: boolean
}

export interface Artifact {
  id: string
  name: string
  type: 'document' | 'image' | 'audio' | 'video'
  sizeLabel: string
  label: string
  status: 'uploaded' | 'processing' | 'ready' | 'failed'
  urls?: string[]  // OSS 上传后的 URL 列表
}

export interface ExtractedField {
  label: string
  value: string
  source: string
  confidence: 'high' | 'medium' | 'low'
}

export interface QuickReplyOption {
  label: string
  value: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  kind: MessageKind
  text?: string
  artifact?: Artifact
  fields?: ExtractedField[]
  options?: QuickReplyOption[]
  loadingText?: string
  createdAt: number
}

export interface ReportSummary {
  liability: {
    conclusion: string
    confidence: string
    basis: string
  }
  compensation: {
    range: string
    items: Array<{ label: string; amount: string; note?: string }>
  }
  missingMaterials: string[]
  nextSteps: string[]
  needsReview: boolean
}
