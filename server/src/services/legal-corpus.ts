import { db } from '../db'
import { config } from '../config'
import { coreTrafficLegalDocuments, coreTrafficLegalSections } from '../legal/core-traffic-law'

let loadedForMemory = false

export async function ensureCoreTrafficLegalCorpus(): Promise<void> {
  if (config.database.type === 'memory' && loadedForMemory) return
  await db.upsertLegalCorpus(coreTrafficLegalDocuments, coreTrafficLegalSections, { insertOnly: true })
  if (config.database.type === 'memory') loadedForMemory = true
}
