import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import path from 'node:path'

const pageSource = readFileSync(path.resolve(__dirname, '../src/pages/materials/index.tsx'), 'utf8')
const styleSource = readFileSync(path.resolve(__dirname, '../src/pages/materials/index.scss'), 'utf8')

test('material cards expose a confirmed delete action with a confirmation step', () => {
  assert.match(pageSource, /removeMaterial/)
  assert.match(pageSource, /showModal\(\{[\s\S]*删除这份材料？/)
  assert.match(pageSource, /aria-label="删除材料"/)
  assert.match(pageSource, /event\.stopPropagation\(\)/)
  assert.match(styleSource, /\.material-delete-button/)
})
