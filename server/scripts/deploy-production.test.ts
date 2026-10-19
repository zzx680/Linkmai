import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

for (const failure of ['ci', 'run build', 'test', 'run db:migrate']) {
  test(`production release stops at failed gate: npm ${failure}`, () => {
    const root = mkdtempSync(path.join(tmpdir(), 'linkmai-release-gate-'))
    try {
      const bin = path.join(root, 'bin')
      mkdirSync(bin)
      const shim = (name: string, body: string) => writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
      shim('df', "printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 20000000 1 19999999 1%% /\\n'")
      shim('mkdir', 'for target in "$@"; do case "$target" in -*) ;; /var/log/linkmai) ;; *) /bin/mkdir -p "$target" ;; esac; done')
      shim('chown', 'exit 0')
      shim('chmod', 'exit 0')
      shim('rsync', '/bin/mkdir -p "$LINKMAI_APP_ROOT/releases/$RELEASE_ID/server"')
      shim('node', 'exit 0')
      shim('npm', 'printf "%s\\n" "$*" >> "$TASK_COMMAND_LOG"\nif [ "$*" = "$TASK_FAIL_COMMAND" ]; then exit 42; fi')
      shim('pm2', 'printf "PM2 called\\n" >> "$TASK_COMMAND_LOG"')
      const envFile = path.join(root, 'production.env')
      const log = path.join(root, 'commands.log')
      writeFileSync(envFile, 'NODE_ENV=production\nDB_TYPE=postgres\n')
      const appRoot = path.join(root, 'app')
      const result = spawnSync('bash', [path.resolve(__dirname, 'deploy-production.sh')], {
        env: {
          ...process.env, PATH: `${bin}:${process.env.PATH}`, LINKMAI_APP_ROOT: appRoot,
          LINKMAI_ENV_FILE: envFile, SOURCE_ROOT: root, RELEASE_ID: 'test-release',
          TASK_COMMAND_LOG: log, TASK_FAIL_COMMAND: failure,
        },
        encoding: 'utf8', timeout: 10000,
      })
      assert.equal(result.status, 1, result.stdout + result.stderr)
      const commands = readFileSync(log, 'utf8').trim().split('\n')
      assert.equal(commands.at(-1), failure)
      assert.ok(!commands.includes('prune --omit=dev'))
      assert.ok(!commands.includes('PM2 called'))
      assert.ok(!existsSync(path.join(appRoot, 'current')))
      assert.ok(!existsSync(path.join(appRoot, 'releases/test-release')))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
