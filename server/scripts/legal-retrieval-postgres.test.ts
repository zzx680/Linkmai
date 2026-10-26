import assert from 'node:assert/strict'
import { test } from 'node:test'
import { db, pool } from '../src/db/postgres'
import { coreTrafficLegalDocuments, coreTrafficLegalSections } from '../src/legal/core-traffic-law'

const enabled = process.env.RUN_LEGAL_POSTGRES_TEST === '1'

test('legal retrieval PostgreSQL corpus and effective-date filtering', { skip: !enabled }, async () => {
  try {
  await db.upsertLegalCorpus(coreTrafficLegalDocuments, coreTrafficLegalSections)
  const results = await db.searchLegalReferences({
    query: '机动车 交强险 人身损害 医疗费',
    accidentDate: '2026-10-22',
    jurisdiction: 'CN',
    limit: 20,
  })
  assert.ok(results.some(reference => reference.legalRefId === 'cn-road-safety-2021-art-76'))
  assert.ok(results.some(reference => reference.legalRefId === 'cn-civil-code-2021-art-1179'))
  assert.ok(results.every(reference => reference.reviewStatus === 'approved'))
  assert.deepEqual(await db.searchLegalReferences({ query: '机动车', accidentDate: '2020-12-31', jurisdiction: 'CN' }), [])
  const exact = await db.getLegalReferences(['cn-civil-code-2021-art-1213'])
  assert.equal(exact[0].articleNumber, '第一千二百一十三条')
  assert.match(exact[0].content, /强制保险/)
  } finally {
    await pool.end()
  }
})
