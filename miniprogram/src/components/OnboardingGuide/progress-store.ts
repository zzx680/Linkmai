import { readGuideProgress, type GuideId, type GuideProgress } from './state'

// All mounted tabs share one progress source. Stale pages must not revive a step
// already completed on another tab, even when persistent storage is unavailable.
export function createGuideProgressStore(read: () => unknown, write: (value: GuideProgress) => void) {
  let progress: GuideProgress | undefined
  const listeners = new Set<(value: GuideProgress) => void>()
  const get = () => {
    if (!progress) {
      try { progress = readGuideProgress(read()) }
      catch { progress = { skipped: false, seen: [] } }
    }
    return progress
  }
  const publish = (value: GuideProgress) => {
    progress = value
    try { write(value) } catch { /* Keep progress for this session. */ }
    listeners.forEach(listener => listener(value))
    return value
  }
  const complete = (ids: GuideId[]) => {
    const current = get()
    if (ids.every(id => current.seen.includes(id))) return current
    return publish({ ...current, seen: [...new Set([...current.seen, ...ids])] })
  }
  return {
    get, complete,
    skip: () => publish({ ...get(), skipped: true }),
    restart: () => publish({ skipped: false, seen: [] }),
    subscribe(listener: (value: GuideProgress) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
