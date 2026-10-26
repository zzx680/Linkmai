import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { materialSnapshot } from '../src/services/material-snapshot'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

test('AgentRun PostgreSQL row-lock concurrency', { skip: process.env.AGENT_RUN_POSTGRES_TEST !== '1', timeout: 30000 }, async t => {
  assert.equal(process.env.NODE_ENV, 'test')
  assert.match(process.env.POSTGRES_DB || '', /test/)
  const { db, pool } = await import('../src/db/postgres')
  const users: string[] = []
  async function fixture() {
    const user = await db.createUser(`run-concurrency-${Math.random()}`)
    users.push(user.id)
    const caseData = await db.createCase(user.id, 'Concurrency test')
    await pool.query("INSERT INTO case_entitlements (id,case_id,user_id,status,amount_cents) VALUES ($1,$2,$3,'paid',4990)", [`ent-${user.id}`, caseData.id, user.id])
    return { user, caseData }
  }
  function gateNextSelect(pattern: RegExp) {
    const locked = deferred()
    const release = deferred()
    const contender = deferred()
    const connect = pool.connect.bind(pool)
    let first = true
    const stub = mock.method(pool, 'connect', async () => {
      const client = await connect()
      const isFirst = first
      first = false
      return {
        query: async (sql: string, values?: unknown[]) => {
          if (!isFirst && sql !== 'BEGIN') contender.resolve()
          const result = await client.query(sql, values)
          if (isFirst && pattern.test(sql)) {
            locked.resolve()
            await release.promise
          }
          return result
        },
        release: () => client.release(),
      } as never
    })
    return { locked: locked.promise, contender: contender.promise, release: release.resolve, restore: () => stub.mock.restore() }
  }
  try {
    for (const publishFirst of [true, false]) {
      await t.test(`publication versus failure, publication first: ${publishFirst}`, async () => {
        const { user, caseData } = await fixture()
        const { run } = await db.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'race' })
        assert.ok(run)
        await db.claimAgentRun(run.id)
        const gate = gateNextSelect(publishFirst ? /SELECT ar\.\*/ : /SELECT \* FROM agent_runs/)
        const publish = () => db.publishRunReport(run.id, { analysis: 'original' }, { userId: user.id, materialSnapshot: materialSnapshot([]) })
        const fail = () => db.updateAgentRun(run.id, { status: 'failed', safeErrorCode: 'LATE_FAILURE' })
        const first = publishFirst ? publish() : fail()
        const firstResult = Promise.allSettled([first])
        let secondResult: Promise<PromiseSettledResult<unknown>[]> | undefined
        try {
          await gate.locked
          const second = publishFirst ? fail() : publish()
          secondResult = Promise.allSettled([second])
          await gate.contender
          gate.restore()
          gate.release()
          assert.equal((await firstResult)[0].status, 'fulfilled')
          const loser = (await secondResult)[0]
          assert.equal(loser.status, 'rejected')
          if (loser.status === 'rejected') assert.match(loser.reason.message, publishFirst ? /INVALID_AGENT_RUN_TRANSITION/ : /AGENT_RUN_NOT_RUNNING/)
          assert.equal((await db.findAgentRun(run.id))?.status, publishFirst ? 'succeeded' : 'failed')
          assert.equal(Boolean(await db.getReportByCase(caseData.id)), publishFirst)
          assert.deepEqual((await db.getRunEvents(user.id, caseData.id, run.id))?.map(event => event.status), ['queued', 'running', publishFirst ? 'succeeded' : 'failed'])
        } finally {
          gate.release()
          await firstResult
          await secondResult
          gate.restore()
        }
      })
    }
    await t.test('creation waits for a revision change and rejects stale input without inserting', async () => {
      const { user, caseData } = await fixture()
      const gate = gateNextSelect(/SELECT id, input_revision FROM cases/)
      const changing = db.persistConfirmedFacts(user.id, caseData.id, [{ key: 'location', label: '地点', value: '杭州', source: 'user_text' }])
      const changeResult = Promise.allSettled([changing])
      let creationResult: Promise<PromiseSettledResult<unknown>[]> | undefined
      try {
        await gate.locked
        creationResult = Promise.allSettled([db.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'revision-race' })])
        await gate.contender
        gate.restore()
        gate.release()
        assert.equal((await changeResult)[0].status, 'fulfilled')
        const result = (await creationResult)[0]
        assert.equal(result.status, 'rejected')
        if (result.status === 'rejected') assert.match(result.reason.message, /STALE_INPUT_REVISION/)
        assert.equal(await db.findLatestReportRun(caseData.id, 0), null)
        const events = await pool.query('SELECT re.id FROM run_events re JOIN agent_runs ar ON ar.id=re.run_id WHERE ar.case_id=$1', [caseData.id])
        assert.equal(events.rows.length, 0)
      } finally {
        gate.release()
        await changeResult
        await creationResult
        gate.restore()
      }
    })
    await t.test('creation holds the revision lock until its insert commits', async () => {
      const { user, caseData } = await fixture()
      const gate = gateNextSelect(/SELECT input_revision FROM cases/)
      const creation = Promise.allSettled([db.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'creation-first' })])
      let changing: Promise<PromiseSettledResult<unknown>[]> | undefined
      try {
        await gate.locked
        changing = Promise.allSettled([db.persistConfirmedFacts(user.id, caseData.id, [{ key: 'location', label: '地点', value: '宁波', source: 'user_text' }])])
        await gate.contender
        gate.restore()
        gate.release()
        const result = (await creation)[0]
        assert.equal(result.status, 'fulfilled')
        assert.equal((await changing)[0].status, 'fulfilled')
        if (result.status === 'fulfilled') {
          assert.ok(result.value.run)
          assert.equal(result.value.run.inputRevision, 0)
          await db.claimAgentRun(result.value.run.id)
          await assert.rejects(db.publishRunReport(result.value.run.id, { analysis: 'outdated' }, { userId: user.id, materialSnapshot: materialSnapshot([]) }), /STALE_INPUT_REVISION/)
          assert.equal((await db.findAgentRun(result.value.run.id))?.status, 'stale')
        }
      } finally {
        gate.release()
        await creation
        await changing
        gate.restore()
      }
    })
    await t.test('a failed run is retryable and only one concurrent claim wins', async () => {
      const { user, caseData } = await fixture()
      const { run } = await db.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: 'retry' })
      await db.claimAgentRun(run.id)
      await db.updateAgentRun(run.id, { status: 'failed', safeErrorCode: 'TEMPORARY_FAILURE', output: { partial: true } })
      const claims = await Promise.all(Array.from({ length: 8 }, () => db.claimAgentRun(run.id)))
      assert.equal(claims.filter(Boolean).length, 1)
      const retried = await db.findAgentRun(run.id)
      assert.equal(retried?.status, 'running')
      assert.equal(retried?.safeErrorCode, undefined)
      assert.equal(retried?.output, undefined)
      assert.equal(retried?.completedAt, null)
      assert.deepEqual((await db.getRunEvents(user.id, caseData.id, run.id))?.map(event => event.status), ['queued', 'running', 'failed', 'running'])
    })

    await t.test('all terminal states preserve output, errors, timestamps and events', async () => {
      const { user, caseData } = await fixture()
      for (const status of ['succeeded', 'failed', 'stale', 'cancelled'] as const) {
        const { run } = await db.createAgentRun({ caseId: caseData.id, task: 'report', inputRevision: 0, skillVersion: status })
        assert.ok(run)
        await db.claimAgentRun(run.id)
        await db.updateAgentRun(run.id, { status, output: { original: true } })
        const before = await db.findAgentRun(run.id)
        const events = await db.getRunEvents(user.id, caseData.id, run.id)
        for (const next of ['queued', 'running', 'succeeded', 'failed', 'stale', 'cancelled'] as const) {
          await assert.rejects(db.updateAgentRun(run.id, { status: next, output: { overwritten: true }, safeErrorCode: 'LATE_FAILURE' }), /INVALID_AGENT_RUN_TRANSITION/)
        }
        assert.deepEqual(await db.findAgentRun(run.id), before)
        assert.deepEqual(await db.getRunEvents(user.id, caseData.id, run.id), events)
      }
    })
  } finally {
    for (const id of users) await pool.query('DELETE FROM users WHERE id=$1', [id])
    await pool.end()
  }
})
