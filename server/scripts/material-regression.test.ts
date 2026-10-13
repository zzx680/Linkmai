import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

// Seed CommonJS module cache before loading the service/router. No OCR, AI or DB
// clients are initialized, and all tests stay in-process (no network/listener).
let ocrResult: any
let ocrError: Error | undefined
let aiResponse: string
let aiError: Error | undefined
let aiPending: Promise<string> | undefined
const ocrCalls: string[] = []
const textCalls: string[] = []
const imageCalls: Array<{ imageUrl: string; prompt: string }> = []

function mockModule(path: string, exports: unknown) {
  const id = require.resolve(path)
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule
}

mockModule('../src/services/ocr', {
  ocrService: {
    async recognizeText(imageUrl: string) {
      ocrCalls.push(imageUrl)
      if (ocrError) throw ocrError
      return ocrResult
    },
  },
})
mockModule('../src/services/deepseek', {
  async analyzeText(prompt: string) {
    textCalls.push(prompt)
    if (aiError) throw aiError
    return aiPending || aiResponse
  },
  async analyzeAccidentImage(imageUrl: string, prompt: string) {
    imageCalls.push({ imageUrl, prompt })
    if (aiError) throw aiError
    return aiPending || aiResponse
  },
})

let artifact: any
let owned = true
let caseError: Error | undefined
let claimLost = false
let lostClaimStatus = 'processing'
let materialCount = 0
const writes: Array<{ updates: any; expectedStatuses?: string[] }> = []
const confirmations: any[] = []
const dbMock = {
  async findCaseById(userId: string, caseId: string) {
    if (caseError) throw caseError
    return owned && userId === 'user-1' && caseId === 'case-1' ? { id: 'case-1' } : null
  },
  async findActiveCase() { return { id: 'case-1' } },
  async findArtifactById(caseId: string, artifactId: string) {
    return artifact && artifact.caseId === caseId && artifact.id === artifactId ? { ...artifact } : null
  },
  async updateArtifact(caseId: string, artifactId: string, updates: any, expectedStatuses?: string[]) {
    writes.push({ updates, expectedStatuses })
    if (claimLost && updates.status === 'processing') {
      artifact = { ...artifact, status: lostClaimStatus }
      return null
    }
    if (!artifact || artifact.caseId !== caseId || artifact.id !== artifactId ||
        (expectedStatuses && !expectedStatuses.includes(artifact.status))) return null
    artifact = { ...artifact, ...updates }
    return { ...artifact }
  },
  async confirmArtifact(userId: string, caseId: string, artifactId: string, fields: any[], rawText?: string) {
    confirmations.push({ userId, caseId, artifactId, fields, rawText })
    if (!artifact || artifact.status !== 'processed') return null
    if (!artifact.metadata.confirmed) materialCount++
    artifact = {
      ...artifact,
      metadata: { ...artifact.metadata, fields, rawText: rawText ?? artifact.metadata.rawText, confirmed: true },
    }
    return { ...artifact }
  },
}
mockModule('../src/db', { db: dbMock })
const { processMaterial, supportedMaterialTypes } = require('../src/services/material') as typeof import('../src/services/material')
const { materialsRouter } = require('../src/routes/materials') as typeof import('../src/routes/materials')

const imageUrl = 'https://example.invalid/material.jpg'
const processBody = { caseId: 'case-1', artifactId: 'artifact-1', materialType: 'medical_record' }
const field = { key: 'diagnosis', label: '诊断', value: '软组织损伤' }

async function request(path: string, body: any, userId: string | undefined = 'user-1') {
  const layer = (materialsRouter as any).stack.find((entry: any) => entry.route?.path === path && entry.route.methods.post)
  assert.ok(layer, `missing route ${path}`)
  const response = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this },
    json(value: any) { this.body = value; return this },
  }
  await layer.route.stack[0].handle({ userId, body }, response)
  return response
}

beforeEach(() => {
  ocrResult = { success: true, text: '  医疗原文  ' }
  ocrError = undefined
  aiResponse = JSON.stringify({ diagnosis: '软组织损伤' })
  aiError = undefined
  aiPending = undefined
  ocrCalls.length = textCalls.length = imageCalls.length = writes.length = confirmations.length = 0
  owned = true
  caseError = undefined
  claimLost = false
  lostClaimStatus = 'processing'
  materialCount = 0
  artifact = {
    id: 'artifact-1', caseId: 'case-1', type: 'other', ossUrl: imageUrl,
    mimeType: 'image/jpeg', status: 'uploaded', metadata: {}, createdAt: new Date(0),
  }
})

test('shared supported types use medical_record, not legacy aliases', () => {
  assert.deepEqual([...supportedMaterialTypes], [
    'accident_report', 'medical_record', 'scene_photo', 'id_card',
    'vehicle_license', 'driver_license', 'invoice', 'other',
  ])
  assert.equal(supportedMaterialTypes.has('medical-record'), false)
})

test('medical_record dispatches to medical extraction rather than generic text', async () => {
  const result = await processMaterial('medical_record', imageUrl)
  assert.equal(result.type, 'medical_record')
  assert.deepEqual(result.fields, [{ ...field, confidence: 'medium' }])
  assert.equal(result.rawText, '医疗原文')
  assert.deepEqual(ocrCalls, [imageUrl])
  assert.match(textCalls[0], /patient_name/)
  assert.equal(imageCalls.length, 0)
})

test('accident_report dispatches to police report extraction', async () => {
  aiResponse = JSON.stringify({ accident_date: '2026-10-10', liability: '甲方全责' })
  const result = await processMaterial('accident_report', imageUrl)
  assert.deepEqual(result.fields.map(field => field.key), ['accident_date', 'liability'])
  assert.match(textCalls[0], /交警认定书/)
})

test('invoice dispatches to invoice extraction', async () => {
  aiResponse = JSON.stringify({ amount: 1200, invoice_number: 'INV-1' })
  const result = await processMaterial('invoice', imageUrl)
  assert.equal(result.fields.find(field => field.key === 'amount')?.value, '1200')
  assert.match(textCalls[0], /invoice_number/)
})

test('scene_photo without text bypasses OCR and uses accident image analysis', async () => {
  ocrResult = { success: false, error: '无文字' }
  ocrError = new Error('OCR must not be called for photos')
  aiResponse = '车辆前保险杠受损'
  const result = await processMaterial('scene_photo', imageUrl)
  assert.equal(result.rawText, undefined)
  assert.deepEqual(result.fields, [{ key: 'damage_description', label: '损伤描述', value: aiResponse, confidence: 'medium' }])
  assert.equal(ocrCalls.length, 0)
  assert.equal(textCalls.length, 0)
  assert.equal(imageCalls.length, 1)
  assert.equal(imageCalls[0].imageUrl, imageUrl)
})

test('empty image analysis is rejected instead of creating a blank field', async () => {
  aiResponse = '  '
  await assert.rejects(processMaterial('scene_photo', imageUrl), /图片分析未返回有效内容/)
  assert.equal(ocrCalls.length, 0)
})

test('all text types reject failed OCR before calling AI', async () => {
  ocrResult = { success: false, text: '不可信的文字', error: 'OCR 服务不可用' }
  for (const type of supportedMaterialTypes) {
    if (type === 'scene_photo') continue
    await assert.rejects(processMaterial(type, imageUrl), /OCR 服务不可用/)
  }
  assert.equal(textCalls.length, 0)
  assert.equal(imageCalls.length, 0)
})

test('empty or whitespace-only OCR text is rejected', async () => {
  for (const text of [undefined, '', ' \n\t ']) {
    ocrResult = { success: true, text }
    await assert.rejects(processMaterial('medical_record', imageUrl), /OCR 未识别到有效文字/)
  }
  assert.equal(textCalls.length, 0)
})

test('thrown OCR errors are rejected without an AI fallback', async () => {
  ocrError = new Error('OCR timeout')
  await assert.rejects(processMaterial('accident_report', imageUrl), /OCR timeout/)
  assert.equal(textCalls.length, 0)
})

test('generic text materials preserve OCR text without AI calls', async () => {
  for (const type of ['id_card', 'vehicle_license', 'driver_license', 'other']) {
    const result = await processMaterial(type, imageUrl)
    assert.deepEqual(result.fields, [{ key: 'raw_text', label: '识别文本', value: '医疗原文', confidence: 'low' }])
  }
  assert.equal(textCalls.length, 0)
})

test('unsupported types are rejected by service and route before work starts', async () => {
  await assert.rejects(processMaterial('medical-record', imageUrl), /不支持的材料类型/)
  const response = await request('/process', { ...processBody, materialType: 'medical-record' })
  assert.equal(response.statusCode, 400)
  assert.equal(ocrCalls.length, 0)
  assert.equal(writes.length, 0)
})

test('uploaded and failed artifacts atomically claim processing before success', async () => {
  for (const status of ['uploaded', 'failed']) {
    artifact.status = status
    const response = await request('/process', processBody)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.data.status, 'processed')
    assert.deepEqual(writes.at(-2), { updates: { type: 'medical_record', status: 'processing' }, expectedStatuses: ['uploaded', 'failed'] })
    assert.deepEqual(writes.at(-1)?.expectedStatuses, ['processing'])
  }
})

test('processed retries return existing confirmed material without rerunning or overwriting', async () => {
  artifact.status = 'processed'
  artifact.type = 'invoice'
  artifact.metadata = { fields: [field], rawText: '已确认原文', confirmed: true }
  const response = await request('/process', processBody)
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.data.confirmed, true)
  assert.equal(response.body.data.type, 'invoice')
  assert.deepEqual(response.body.data.fields, [field])
  assert.equal(writes.length, 0)
  assert.equal(ocrCalls.length, 0)
})

test('processing retries return 409 without writes or OCR', async () => {
  artifact.status = 'processing'
  const response = await request('/process', processBody)
  assert.equal(response.statusCode, 409)
  assert.equal(writes.length, 0)
  assert.equal(ocrCalls.length, 0)
})

test('lost processing claim does not call AI or overwrite another worker', async () => {
  claimLost = true
  const response = await request('/process', processBody)
  assert.equal(response.statusCode, 409)
  assert.equal(writes.length, 1)
  assert.equal(ocrCalls.length, 0)
  assert.equal(artifact.status, 'processing')
})

test('lost claim returns existing material if another worker already finished', async () => {
  claimLost = true
  lostClaimStatus = 'processed'
  artifact.metadata = { fields: [field], confirmed: true }
  const response = await request('/process', processBody)
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.data.confirmed, true)
  assert.equal(writes.length, 1)
  assert.equal(ocrCalls.length, 0)
})

test('concurrent process requests execute OCR only once', async () => {
  let release!: (value: string) => void
  aiPending = new Promise(resolve => { release = resolve })
  const first = request('/process', processBody)
  const second = await request('/process', processBody)
  assert.equal(second.statusCode, 409)
  release(aiResponse)
  assert.equal((await first).statusCode, 200)
  assert.equal(ocrCalls.length, 1)
  assert.equal(textCalls.length, 1)
  assert.equal(writes.length, 3)
  assert.deepEqual(writes.map(write => write.updates.status), ['processing', 'processing', 'processed'])
  assert.deepEqual(writes.map(write => write.expectedStatuses), [
    ['uploaded', 'failed'], ['uploaded', 'failed'], ['processing'],
  ])
})

test('OCR failures mark only claimed processing artifacts failed', async () => {
  ocrResult = { success: false, error: 'OCR rejected' }
  const response = await request('/process', processBody)
  assert.equal(response.statusCode, 422)
  assert.equal(artifact.status, 'failed')
  assert.deepEqual(writes[1].expectedStatuses, ['processing'])
  assert.equal(artifact.metadata.error, 'OCR rejected')
})

test('exceptions before claim do not alter an existing artifact', async () => {
  caseError = new Error('DB unavailable')
  const response = await request('/process', processBody)
  assert.equal(response.statusCode, 422)
  assert.equal(writes.length, 0)
  assert.equal(artifact.status, 'uploaded')
})

test('late success cannot overwrite a processed confirmed artifact', async () => {
  let release!: (value: string) => void
  aiPending = new Promise(resolve => { release = resolve })
  const pending = request('/process', processBody)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(artifact.status, 'processing')
  artifact = { ...artifact, status: 'processed', metadata: { fields: [field], confirmed: true } }
  release(aiResponse)
  assert.equal((await pending).statusCode, 409)
  assert.deepEqual(artifact.metadata, { fields: [field], confirmed: true })
  assert.deepEqual(writes[1].expectedStatuses, ['processing'])
})

test('late failure cannot overwrite a processed confirmed artifact', async () => {
  let reject!: (error: Error) => void
  aiPending = new Promise((_, rejectPromise) => { reject = rejectPromise })
  const pending = request('/process', processBody)
  await new Promise(resolve => setImmediate(resolve))
  artifact = { ...artifact, status: 'processed', metadata: { fields: [field], confirmed: true } }
  reject(new Error('AI timeout'))
  assert.equal((await pending).statusCode, 422)
  assert.deepEqual(artifact.metadata, { fields: [field], confirmed: true })
  assert.equal(artifact.status, 'processed')
  assert.deepEqual(writes[1].expectedStatuses, ['processing'])
})

test('ownership checks reject cross-user material before any update', async () => {
  owned = false
  assert.equal((await request('/process', processBody)).statusCode, 404)
  assert.equal((await request('/confirm', { ...processBody, fields: [field] })).statusCode, 404)
  assert.equal(writes.length, 0)
  assert.equal(confirmations.length, 0)
})

test('confirm rejects invalid field shapes and confidence values', async () => {
  artifact.status = 'processed'
  for (const invalidField of [null, 'field', [], {}, { ...field, key: 1 }, { ...field, label: null },
    { ...field, value: {} }, { ...field, confidence: 'certain' }, { ...field, confidence: 0 }, { ...field, confidence: null }]) {
    const response = await request('/confirm', { ...processBody, fields: [invalidField] })
    assert.equal(response.statusCode, 400, JSON.stringify(invalidField))
  }
  assert.equal(confirmations.length, 0)
})

test('confirm rejects invalid rawText and non-string identifiers', async () => {
  artifact.status = 'processed'
  for (const rawText of [null, 4, {}, []]) {
    assert.equal((await request('/confirm', { ...processBody, fields: [field], rawText })).statusCode, 400)
  }
  for (const identifiers of [{ caseId: {} }, { artifactId: 1 }, { caseId: '' }, { artifactId: '' }]) {
    assert.equal((await request('/confirm', { ...processBody, ...identifiers, fields: [field] })).statusCode, 400)
  }
  assert.equal(confirmations.length, 0)
})

test('valid optional confidence and rawText remain compatible with idempotent confirmation', async () => {
  artifact.status = 'processed'
  artifact.metadata = { rawText: 'OCR 原文' }
  const body = { ...processBody, fields: [field] }
  const first = await request('/confirm', body)
  const repeated = await request('/confirm', body)
  assert.equal(first.statusCode, 200)
  assert.equal(repeated.statusCode, 200)
  assert.equal(materialCount, 1)
  assert.equal(repeated.body.data.material.rawText, 'OCR 原文')
  for (const confidence of ['high', 'medium', 'low']) {
    const response = await request('/confirm', { ...body, fields: [{ ...field, confidence }], rawText: '' })
    assert.equal(response.statusCode, 200)
  }
  assert.equal(materialCount, 1)
})
