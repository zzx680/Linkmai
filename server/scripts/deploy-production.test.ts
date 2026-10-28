import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, symlinkSync, readlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const sha = 'a'.repeat(40)
function fixture(mode: 'staging' | 'production') {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'linkmai-release-')))
  const bin = path.join(root, 'bin')
  const appRoot = path.join(root, mode)
  const stagingRoot = mode === 'staging' ? appRoot : path.join(root, 'staging')
  const source = path.join(root, 'source')
  const log = path.join(root, 'commands.log')
  mkdirSync(bin)
  mkdirSync(path.join(source, 'server'), { recursive: true })
  cpSync(path.resolve(__dirname), path.join(source, 'server/scripts'), { recursive: true })
  writeFileSync(path.join(source, '.release-source-sha'), sha + '\n')
  writeFileSync(log, '')
  const shim = (name: string, body: string) => writeFileSync(path.join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 })
  const jsShim = (name: string, body: string) => writeFileSync(path.join(bin, name), '#!' + process.execPath + '\n' + body, { mode: 0o755 })
  shim('df', "printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 20000000 1 19999999 1%% /\\n'")
  shim('free', "printf 'Mem: 4096 100 3996\\n'")
  shim('flock', '[ "$TASK_FAIL_COMMAND" != lock ]')
  jsShim('mkdir', 'const fs=require("fs");const a=process.argv.slice(2);for(const p of a.filter(x=>!x.startsWith("-")&&x!=="/var/log/linkmai"))fs.mkdirSync(p,{recursive:a.includes("-p")});')
  shim('chown', 'exit 0')
  shim('chmod', 'exit 0')
  shim('rsync', 'printf "rsync\\n" >> "$TASK_COMMAND_LOG"\n[ "$TASK_FAIL_COMMAND" != rsync ] || exit 42\n/bin/cp -R "$SOURCE_ROOT/." "$LINKMAI_APP_ROOT/releases/$RELEASE_ID/"')
  shim('npm', 'printf "%s\\n" "$*" >> "$TASK_COMMAND_LOG"\n[ "$*" != "$TASK_FAIL_COMMAND" ] || exit 42')
  shim('node', 'case "$*" in *validateRuntimeConfig*) printf "config\\n" >> "$TASK_COMMAND_LOG"; [ "$TASK_FAIL_COMMAND" != config ] || exit 42; exit 0;; esac\nexec "$TASK_NODE" "$@"')
  shim('pm2', 'printf "pm2 %s\\n" "$*" >> "$TASK_COMMAND_LOG"\ncase "$*" in startOrReload*) [ "$TASK_FAIL_COMMAND" != pm2 ] || exit 42;; esac')
  shim('curl', 'output=""; url=""\nwhile [ "$#" -gt 0 ]; do case "$1" in --output) shift; output=$1;; https://*|http://*) url=$1;; esac; shift; done\nif [ -z "$output" ]; then printf "health\\n" >> "$TASK_COMMAND_LOG"; [ "$TASK_FAIL_COMMAND" != health ] || exit 42; exit 0; fi\ncase "$url" in */api/health) printf \'%s\' \'{"status":"ok","database":"ok","features":{"paymentOrderHistory":true,"contextualAgent":true},"release":{"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","id":"accepted"}}\' > "$output"; printf 200;; */api/auth/wechat/login) printf 400;; *) printf 401;; esac')
  shim('find', 'case "$*" in *-printf*) exit 0;; esac\nexec /usr/bin/find "$@"')
  // Implement GNU mv/readlink semantics for the macOS local runner too.
  jsShim('mv', 'const fs=require("fs");const a=process.argv.slice(2).filter(x=>!x.startsWith("-"));fs.renameSync(a[0],a[1]);')
  jsShim('readlink', 'const fs=require("fs"),p=require("path");const a=process.argv.at(-1);try{console.log(fs.realpathSync(a))}catch{if(fs.existsSync(p.dirname(a)))console.log(p.resolve(a));else process.exit(1)}')
  const envFile = path.join(root, mode + '.env')
  writeFileSync(envFile, 'NODE_ENV=' + mode + '\nHOST=127.0.0.1\nPORT=' + (mode === 'staging' ? '8100' : '8200') + '\n')
  const makeRelease = (base: string, id: string, ready = true, releaseSha = sha) => {
    const dir = path.join(base, 'releases', id)
    mkdirSync(path.join(dir, 'server/scripts'), { recursive: true })
    writeFileSync(path.join(dir, '.release-sha'), releaseSha)
    writeFileSync(path.join(dir, '.release-info.json'), JSON.stringify({ id, sha: releaseSha }))
    if (ready) writeFileSync(path.join(dir, '.release-ready'), 'ok')
    for (const target of ['staging', 'production']) {
      writeFileSync(path.join(dir, 'server/ecosystem.' + target + '.config.js'), '')
      writeFileSync(path.join(dir, 'server/scripts/smoke-' + target + '.sh'), 'exit 0\n')
    }
    return dir
  }
  if (mode === 'production') {
    const staged = makeRelease(stagingRoot, 'accepted')
    symlinkSync(staged, path.join(stagingRoot, 'current'))
  }
  // Candidate smoke can fail independently of old-version recovery smoke.
  for (const target of ['staging', 'production']) {
    writeFileSync(path.join(source, 'server/scripts/smoke-' + target + '.sh'), 'if [ "${LINKMAI_EXPECTED_RELEASE_ID:-}" = accepted ]; then exit 0; fi\nprintf "smoke\\n" >> "$TASK_COMMAND_LOG"\n[ "$TASK_FAIL_COMMAND" != smoke ]\n')
  }
  const env = {
    ...process.env, PATH: bin + ':' + process.env.PATH, LINKMAI_APP_ROOT: appRoot,
    LINKMAI_ENV_FILE: envFile, SOURCE_ROOT: source, RELEASE_ID: 'candidate', RELEASE_SHA: sha,
    STAGING_RELEASE_ID: 'accepted', LINKMAI_STAGING_ROOT: stagingRoot,
    LINKMAI_DEPLOY_LOCK: path.join(root, 'deploy.lock'), TASK_COMMAND_LOG: log,
    TASK_FAIL_COMMAND: '', TASK_NODE: process.execPath,
  }
  const run = (failure = '', rollback = false, args: string[] = []) => spawnSync('bash', [path.resolve(__dirname, (rollback ? 'rollback-' : 'deploy-') + mode + '.sh'), ...args], {
    env: { ...env, TASK_FAIL_COMMAND: failure }, encoding: 'utf8', timeout: 15000,
  })
  return { root, appRoot, stagingRoot, envFile, log, env, makeRelease, run }
}

for (const mode of ['staging', 'production'] as const) {
  for (const failure of ['rsync', 'ci', 'run build', 'test', 'config', 'run db:migrate', 'prune --omit=dev']) {
    test(mode + ' stops and preserves current when gate fails: ' + failure, () => {
      const f = fixture(mode)
      try {
        const old = f.makeRelease(f.appRoot, 'old')
        symlinkSync(old, path.join(f.appRoot, 'current'))
        const result = f.run(failure)
        assert.notEqual(result.status, 0, result.stdout + result.stderr)
        const commands = readFileSync(f.log, 'utf8').trim().split('\n')
        assert.equal(commands.at(-1), failure)
        assert.ok(!commands.some(line => line.startsWith('pm2 ')))
        assert.equal(readlinkSync(path.join(f.appRoot, 'current')), old)
        assert.ok(!existsSync(path.join(f.appRoot, 'releases/candidate')))
      } finally { rmSync(f.root, { recursive: true, force: true }) }
    })
  }
  test(mode + ' refuses to overwrite an existing release', () => {
    const f = fixture(mode)
    try {
      const existing = f.makeRelease(f.appRoot, 'candidate')
      writeFileSync(path.join(existing, 'sentinel'), 'keep')
      symlinkSync(existing, path.join(f.appRoot, 'current'))
      assert.notEqual(f.run().status, 0)
      assert.equal(readFileSync(path.join(existing, 'sentinel'), 'utf8'), 'keep')
      assert.ok(!readFileSync(f.log, 'utf8').includes('rsync'))
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
  test(mode + ' serializes release operations', () => {
    const f = fixture(mode)
    try { assert.notEqual(f.run('lock').status, 0); assert.equal(readFileSync(f.log, 'utf8'), '') }
    finally { rmSync(f.root, { recursive: true, force: true }) }
  })
  test(mode + ' success records SHA and previous target', () => {
    const f = fixture(mode)
    try {
      const old = f.makeRelease(f.appRoot, 'old')
      symlinkSync(old, path.join(f.appRoot, 'current'))
      const result = f.run()
      assert.equal(result.status, 0, result.stdout + result.stderr)
      assert.equal(readlinkSync(path.join(f.appRoot, 'previous')), old)
      const candidate = path.join(f.appRoot, 'releases/candidate')
      assert.equal(readlinkSync(path.join(f.appRoot, 'current')), candidate)
      assert.ok(existsSync(path.join(candidate, '.release-ready')))
      assert.deepEqual(JSON.parse(readFileSync(path.join(candidate, '.release-info.json'), 'utf8')), { id: 'candidate', sha })
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
  test(mode + ' failed candidate smoke restores old release', () => {
    const f = fixture(mode)
    try {
      const old = f.makeRelease(f.appRoot, 'old')
      symlinkSync(old, path.join(f.appRoot, 'current'))
      const result = f.run('smoke')
      assert.notEqual(result.status, 0)
      assert.equal(readlinkSync(path.join(f.appRoot, 'current')), old)
      assert.ok(!existsSync(path.join(f.appRoot, 'releases/candidate')))
      assert.match(readFileSync(f.log, 'utf8'), /pm2 save/)
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
  test(mode + ' failed recovery retains candidate for diagnosis', () => {
    const f = fixture(mode)
    try {
      const old = f.makeRelease(f.appRoot, 'old')
      symlinkSync(old, path.join(f.appRoot, 'current'))
      const result = f.run('pm2')
      assert.notEqual(result.status, 0)
      assert.ok(existsSync(path.join(f.appRoot, 'releases/candidate')))
      assert.match(result.stderr, /保留候选目录/)
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
  test(mode + ' rollback uses recorded previous target instead of directory age', () => {
    const f = fixture(mode)
    try {
      const original = f.makeRelease(f.appRoot, 'original')
      const previous = f.makeRelease(f.appRoot, 'previous')
      f.makeRelease(f.appRoot, 'unrelated')
      symlinkSync(original, path.join(f.appRoot, 'current'))
      symlinkSync(previous, path.join(f.appRoot, 'previous'))
      const result = f.run('', true)
      assert.equal(result.status, 0, result.stdout + result.stderr)
      assert.equal(readlinkSync(path.join(f.appRoot, 'current')), previous)
      assert.equal(readlinkSync(path.join(f.appRoot, 'previous')), original)
      assert.match(readFileSync(f.log, 'utf8'), /health/)
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
  test(mode + ' rollback without recorded previous refuses implicit age selection', () => {
    const f = fixture(mode)
    try {
      const original = f.makeRelease(f.appRoot, 'original')
      symlinkSync(original, path.join(f.appRoot, 'current'))
      assert.notEqual(f.run('', true).status, 0)
      assert.equal(readlinkSync(path.join(f.appRoot, 'current')), original)
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
}

test('production rejects drifted staging SHA before installation or migration', () => {
  const f = fixture('production')
  try {
    writeFileSync(path.join(f.stagingRoot, 'releases/accepted/.release-sha'), 'b'.repeat(40))
    assert.notEqual(f.run().status, 0)
    assert.equal(readFileSync(f.log, 'utf8'), '')
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

for (const mode of ['staging', 'production'] as const) {
  test(mode + ' rollback smoke failure restores original version', () => {
    const f = fixture(mode)
    try {
      const original = f.makeRelease(f.appRoot, 'original')
      const bad = f.makeRelease(f.appRoot, 'bad')
      writeFileSync(path.join(bad, 'server/scripts/smoke-' + mode + '.sh'), 'exit 42\n')
      symlinkSync(original, path.join(f.appRoot, 'current'))
      const result = f.run('', true, [bad])
      assert.notEqual(result.status, 0)
      assert.equal(readlinkSync(path.join(f.appRoot, 'current')), original)
      assert.ok(existsSync(bad))
      assert.match(readFileSync(f.log, 'utf8'), /pm2 save/)
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
  test(mode + ' rejects a wrong environment file before migration', () => {
    const f = fixture(mode)
    try {
      writeFileSync(f.envFile, 'NODE_ENV=development\nPORT=8000\nHOST=0.0.0.0\n')
      const result = f.run()
      assert.notEqual(result.status, 0)
      assert.ok(!readFileSync(f.log, 'utf8').includes('run db:migrate'))
      assert.ok(!existsSync(path.join(f.appRoot, 'current')))
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
}
