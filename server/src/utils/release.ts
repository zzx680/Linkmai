import { readFileSync } from 'node:fs'
import path from 'node:path'

// Capture at process start: changing current cannot relabel an old process.
export const releaseInfo: { id: string; sha: string } | null = (() => {
  try {
    const value = JSON.parse(readFileSync(path.resolve(__dirname, '../../../.release-info.json'), 'utf8'))
    if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value.id) && /^[0-9a-f]{40}$/.test(value.sha)) {
      return { id: value.id, sha: value.sha }
    }
  } catch { /* Local development and legacy releases have no metadata. */ }
  return null
})()
