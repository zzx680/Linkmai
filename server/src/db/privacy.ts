export type PrivacyRequestKind = 'export_data' | 'delete_data' | 'close_account'
export type PrivacyRequestStatus = 'pending' | 'processing' | 'completed' | 'rejected'

export interface PrivacyRequest {
  id: string
  userId: string
  kind: PrivacyRequestKind
  status: PrivacyRequestStatus
  response: string | null
  createdAt: Date
  updatedAt: Date
}

export function toPrivacyRequest(row: any): PrivacyRequest {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    status: row.status,
    response: row.response,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
