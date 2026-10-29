import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
// js-yaml is already supplied by the locked ESLint dependency.
const yaml = require('js-yaml') as { load(source: string): any }
const root = path.resolve(__dirname, '../..')
const workflow = yaml.load(readFileSync(path.join(root, '.github/workflows/deploy-production.yml'), 'utf8'))

test('release workflow requires checks and staging and preserves an approval boundary', () => {
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.equal(workflow.jobs.checks.if, "github.ref == 'refs/heads/main'")
  assert.equal(workflow.jobs.staging.needs, 'checks')
  assert.deepEqual(workflow.jobs.production.needs, ['checks', 'staging'])
  assert.equal(workflow.jobs.staging.environment.name, 'staging')
  assert.equal(workflow.jobs.production.environment.name, 'production')
  for (const job of ['staging', 'production']) {
    const steps = workflow.jobs[job].steps
    const checkout = steps.find((s: any) => s.uses?.startsWith('actions/checkout'))
    assert.equal(checkout.with.ref, '${{ needs.checks.outputs.sha }}')
    const download = steps.find((s: any) => s.uses?.startsWith('actions/download-artifact'))
    assert.equal(download.with.name, 'source-${{ needs.checks.outputs.release_id }}')
    const deploy = steps.find((s: any) => s.run === 'bash server/scripts/ci-deploy.sh')
    assert.equal(deploy.env.RELEASE_SHA, '${{ needs.checks.outputs.sha }}')
    assert.equal(deploy.env.RELEASE_ID, '${{ needs.checks.outputs.release_id }}')
    if (job === 'production') assert.equal(deploy.env.STAGING_RELEASE_ID, deploy.env.RELEASE_ID)
  }
})

test('release transport replaces only a retryable source directory before upload', () => {
  const script = readFileSync(path.join(__dirname, 'ci-deploy.sh'), 'utf8')
  const cleanup = "sudo -n rm -rf -- '$remote_source'"
  const create = "sudo -n mkdir '$remote_source'"
  assert.ok(script.includes('install -d -m 750 -o'))
  assert.ok(script.includes(cleanup))
  assert.ok(script.includes(create))
  assert.ok(script.indexOf(cleanup) < script.indexOf(create))
  assert.doesNotMatch(script, /rm -rf -- ['\"]?\$?APP_ROOT/)
})

test('review activation remains server-local and protects the staged promotion path', () => {
  const script = readFileSync(path.join(__dirname, 'ci-deploy.sh'), 'utf8')
  assert.match(script, /openssl rand -hex 48/)
  assert.match(script, /REVIEW_JWT_SECRET/)
  assert.match(script, /HARNESS_ENABLED=true/)
  assert.match(script, /location = \/review/)
  assert.match(script, /sudo -n nginx -t/)
  assert.match(script, /sudo -n systemctl reload nginx/)
  assert.match(script, /sleep 2/)
  assert.match(script, /审核配置重载后健康检查超时/)
  assert.match(script, /curl --fail --silent --show-error --max-time 5/)
  assert.ok(script.includes(String.raw`proxy_set_header Host \\\$host`))
  assert.ok(script.includes(String.raw`proxy_set_header X-Forwarded-Proto \\\$scheme`))
  assert.doesNotMatch(readFileSync(path.join(root, '.github/workflows/deploy-production.yml'), 'utf8'), /REVIEW_JWT_SECRET/)
})

test('workflow shell blocks and all release entrypoints have valid Bash syntax', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'linkmai-workflow-'))
  try {
    let index = 0
    for (const job of Object.values(workflow.jobs) as any[]) {
      for (const step of job.steps) {
        if (!step.run) continue
        const file = path.join(temp, String(index++) + '.sh')
        writeFileSync(file, step.run)
        const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' })
        assert.equal(result.status, 0, result.stderr)
      }
    }
    for (const file of ['release-common', 'deploy-release', 'deploy-staging', 'deploy-production', 'rollback-release', 'rollback-staging', 'rollback-production', 'smoke-release', 'smoke-staging', 'smoke-production', 'ci-deploy']) {
      const result = spawnSync('bash', ['-n', path.join(__dirname, file + '.sh')], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
