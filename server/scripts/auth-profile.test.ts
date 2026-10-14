import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

function mockModule(path: string, exports: unknown) {
  const id = require.resolve(path)
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule
}

type User = {
  id: string
  openid: string
  nickname?: string
  avatar_key?: string
}

let user: User | null
let failProfileUpdate = false
let commitThenFail = false
const profileUpdates: Array<{ userId: string; updates: { nickname?: string; avatarKey?: string } }> = []
const uploads: Array<{ userId: string; extension: string; size: number }> = []
const deletes: string[] = []
const signedKeys: string[] = []

const dbMock = {
  async findUserById(userId: string) {
    return user?.id === userId ? { ...user } : null
  },
  async findUserByOpenid() { return user ? { ...user } : null },
  async createUser() { return user },
  async updateUserProfile(userId: string, updates: { nickname?: string; avatarKey?: string }) {
    profileUpdates.push({ userId, updates })
    if (!user || user.id !== userId) return null
    if (commitThenFail) {
      if (updates.avatarKey !== undefined) user.avatar_key = updates.avatarKey
      throw new Error('UNKNOWN_COMMIT_RESULT')
    }
    if (failProfileUpdate) return null
    if (updates.nickname !== undefined) user.nickname = updates.nickname
    if (updates.avatarKey !== undefined) user.avatar_key = updates.avatarKey
    return { ...user }
  },
  async updateUser() { return user },
}

mockModule('../src/db', { db: dbMock })
mockModule('../src/services/oss', {
  async uploadUserAvatar(userId: string, buffer: Buffer, extension: string) {
    uploads.push({ userId, extension, size: buffer.length })
    return { key: `avatars/${userId}/avatar`, url: 'private', name: 'avatar', size: buffer.length }
  },
  async deleteFile(key: string) { deletes.push(key) },
  async getSignedUrl(key: string) {
    signedKeys.push(key)
    return `https://signed.invalid/${key}`
  },
})
class WechatLoginError extends Error {}
mockModule('../src/services/wechat', {
  WechatLoginError,
  async exchangeWechatCode() { return { openid: 'openid-1' } },
})

const authRouter = require('../src/routes/auth').default as typeof import('../src/routes/auth').default

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this },
    json(value: any) { this.body = value; return this },
  }
}

async function callFinalHandler(method: 'get' | 'patch' | 'post', path: string, request: any) {
  const layer = (authRouter as any).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method])
  assert.ok(layer, `missing ${method.toUpperCase()} ${path}`)
  const res = response()
  const handler = layer.route.stack.at(-1).handle
  await handler(request, res)
  return res
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00])

beforeEach(() => {
  user = { id: 'user-1', openid: 'openid-1', avatar_key: 'avatars/user-1/old.jpg' }
  failProfileUpdate = false
  commitThenFail = false
  profileUpdates.length = uploads.length = deletes.length = signedKeys.length = 0
})

test('profile nickname is trimmed and only updates the authenticated user', async () => {
  const res = await callFinalHandler('patch', '/profile', {
    userId: 'user-1',
    body: { nickname: '  小灵  ' },
  })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.nickname, '小灵')
  assert.equal(res.body.data.avatar, 'https://signed.invalid/avatars/user-1/old.jpg')
  assert.deepEqual(profileUpdates, [{ userId: 'user-1', updates: { nickname: '小灵' } }])
})

test('profile nickname rejects unknown fields, blanks, control characters and overlong values', async () => {
  const bodies = [
    { nickname: '小灵', openid: 'forged' },
    { nickname: '   ' },
    { nickname: '名字\n注入' },
    { nickname: '名'.repeat(31) },
  ]

  for (const body of bodies) {
    const res = await callFinalHandler('patch', '/profile', { userId: 'user-1', body })
    assert.equal(res.statusCode, 400)
  }
  assert.equal(profileUpdates.length, 0)
})

test('avatar upload uses the authenticated user prefix and replaces the controlled key', async () => {
  const res = await callFinalHandler('post', '/profile/avatar', {
    userId: 'user-1',
    file: { mimetype: 'image/jpeg', buffer: jpeg, size: jpeg.length },
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(uploads, [{ userId: 'user-1', extension: 'jpg', size: jpeg.length }])
  assert.deepEqual(profileUpdates, [{ userId: 'user-1', updates: { avatarKey: 'avatars/user-1/avatar' } }])
  assert.deepEqual(deletes, ['avatars/user-1/old.jpg'])
  assert.equal(res.body.data.avatar, 'https://signed.invalid/avatars/user-1/avatar')
})

test('avatar upload rejects a forged image signature before OSS work', async () => {
  const res = await callFinalHandler('post', '/profile/avatar', {
    userId: 'user-1',
    file: { mimetype: 'image/jpeg', buffer: Buffer.from('not-an-image'), size: 12 },
  })

  assert.equal(res.statusCode, 400)
  assert.equal(uploads.length, 0)
  assert.equal(profileUpdates.length, 0)
})

test('avatar upload leaves the stable object available for retry when the database update fails', async () => {
  failProfileUpdate = true
  const res = await callFinalHandler('post', '/profile/avatar', {
    userId: 'user-1',
    file: { mimetype: 'image/jpeg', buffer: jpeg, size: jpeg.length },
  })

  assert.equal(res.statusCode, 500)
  assert.deepEqual(deletes, [])
  assert.equal(user?.avatar_key, 'avatars/user-1/old.jpg')
})

test('avatar upload keeps the stable object when the database commit result is unknown', async () => {
  commitThenFail = true
  const res = await callFinalHandler('post', '/profile/avatar', {
    userId: 'user-1',
    file: { mimetype: 'image/jpeg', buffer: jpeg, size: jpeg.length },
  })

  assert.equal(res.statusCode, 500)
  assert.deepEqual(deletes, [])
  assert.equal(user?.avatar_key, 'avatars/user-1/avatar')
})

test('session preserves a legacy HTTPS avatar when no managed key exists', async () => {
  user = { id: 'user-1', openid: 'openid-1', avatar: 'https://legacy.invalid/avatar.jpg' }
  const res = await callFinalHandler('get', '/session', { userId: 'user-1' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.avatar, 'https://legacy.invalid/avatar.jpg')
  assert.deepEqual(signedKeys, [])
})

test('session regenerates a signed avatar URL from the stored key', async () => {
  const res = await callFinalHandler('get', '/session', { userId: 'user-1' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(signedKeys, ['avatars/user-1/old.jpg'])
  assert.equal(res.body.data.avatar, 'https://signed.invalid/avatars/user-1/old.jpg')
  assert.equal('avatarKey' in res.body.data, false)
  assert.equal('avatar_key' in res.body.data, false)
})
