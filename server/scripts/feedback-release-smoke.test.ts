import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('release smoke rejects a healthy but outdated backend and accepts the expected features with protected routes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'linkmai-feedback-smoke-'))
  try {
    writeFileSync(path.join(root, 'curl'), `#!/bin/sh
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) shift; output=$1 ;;
    https://*) url=$1 ;;
  esac
  shift
done
case "$url" in
  */api/health) printf '%s' "$TASK_HEALTH_JSON" > "$output"; printf '200' ;;
  */api/auth/wechat/login) printf '{}' > "$output"; printf '400' ;;
  *) printf '{}' > "$output"; printf '401' ;;
esac
`, { mode: 0o755 })
    for (const [health, expected] of [
      [{ status: 'ok', database: 'ok' }, 1],
      [{ status: 'ok', database: 'ok', features: { paymentOrderHistory: false, contextualAgent: true } }, 1],
      [{ status: 'ok', database: 'ok', features: { paymentOrderHistory: true, contextualAgent: true } }, 0],
    ] as const) {
      const result = spawnSync('bash', [path.resolve(__dirname, 'smoke-production.sh'), 'https://api.example.test'], {
        env: { ...process.env, PATH: `${root}:${process.env.PATH}`, TASK_HEALTH_JSON: JSON.stringify(health) },
        encoding: 'utf8', timeout: 5000,
      })
      assert.equal(result.status, expected, result.stdout + result.stderr)
      if (expected === 0) assert.match(result.stdout, /GET \/api\/payment-orders -> 401/)
      else assert.match(result.stderr, /后端缺少订单列表/)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('both environment smoke entrypoints reject stale running SHA/release and verify review routing when enabled', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'linkmai-version-smoke-'))
  try {
    writeFileSync(path.join(root, 'curl'), '#!/bin/sh\noutput=""; url=""\nwhile [ "$#" -gt 0 ]; do case "$1" in --output) shift; output=$1;; https://*) url=$1;; esac; shift; done\ncase "$url" in */api/health) printf "%s" "$TASK_HEALTH_JSON" > "$output"; printf 200;; */review/) printf "%s" "$TASK_REVIEW_STATUS";; */api/auth/wechat/login) printf 400;; *) printf 401;; esac\n', { mode: 0o755 })
    const sha = 'a'.repeat(40)
    const goodHealth = { status: 'ok', database: 'ok', release: { sha, id: 'expected' }, features: { paymentOrderHistory: true, contextualAgent: true, caseHarness: true } }
    for (const mode of ['staging', 'production']) {
      for (const [health, reviewStatus, expected] of [
        [goodHealth, '200', 0],
        [{ ...goodHealth, release: { sha: 'b'.repeat(40), id: 'expected' } }, '200', 1],
        [{ ...goodHealth, release: { sha, id: 'old' } }, '200', 1],
        [{ ...goodHealth, database: 'unavailable' }, '200', 1],
        [goodHealth, '404', 1],
      ] as const) {
        const result = spawnSync('bash', [path.resolve(__dirname, 'smoke-' + mode + '.sh'), 'https://api.example.test'], {
          env: { ...process.env, PATH: root + ':' + process.env.PATH, TASK_HEALTH_JSON: JSON.stringify(health), TASK_REVIEW_STATUS: reviewStatus, LINKMAI_EXPECTED_SHA: sha, LINKMAI_EXPECTED_RELEASE_ID: 'expected' },
          encoding: 'utf8', timeout: 5000,
        })
        assert.equal(result.status, expected, result.stdout + result.stderr)
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
