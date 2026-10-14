import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TabNavigationController } from '../src/custom-tab-bar/navigation-controller'

const home = '/pages/case/index'
const agent = '/pages/agent/index'
const profile = '/pages/profile/index'
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

function fixture() {
  const requests: Array<{ route: string; resolve: () => void; reject: () => void }> = []
  let errors = 0
  const navigation = new TabNavigationController(home, route => new Promise<void>((resolve, reject) => {
    requests.push({ route, resolve, reject: () => reject(new Error('native switch failed')) })
  }), () => { errors++ })
  return { navigation, requests, errors: () => errors }
}

test('rapid taps serialize native switches and land on the last destination', async () => {
  const { navigation, requests } = fixture()
  const highlighted: string[] = []
  navigation.subscribe(route => highlighted.push(route))
  navigation.request(agent)
  await settle()
  navigation.request(agent)
  navigation.request(home)
  navigation.request(profile)
  assert.equal(requests.length, 1)
  assert.deepEqual(highlighted, [home], 'highlight stays on the actual page until success')
  requests[0].resolve()
  await settle()
  assert.deepEqual(requests.map(item => item.route), [agent, profile])
  requests[1].resolve()
  await settle()
  assert.deepEqual(highlighted, [home, agent, profile])
  navigation.request(profile)
  await settle()
  assert.equal(requests.length, 2, 'tapping the active tab does not reload it')
})

test('tapping the original page during a switch returns there after completion', async () => {
  const { navigation, requests } = fixture()
  navigation.request(agent)
  await settle()
  navigation.request(home)
  requests[0].resolve()
  await settle()
  assert.deepEqual(requests.map(item => item.route), [agent, home])
  requests[1].resolve()
  await settle()
})

test('failure preserves the current highlight and allows retry', async () => {
  const { navigation, requests, errors } = fixture()
  const highlighted: string[] = []
  navigation.subscribe(route => highlighted.push(route))
  navigation.request(profile)
  await settle()
  requests[0].reject()
  await settle()
  assert.equal(errors(), 1)
  assert.deepEqual(highlighted, [home])
  navigation.request(profile)
  await settle()
  assert.equal(requests.length, 2)
  requests[1].resolve()
  await settle()
  assert.equal(highlighted.at(-1), profile)
})

test('a failed earlier switch still processes the newer destination', async () => {
  const { navigation, requests, errors } = fixture()
  navigation.request(agent)
  await settle()
  navigation.request(profile)
  requests[0].reject()
  await settle()
  assert.deepEqual(requests.map(item => item.route), [agent, profile])
  assert.equal(errors(), 0)
  requests[1].resolve()
  await settle()
})

test('page show synchronizes separate cached tab bars and cleans up subscriptions', () => {
  const { navigation } = fixture()
  const first: string[] = []
  const second: string[] = []
  const unsubscribe = navigation.subscribe(route => first.push(route))
  navigation.subscribe(route => second.push(route))
  navigation.sync(profile)
  navigation.sync(home)
  assert.deepEqual(first, [home, profile, home])
  assert.deepEqual(second, first)
  unsubscribe()
  navigation.sync(agent)
  assert.equal(first.at(-1), home)
  assert.equal(second.at(-1), agent)
})
