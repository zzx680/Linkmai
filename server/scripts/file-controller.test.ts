import assert from 'node:assert/strict'
import { test } from 'node:test'

const credentials = { host: 'oss.example.invalid', policy: 'policy', signature: 'signature' }

function mockModule(path: string, exports: unknown) {
  const id = require.resolve(path)
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule
}

mockModule('../src/services/oss', {
  FileType: { Photo: 'photo', Video: 'video', Document: 'document' },
  getUploadCredentials: async () => credentials,
})

const { getPresignUrl } = require('../src/controllers/file.controller') as typeof import('../src/controllers/file.controller')

function response() {
  let statusCode = 200
  let body: unknown
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(value: unknown) {
      body = value
      return this
    },
  }
  return { res, result: () => ({ statusCode, body }) }
}

test('presign validation returns Zod issue details for malformed input', async () => {
  const { res, result } = response()

  await getPresignUrl({
    user: { id: 'user-1' },
    body: { filename: '', fileType: 'archive', caseId: 'not-a-uuid' },
  } as any, res as any)

  assert.equal(result().statusCode, 400)
  const body = result().body as { error: string; message: string; details: Array<{ path: PropertyKey[] }> }
  assert.equal(body.error, 'ValidationError')
  assert.equal(body.message, '参数格式错误')
  assert.ok(Array.isArray(body.details))
  assert.deepEqual(body.details.map(issue => issue.path), [['filename'], ['fileType'], ['caseId']])
})

test('presign validation accepts valid file metadata', async () => {
  const { res, result } = response()

  await getPresignUrl({
    user: { id: 'user-1' },
    body: { filename: 'evidence.jpg', fileType: 'photo', caseId: 'a4f0089d-a3db-465b-aef5-b2a1db147253' },
  } as any, res as any)

  assert.equal(result().statusCode, 200)
  assert.deepEqual(result().body, { success: true, data: credentials })
})
