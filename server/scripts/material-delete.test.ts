import assert from 'node:assert/strict'
import { test } from 'node:test'

let artifact: any
let owned = true

const dbMock = {
  async findCaseById(userId: string, caseId: string) {
    return owned && userId === 'user-1' && caseId === 'case-1' ? { id: 'case-1' } : null
  },
  async findArtifactById(caseId: string, artifactId: string) {
    return artifact && artifact.caseId === caseId && artifact.id === artifactId ? { ...artifact } : null
  },
  async deleteArtifact(userId: string, caseId: string, artifactId: string, expectedStatuses = ['uploaded', 'processed', 'failed']) {
    if (!owned || userId !== 'user-1' || caseId !== 'case-1' || !artifact || artifact.id !== artifactId || artifact.caseId !== caseId || !expectedStatuses.includes(artifact.status)) return null
    const deleted = { ...artifact }
    artifact = null
    return deleted
  },
}

function mockModule(path: string, exports: unknown) {
  const id = require.resolve(path)
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule
}

mockModule('../src/db', { db: dbMock })
const { materialsRouter } = require('../src/routes/materials') as typeof import('../src/routes/materials')

async function requestDelete(userId: string | undefined = 'user-1') {
  const layer = (materialsRouter as any).stack.find((entry: any) => entry.route?.path === '/:caseId/:artifactId' && entry.route.methods.delete)
  assert.ok(layer, 'missing delete material route')
  const response = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this },
    json(value: any) { this.body = value; return this },
  }
  await layer.route.stack[0].handle({ userId, params: { caseId: 'case-1', artifactId: 'artifact-1' } }, response)
  return response
}

test.beforeEach(() => {
  owned = true
  artifact = {
    id: 'artifact-1', caseId: 'case-1', ossKey: 'owned/material.jpg', status: 'processed',
    metadata: { confirmed: true },
  }
})

test('deleting an owned processed material removes it and reports confirmation state', async () => {
  const response = await requestDelete()
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, { success: true, data: { deleted: true, confirmed: true, artifactId: 'artifact-1' } })
  assert.equal(artifact, null)
})

test('deleting a material during processing is rejected without removal', async () => {
  artifact.status = 'processing'
  const response = await requestDelete()
  assert.equal(response.statusCode, 409)
  assert.match(response.body.error, /正在处理中/)
  assert.equal(artifact.status, 'processing')
})

test('deleting another user material returns not found', async () => {
  owned = false
  const response = await requestDelete()
  assert.equal(response.statusCode, 404)
  assert.equal(artifact.id, 'artifact-1')
})
