import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

test('runtime release identity is captured at startup and never follows a later metadata replacement', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'linkmai-runtime-release-'))
  try {
    const utils = path.join(root, 'server/dist/utils')
    mkdirSync(utils, { recursive: true })
    const moduleFile = path.join(utils, 'release.js')
    cpSync(path.resolve(__dirname, '../dist/utils/release.js'), moduleFile)
    const metadata = path.join(root, '.release-info.json')
    const before = { id: 'accepted', sha: 'a'.repeat(40) }
    writeFileSync(metadata, JSON.stringify(before))
    const result = spawnSync(process.execPath, ['-e', 'const fs=require("fs");const value=require(process.argv[1]).releaseInfo;fs.writeFileSync(process.argv[2],JSON.stringify({id:"replacement",sha:"b".repeat(40)}));console.log(JSON.stringify([value,require(process.argv[1]).releaseInfo]));', moduleFile, metadata], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), [before, before])
    writeFileSync(metadata, '{"id":"invalid/path","sha":"bad"}')
    const invalid = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(require(process.argv[1]).releaseInfo))', moduleFile], { encoding: 'utf8' })
    assert.equal(invalid.status, 0, invalid.stderr)
    assert.equal(invalid.stdout.trim(), 'null')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
