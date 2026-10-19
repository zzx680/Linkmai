import { pool } from '../db/postgres'
import { z } from 'zod'

const argsSchema = z.union([
  z.tuple([z.literal('list')]),
  z.tuple([z.literal('respond'), z.string().min(1), z.enum(['processing', 'completed', 'rejected']), z.string().trim().min(1).max(1000)])
])

// This tool records operator handling; it never deletes data or refunds orders.
export async function managePrivacyRequests(args: string[]) {
  const parsed = argsSchema.safeParse(args)
  if (!parsed.success) throw new Error('用法: privacy-requests list | respond <申请编号> <processing|completed|rejected> <回复文本>')
  const input = parsed.data
  if (input[0] === 'list') {
    const result = await pool.query("SELECT id, user_id, kind, status, created_at FROM privacy_requests WHERE status IN ('pending', 'processing') ORDER BY created_at ASC LIMIT 100")
    return result.rows
  }
  const [, id, status, response] = input
  const result = await pool.query(
    `UPDATE privacy_requests SET status = $2, response = $3, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'processing')
     RETURNING id, kind, status, response, updated_at`,
    [id, status, response]
  )
  if (!result.rows[0]) throw new Error('申请不存在或已结案')
  return result.rows
}

if (require.main === module) {
  managePrivacyRequests(process.argv.slice(2))
    .then(rows => console.table(rows))
    .catch(error => { console.error(error instanceof Error ? error.message : '处理失败'); process.exitCode = 1 })
    .finally(() => pool.end())
}
