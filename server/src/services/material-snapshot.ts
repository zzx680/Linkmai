import { createHash } from 'node:crypto'

export function materialSnapshot(artifacts: Array<{ id: string; type: string; metadata?: { confirmed?: boolean; fields?: unknown; rawText?: string } }>): string {
  const facts = artifacts.filter(item => item.metadata?.confirmed).map(item => ({
    id: item.id,
    type: item.type,
    fields: item.metadata?.fields,
    rawText: item.metadata?.rawText,
  })).sort((a, b) => a.id.localeCompare(b.id))
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex')
}
