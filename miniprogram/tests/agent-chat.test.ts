import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as labels from '../src/components/AgentChat/labels'

const file = path.resolve(__dirname, '../src/components/AgentChat/index.tsx')
const localRequire = createRequire(file)
function loadChat(h5 = false) {
  const module = { exports: {} as Record<string, (props: any) => React.ReactElement<any>> }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module, exports: module.exports,
    require(id: string) {
      if (id === '@tarojs/components') return {
        View: 'div', Button: 'button', Image: 'img', Slot: 'slot',
        Text: ({ selectable: _selectable, ...props }: any) => React.createElement('span', props),
      }
      if (id === '../../config/env') return { IS_H5: h5 }
      if (id === './labels') return labels
      if (id === '../Icon') return { __esModule: true, default: () => React.createElement('img', { alt: '' }) }
      if (id === '../ThinkingOrb') return { __esModule: true, default: () => React.createElement('div', { role: 'status', 'aria-label': '正在整理案件信息' }) }
      if (id.endsWith('.scss')) return {}
      return localRequire(id)
    },
  })
  return module.exports
}

function find(node: React.ReactNode, type: string, className?: string): React.ReactElement<any> | undefined {
  if (!React.isValidElement<any>(node)) return
  if (node.type === type && (!className || node.props.className === className)) return node
  return React.Children.toArray(node.props.children).map(child => find(child, type, className)).find(Boolean)
}

test('native messages retain literal user content and image attachments', () => {
  const { AgentChatMessage } = loadChat()
  const node = AgentChatMessage({ message: {
    id: 'm1', role: 'user', content: '<script>hello</script>\n第二行', images: ['https://example.com/photo.png'],
  } })
  assert.equal(node.type, 't-chat-message')
  assert.equal(node.props.placement, 'right')
  assert.equal(node.props.content[0].type, 'attachment')
  assert.equal(node.props.content[0].data[0].fileType, 'image')
  assert.equal(node.props.content[1].type, 'text')
  assert.equal(node.props.content[1].data, '<script>hello</script>\n第二行')
})

test('chat messages do not render an assistant name label', () => {
  const native = loadChat().AgentChatMessage({ message: { role: 'assistant', content: '已收到' } })
  assert.equal(native.props.name, '')
  const h5 = renderToStaticMarkup(loadChat(true).AgentChatMessage({ message: { role: 'assistant', content: '已收到' } }))
  assert.doesNotMatch(h5, /灵迈助手/)
})

test('pending replies use the shared thinking orb in native and H5 without rendering empty messages', () => {
  for (const h5 of [false, true]) {
    const html = renderToStaticMarkup(loadChat(h5).AgentChatMessage({ pending: true }))
    assert.match(html, /role="status"/)
    assert.match(html, /正在整理案件信息/)
    assert.doesNotMatch(html, /t-chat-message|chat-preview-content/)
  }
})

test('native sender bridges TDesign detail events and avoids unsupported stop/upload workflows', () => {
  const { AgentChatSender } = loadChat()
  const changed: string[] = [], sent: string[] = [], heights: number[] = []
  let uploads = 0
  const props = {
    value: '旧草稿', sending: false, uploading: false,
    onChange: (value: string) => changed.push(value), onSend: (value: string) => sent.push(value),
    onKeyboardHeightChange: (height: number) => heights.push(height), onAttach: () => uploads++,
  }
  const node = AgentChatSender(props)
  const sender = find(node, 't-chat-sender')!
  sender.props.onChange({ detail: { value: '新的内容' } })
  sender.props.onSend({ detail: { value: '确认发送内容' } })
  sender.props.onKeyboardheightchange({ detail: { height: 280 } })
  sender.props.onBlur()
  assert.deepEqual(changed, ['新的内容'])
  assert.deepEqual(sent, ['确认发送内容'])
  assert.deepEqual(heights, [280, 0])
  assert.equal(sender.props.disabled, false)
  assert.equal(sender.props.loading, undefined)
  assert.equal(JSON.stringify(sender.props['render-presets']), '[{"name":"send","type":"icon"}]')
  assert.equal(find(node, 'slot')!.props.name, 'footer-prefix')
  const upload = find(node, 'button', 'composer-upload')!
  assert.equal(upload.props.disabled, false)
  upload.props.onClick()
  assert.equal(uploads, 1)
  const busy = AgentChatSender({ ...props, value: '', sending: true, uploading: true })
  assert.equal(find(busy, 't-chat-sender')!.props.disabled, true)
  assert.equal(find(busy, 'button', 'composer-upload')!.props.disabled, true)
  find(busy, 't-chat-sender')!.props.onSend({ detail: { value: '不应重复发送' } })
  assert.equal(sent.length, 1)
})

test('H5 preview escapes content and handles multiline and IME input without accidental send', () => {
  const { AgentChatMessage, AgentChatSender } = loadChat(true)
  const html = renderToStaticMarkup(AgentChatMessage({ message: { role: 'assistant', content: '<script>alert(1)</script>' } }))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  const sent: string[] = []
  const node = AgentChatSender({ value: '事故经过', sending: false, uploading: false,
    onChange() {}, onSend: (value: string) => sent.push(value), onKeyboardHeightChange() {}, onAttach() {},
  })
  const input = find(node, 'textarea')!
  input.props.onKeyDown({ key: 'Enter', shiftKey: true, nativeEvent: {}, preventDefault() {} })
  input.props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true }, preventDefault() {} })
  assert.equal(sent.length, 0)
  input.props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault() {} })
  assert.deepEqual(sent, ['事故经过'])
})

test('dictation shortcut starts speech input without overwriting a draft or sending a message', () => {
  const { AgentChatSender } = loadChat(true)
  const changes: string[] = []
  let dictated = 0, sent = 0
  const props = { value: '', sending: false, uploading: false, onChange: (value: string) => changes.push(value), onSend() { sent++ }, onKeyboardHeightChange() {}, onAttach() {}, onDictate() { dictated++ } }
  find(AgentChatSender(props), 'button', 'composer-prompt')!.props.onClick()
  find(AgentChatSender({ ...props, value: '我在路口被追尾' }), 'button', 'composer-prompt')!.props.onClick()
  assert.equal(dictated, 2)
  assert.equal(sent, 0)
  assert.deepEqual(changes, [])
  const html = renderToStaticMarkup(AgentChatSender(props))
  assert.ok(html.includes('口述经过'))
  assert.ok(!html.includes('描述经过'))
})

test('dictation blocks upload and send while listening or transcribing in native and H5 senders', () => {
  for (const h5 of [false, true]) for (const speechState of ['authorizing', 'listening', 'transcribing']) {
    const { AgentChatSender } = loadChat(h5)
    let sent = 0, stopped = 0, cancelled = 0
    const node = AgentChatSender({ value: '已有草稿', sending: false, uploading: false, speechState,
      onChange() {}, onSend() { sent++ }, onKeyboardHeightChange() {}, onAttach() {}, onDictate() {},
      onSpeechStop() { stopped++ }, onSpeechCancel() { cancelled++ }
    })
    assert.equal(find(node, 'button', 'composer-upload')!.props.disabled, true)
    assert.equal(find(node, 'button', 'composer-prompt')!.props.disabled, true)
    assert.equal(find(node, 'button', 'speech-finish')!.props.disabled, speechState !== 'listening')
    find(node, 'button', 'speech-cancel')!.props.onClick()
    assert.equal(cancelled, 1)
    if (speechState === 'listening') { find(node, 'button', 'speech-finish')!.props.onClick(); assert.equal(stopped, 1) }
    if (h5) find(node, 'button', 'chat-preview-send')!.props.onClick()
    else find(node, 't-chat-sender')!.props.onSend({ detail: { value: '不应发送' } })
    assert.equal(sent, 0)
  }
})

test('saved shortcut codes display in Chinese in both native and H5 messages', () => {
  for (const [content, expected] of [
    ['traffic_accident', '交通事故'], ['work_injury', '工伤事故'], ['personal_injury', '意外伤害'],
    ['manual_input', '手动输入'], ['confirm', '信息正确'], ['finish', '结束收集'],
    ['edit:accident_date', '事故日期'],
  ]) {
    const message = { id: 'old-message', role: 'user', content }
    const native = loadChat().AgentChatMessage({ message })
    assert.equal(native.props.content[0].data, expected)
    const html = renderToStaticMarkup(loadChat(true).AgentChatMessage({ message }))
    assert.ok(html.includes(expected))
    assert.ok(!html.includes(content))
  }
})
