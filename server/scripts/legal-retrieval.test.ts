import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DB_TYPE = 'memory'
const { memoryDB } = require('../src/db/memory') as typeof import('../src/db/memory')
const { coreTrafficLegalDocuments, coreTrafficLegalSections } = require('../src/legal/core-traffic-law') as typeof import('../src/legal/core-traffic-law')
const { accidentDateFromFacts, assertLegalCitations, buildLegalSearchInput } = require('../src/services/legal-retrieval') as typeof import('../src/services/legal-retrieval')

const confirmed = (key: string, label: string, value: string) => ({ key, label, value, source: 'user_text', confidence: 'high' as const, confirmed: true })

test('core traffic corpus uses approved versioned official sources and stable hashes', () => {
  assert.ok(coreTrafficLegalDocuments.length >= 2)
  assert.ok(coreTrafficLegalSections.length >= 7)
  for (const document of coreTrafficLegalDocuments) {
    assert.equal(document.reviewStatus, 'approved')
    assert.equal(document.status, 'active')
    assert.equal(document.jurisdiction, 'CN')
    assert.match(document.sourceUrl, /^https:\/\/(?:flk\.npc\.gov\.cn|tjca\.miit\.gov\.cn)\//)
    assert.match(document.sourceHash, /^[a-f0-9]{64}$/)
  }
  for (const section of coreTrafficLegalSections) {
    assert.match(section.legalRefId, /^cn-/)
    assert.match(section.contentHash, /^[a-f0-9]{64}$/)
    assert.ok(section.content.length > 10)
  }
})

test('legal search requires an exact accident date and builds conservative terms', () => {
  const facts = [
    confirmed('accident_date', '事故日期', '2026-10-22'),
    confirmed('injury', '伤情', '骨折'),
    confirmed('accident_description', '事故经过', '机动车与行人发生碰撞'),
  ]
  assert.equal(accidentDateFromFacts(facts), '2026-10-22')
  assert.equal(accidentDateFromFacts([confirmed('accident_date', '事故日期', '2024-02-29')]), '2024-02-29')
  assert.equal(accidentDateFromFacts([confirmed('accident_date', '事故日期', '2026-02-30')]), null)
  assert.equal(accidentDateFromFacts([confirmed('accident_date', '事故日期', '2025-02-29')]), null)
  assert.equal(accidentDateFromFacts([confirmed('accident_date', '事故日期', '2026-04-31')]), null)
  const input = buildLegalSearchInput(facts)
  assert.match(input.query, /医疗费/)
  assert.match(input.query, /机动车/)
  assert.throws(() => buildLegalSearchInput([confirmed('accident_date', '事故日期', '今天')]), /LEGAL_ACCIDENT_DATE_REQUIRED/)
})

test('memory legal retrieval filters by review, status, jurisdiction and effective interval', async () => {
  await memoryDB.upsertLegalCorpus(coreTrafficLegalDocuments, coreTrafficLegalSections)
  const results = await memoryDB.searchLegalReferences({
    query: '机动车 交强险 人身损害 医疗费',
    accidentDate: '2026-10-22',
    jurisdiction: 'CN',
    limit: 20,
  })
  assert.ok(results.some(reference => reference.legalRefId === 'cn-road-safety-2021-art-76'))
  assert.ok(results.some(reference => reference.legalRefId === 'cn-civil-code-2021-art-1179'))
  assert.ok(results.every(reference => reference.reviewStatus === 'approved' && reference.effectiveFrom <= '2026-10-22'))
  assert.deepEqual(await memoryDB.searchLegalReferences({ query: '机动车', accidentDate: '2020-12-31', jurisdiction: 'CN' }), [])
})

test('citation validation accepts only retrieved effective references', async () => {
  await memoryDB.upsertLegalCorpus(coreTrafficLegalDocuments, coreTrafficLegalSections)
  const references = await memoryDB.getLegalReferences(['cn-road-safety-2021-art-76'])
  const supportingText = '由保险公司在机动车第三者责任强制保险责任限额范围内予以赔偿'
  assert.doesNotThrow(() => assertLegalCitations([{ legalRefId: references[0].legalRefId, proposition: supportingText, supportingText }], references, '2026-10-22'))
  assert.throws(() => assertLegalCitations([{ legalRefId: references[0].legalRefId, proposition: '行人始终承担全部责任', supportingText }], references, '2026-10-22'), /INVALID_LEGAL_CITATION/)
  assert.throws(() => assertLegalCitations([{ legalRefId: references[0].legalRefId, proposition: supportingText, supportingText: '不存在的法条原文证据' }], references, '2026-10-22'), /INVALID_LEGAL_CITATION/)
  assert.throws(() => assertLegalCitations([{ legalRefId: 'invented-ref', proposition: '虚构依据', supportingText: '虚构依据文本证据' }], references, '2026-10-22'), /INVALID_LEGAL_CITATION/)
  assert.throws(() => assertLegalCitations([], references, '2026-10-22'), /LEGAL_CITATION_REQUIRED/)
})
