import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

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
        View: 'div', Button: 'button', Image: 'img',
        Text: ({ selectable: _selectable, ...props }: any) => React.createElement('span', props),
      }
      if (id === '../../config/env') return { IS_H5: h5 }
      if (id.endsWith('.scss')) return {}
      return localRequire(id)
    },
  })
  return module.exports
}

function find(node: React.ReactNode, type: string): React.ReactElement<any> | undefined {
  if (!React.isValidElement<any>(node)) return
  if (node.type === type) return node
  return React.Children.toArray(node.props.children).map(child => find(child, type)).find(Boolean)
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
    value: '旧草稿', disabled: false, uploading: false,
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
  const upload = find(node, 'button')!
  assert.equal(upload.props.disabled, false)
  upload.props.onClick()
  assert.equal(uploads, 1)
  const busy = AgentChatSender({ ...props, value: '', disabled: true, uploading: true })
  assert.equal(find(busy, 't-chat-sender')!.props.disabled, true)
  assert.equal(find(busy, 'button')!.props.disabled, true)
})

test('H5 preview escapes content and handles multiline and IME input without accidental send', () => {
  const { AgentChatMessage, AgentChatSender } = loadChat(true)
  const html = renderToStaticMarkup(AgentChatMessage({ message: { role: 'assistant', content: '<script>alert(1)</script>' } }))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  const sent: string[] = []
  const node = AgentChatSender({ value: '事故经过', disabled: false, uploading: false,
    onChange() {}, onSend: (value: string) => sent.push(value), onKeyboardHeightChange() {}, onAttach() {},
  })
  const input = find(node, 'textarea')!
  input.props.onKeyDown({ key: 'Enter', shiftKey: true, nativeEvent: {}, preventDefault() {} })
  input.props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true }, preventDefault() {} })
  assert.equal(sent.length, 0)
  input.props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault() {} })
  assert.deepEqual(sent, ['事故经过'])
})
