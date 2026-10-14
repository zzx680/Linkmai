import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const profileSource = readFileSync(path.resolve(__dirname, '../src/pages/profile/index.tsx'), 'utf8')
const apiSource = readFileSync(path.resolve(__dirname, '../src/services/api.ts'), 'utf8')
const storeSource = readFileSync(path.resolve(__dirname, '../src/store/index.ts'), 'utf8')

describe('WeChat profile authorization', () => {
  it('uses current WeChat avatar and nickname controls without deprecated profile authorization', () => {
    assert.match(profileSource, /openType="chooseAvatar"/)
    assert.match(profileSource, /type=\{IS_H5 \? 'text' : 'nickname'\}/)
    assert.doesNotMatch(profileSource, /getUserProfile|getUserInfo/)
  })

  it('persists the temporary avatar through the authenticated profile endpoint', () => {
    assert.match(apiSource, /\/auth\/profile\/avatar/)
    assert.match(apiSource, /Taro\.uploadFile/)
    assert.match(apiSource, /Authorization: `Bearer \$\{token\}`/)
    assert.doesNotMatch(storeSource, /avatar:\s*filePath|avatar:\s*avatarUrl/)
  })

  it('keeps profile authorization optional and user initiated', () => {
    assert.match(profileSource, /onClick=\{openProfileEditor\}/)
    assert.match(profileSource, /暂不设置/)
    const didShowBody = profileSource.slice(
      profileSource.indexOf('useDidShow(() =>'),
      profileSource.indexOf('const openTask')
    )
    assert.doesNotMatch(didShowBody, /chooseAvatar|openProfileEditor/)
  })
})
