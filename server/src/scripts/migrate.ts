import { createHash } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { pool } from '../db/postgres'

const migrationPattern = /^\d{4}_[a-z0-9_-]+\.sql$/
const lockName = 'linkmai_schema_migrations'

export interface MigrationFile {
  version: string
  filename: string
  checksum: string
  sql: string
}

export async function loadMigrations(directory: string): Promise<MigrationFile[]> {
  const filenames = (await readdir(directory))
    .filter(filename => migrationPattern.test(filename))
    .sort()

  return Promise.all(filenames.map(async filename => {
    const sql = await readFile(path.join(directory, filename), 'utf8')
    return {
      version: filename.slice(0, 4),
      filename,
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    }
  }))
}

export async function runMigrations(directory = path.resolve(process.cwd(), 'migrations')) {
  const migrations = await loadMigrations(directory)
  if (migrations.length === 0) throw new Error(`未找到数据库迁移: ${directory}`)

  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(4) PRIMARY KEY,
        filename TEXT NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const appliedResult = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version'
    )
    const applied = new Map(appliedResult.rows.map(row => [row.version, row.checksum]))

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.version)
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(`迁移已被修改: ${migration.filename}`)
        }
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(
          'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.filename, migration.checksum]
        )
        await client.query('COMMIT')
        console.log(`已应用迁移 ${migration.filename}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }

    return migrations.length
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]).catch(() => undefined)
    client.release()
  }
}

async function main() {
  try {
    const count = await runMigrations()
    console.log(`数据库迁移完成，共发现 ${count} 个迁移文件`)
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('数据库迁移失败:', error)
    process.exit(1)
  })
}
