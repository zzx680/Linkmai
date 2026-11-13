import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.DB_TYPE = 'memory'
process.env.NODE_ENV = 'test'
const { memoryDB: db } = require('../src/db/memory') as typeof import('../src/db/memory')
const { WorkflowStore, id } = require('../src/harness/store') as typeof import('../src/harness/store')
const { HarnessService } = require('../src/harness/service') as typeof import('../src/harness/service')
const { normalizeAmountText, mapMaterialAmount } = require('../src/harness/material-claims') as typeof import('../src/harness/material-claims')
const { expenseDefinitions } = require('../src/harness/calculator') as typeof import('../src/harness/calculator')
const { coreTrafficLegalDocuments, coreTrafficLegalSections } = require('../src/legal/core-traffic-law') as typeof import('../src/legal/core-traffic-law')
const store = new WorkflowStore(false)
const service = new HarnessService(store)

test('amount normalization accepts OCR text and rejects anything ambiguous', () => {
  assert.equal(normalizeAmountText('12340'), '1234000')
  assert.equal(normalizeAmountText('¥12,340.50'), '1234050')
  assert.equal(normalizeAmountText(' ￥３２０ 元 '), '32000')
  for (const bad of ['', '待补', '12.345', '-20', '1e3', '金额 320', '0']) assert.equal(normalizeAmountText(bad), null)
})

test('only unambiguous material amounts map to a loss item', () => {
  assert.deepEqual(mapMaterialAmount('medical_record', 'medical_cost', '320', []),
    { key: 'medical_expense_cents', label: '医疗费', alternatives: [] })
  assert.deepEqual(mapMaterialAmount('invoice', 'amount', '1200', [{ key: 'item', value: '汽车维修费' }]),
    { key: 'vehicle_damage_cents', label: '车辆损失', alternatives: [] })
  // Two conflicting keywords, or none at all, must stay a user choice.
  assert.equal(mapMaterialAmount('invoice', 'amount', '1200', [{ key: 'item', value: '医疗费与拖车费' }])?.key, null)
  assert.equal(mapMaterialAmount('invoice', 'amount', '1200', [{ key: 'item', value: '服务费' }])?.key, null)
  // A non-amount field or an unknown material type never produces a candidate.
  assert.equal(mapMaterialAmount('invoice', 'invoice_number', '1200', []), null)
  assert.equal(mapMaterialAmount('scene_photo', 'amount', '1200', []), null)
})

async function fixture() {
  await db.upsertLegalCorpus(coreTrafficLegalDocuments, coreTrafficLegalSections)
  await store.control(c => {
    c.calculators = [{ id: 'compensation-v1', status: 'approved', legalRefs: ['cn-civil-code-2021-art-1179'], reviewedBy: 'lawyer' }]
    c.parameters = []
  })
  const user = await db.createUser(`claim-${id()}`)
  const item = await db.createCase(user.id, '材料金额测试')
  const entitlement = await db.getOrCreateCaseEntitlement(user.id, item.id)
  entitlement.status = 'paid'
  await db.persistConfirmedFacts(user.id, item.id, [
    ['accident_date', '2026-10-20'], ['jurisdiction', 'CN-ZJ-HZ'], ['injury_severity', 'minor'],
    ['has_liability_document', 'yes'],
    ...expenseDefinitions.map(d => [`claim_${d.code}`, 'no'] as [string, string]),
  ].map(([key, value]) => ({ key, label: key, value, source: 'user_text' })))
  return { userId: user.id, caseId: item.id }
}

async function addInvoice(caseId: string, fields: Array<{ key: string; label: string; value: string }>) {
  const artifact = await db.createArtifact({
    caseId, name: '发票', type: 'invoice', ossUrl: 'https://example.test/a.jpg', ossKey: 'a.jpg',
    fileSize: 1, mimeType: 'image/jpeg', status: 'processed',
    metadata: { fields, confirmed: true },
  } as any)
  return artifact.id
}

test('a confirmed invoice becomes one candidate and lands in the loss total', async () => {
  const f = await fixture()
  await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '12,340.00' },
    { key: 'item', label: '项目', value: '汽车维修费' },
  ])

  const before = await service.get(f.userId, f.caseId)
  const candidates = before.claimCandidates.filter(item => item.key === 'vehicle_damage_cents')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].amountCents, 1234000)
  assert.equal(candidates[0].evidenceIds.length, 1)

  await service.acceptClaim(f.userId, f.caseId, candidates[0].id)
  const calculation = await service.calculate(f.userId, f.caseId)
  assert.equal(calculation.items.find(item => item.code === 'vehicle')!.amountCents, 1234000)
  // Accepting the amount also states the claim scope, and the receipt is real evidence.
  assert.equal(calculation.status, 'complete')

  // Nothing left to offer once the amount is in the calculation.
  const after = await service.get(f.userId, f.caseId)
  assert.equal(after.claimCandidates.filter(item => item.key === 'vehicle_damage_cents').length, 0)
})

test('two receipts of the same loss item are summed instead of conflicting', async () => {
  const f = await fixture()
  await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '300' },
    { key: 'item', label: '项目', value: '医疗费' },
  ])
  await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '200.50' },
    { key: 'item', label: '项目', value: '门诊药费' },
  ])

  const candidates = (await service.get(f.userId, f.caseId)).claimCandidates
    .filter(item => item.key === 'medical_expense_cents')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].amountCents, 50050)
  assert.equal(candidates[0].evidenceIds.length, 2)

  await service.acceptClaim(f.userId, f.caseId, candidates[0].id)
  const calculation = await service.calculate(f.userId, f.caseId)
  assert.equal(calculation.items.find(item => item.code === 'medical')!.amountCents, 50050)
  const workspace = await service.get(f.userId, f.caseId)
  assert.equal(workspace.conflicts.filter(conflict => conflict.status === 'open').length, 0)
})

test('a later receipt is added instead of replacing the confirmed total', async () => {
  const f = await fixture()
  await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '300' },
    { key: 'item', label: '项目', value: '医疗费' },
  ])
  const first = (await service.get(f.userId, f.caseId)).claimCandidates
    .find(item => item.key === 'medical_expense_cents')!
  await service.acceptClaim(f.userId, f.caseId, first.id)

  await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '200' },
    { key: 'item', label: '项目', value: '门诊药费' },
  ])
  const second = (await service.get(f.userId, f.caseId)).claimCandidates
    .find(item => item.key === 'medical_expense_cents')!
  // The candidate carries the case-wide total, but only the new receipt is outstanding.
  assert.equal(second.amountCents, 50000)
  assert.equal(second.pendingCents, 20000)

  await service.acceptClaim(f.userId, f.caseId, second.id)
  const calculation = await service.calculate(f.userId, f.caseId)
  assert.equal(calculation.items.find(item => item.code === 'medical')!.amountCents, 50000)

  // Nothing outstanding, so the item is no longer offered.
  assert.equal((await service.get(f.userId, f.caseId)).claimCandidates
    .filter(item => item.key === 'medical_expense_cents').length, 0)
})

test('an ambiguous invoice requires an explicit destination and rejects unknown keys', async () => {
  const f = await fixture()
  await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '90' },
    { key: 'item', label: '项目', value: '服务费' },
  ])
  const candidate = (await service.get(f.userId, f.caseId)).claimCandidates.find(item => item.key === null)
  assert.ok(candidate)
  assert.equal(candidate!.amountCents, 9000)

  await assert.rejects(service.acceptClaim(f.userId, f.caseId, candidate!.id), /CLAIM_KEY_REQUIRED/)
  await assert.rejects(service.acceptClaim(f.userId, f.caseId, candidate!.id, 'nursing_daily_cents'), /CLAIM_KEY_NOT_ALLOWED/)

  await service.acceptClaim(f.userId, f.caseId, candidate!.id, 'transportation_expense_cents')
  const calculation = await service.calculate(f.userId, f.caseId)
  assert.equal(calculation.items.find(item => item.code === 'transportation')!.amountCents, 9000)
})

test('a client cannot submit its own amount for a candidate', async () => {
  const f = await fixture()
  await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '500' },
    { key: 'item', label: '项目', value: '医疗费' },
  ])
  const candidate = (await service.get(f.userId, f.caseId)).claimCandidates.find(item => item.key === 'medical_expense_cents')
  await service.acceptClaim(f.userId, f.caseId, candidate!.id)
  const medical = (await service.get(f.userId, f.caseId)).facts.find(fact => fact.key === 'medical_expense_cents')
  assert.equal(medical!.value, '50000')
})

test('unconfirmed materials never produce a candidate', async () => {
  const f = await fixture()
  const artifactId = await addInvoice(f.caseId, [
    { key: 'amount', label: '金额', value: '500' },
    { key: 'item', label: '项目', value: '医疗费' },
  ])
  await db.updateArtifact(f.caseId, artifactId, { metadata: { fields: [], confirmed: false } } as any)
  assert.equal((await service.get(f.userId, f.caseId)).claimCandidates.length, 0)
})
