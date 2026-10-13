import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryDB } from '../src/db/memory'

test('artifact claims are atomic and completed materials cannot be overwritten by retry', async () => {
  const user = await memoryDB.createUser(`claim-${Math.random()}`)
  const caseData = await memoryDB.createCase(user.id, {})
  const artifact = await memoryDB.createArtifact({ caseId: caseData.id, name: 'image', type: 'scene_photo', ossUrl: 'https://owned.invalid/image', ossKey: 'owned', fileSize: 1, status: 'uploaded' })
  const claims = await Promise.all([
    memoryDB.updateArtifact(caseData.id, artifact.id, { status: 'processing' }, ['uploaded', 'failed']),
    memoryDB.updateArtifact(caseData.id, artifact.id, { status: 'processing' }, ['uploaded', 'failed']),
  ])
  assert.equal(claims.filter(Boolean).length, 1)
  await memoryDB.updateArtifact(caseData.id, artifact.id, { status: 'failed' }, ['processing'])
  assert.ok(await memoryDB.updateArtifact(caseData.id, artifact.id, { status: 'processing' }, ['uploaded', 'failed']))
  await memoryDB.updateArtifact(caseData.id, artifact.id, { status: 'processed', metadata: { fields: [] } }, ['processing'])
  assert.equal(await memoryDB.updateArtifact(caseData.id, artifact.id, { status: 'processing' }, ['uploaded', 'failed']), null)
  assert.equal(await memoryDB.updateArtifact(caseData.id, artifact.id, { status: 'failed' }, ['processing']), null)
  assert.equal((await memoryDB.findArtifactById(caseData.id, artifact.id))?.status, 'processed')
})
