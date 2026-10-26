import { randomUUID } from 'node:crypto'
import { harness } from './service'
import { safeError } from '../utils/safe-error'

export function startHarnessWorker(): () => void {
  if (process.env.HARNESS_ENABLED !== 'true') return () => undefined
  const owner = `worker-${randomUUID()}`
  let running = false
  let stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      for (const item of await harness.store.casesForWork()) {
        if (stopped) break
        const claim = await harness.claim(item.userId, item.caseId, owner)
        if (!claim) continue
        try { await harness.complete(item.userId, item.caseId, claim.run.id, claim.run.leaseToken!) }
        catch (error) {
          await harness.fail(item.userId, item.caseId, claim.run.id, claim.run.leaseToken!).catch(() => undefined)
          console.error('Harness 任务未完成:', safeError(error))
        }
      }
    } catch (error) { console.error('Harness Worker 失败:', safeError(error)) }
    finally { running = false }
  }
  const timer = setInterval(() => { void tick() }, 1000)
  timer.unref()
  void tick()
  return () => { stopped = true; clearInterval(timer) }
}
