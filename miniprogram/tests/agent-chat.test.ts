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
  assert.equal(AgentChatMessage({ pending: true }).props.status, 'pending')
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

test('description shortcut fills an empty composer without overwriting a draft', () => {
  const { AgentChatSender } = loadChat(true)
  const changes: string[] = []
  const props = { value: '', sending: false, uploading: false, onChange: (value: string) => changes.push(value), onSend() {}, onKeyboardHeightChange() {}, onAttach() {} }
  find(AgentChatSender(props), 'button', 'composer-prompt')!.props.onClick()
  find(AgentChatSender({ ...props, value: '我在路口被追尾' }), 'button', 'composer-prompt')!.props.onClick()
  assert.deepEqual(changes, ['我想描述一下事故经过', '我在路口被追尾'])
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
