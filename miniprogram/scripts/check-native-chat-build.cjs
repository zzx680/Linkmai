// Run after a WeChat build: node scripts/check-native-chat-build.cjs [output]
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..', process.argv[2] || process.env.TARO_OUTPUT_ROOT || 'dist')

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? files(file) : [file]
  })
}
function resolve(from, ref) {
  return ref.startsWith('/') ? path.join(root, ref) : path.resolve(path.dirname(from), ref)
}
const output = files(root)
for (const file of output) {
  if (file.endsWith('.json')) {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'))
    const refs = [
      ...Object.values(config.usingComponents || {}),
      ...Object.values(config.componentGenerics || {}).flatMap(generic => generic.default ? [generic.default] : []),
    ]
    for (const ref of refs) {
      if (ref.startsWith('plugin://')) continue
      for (const ext of ['.json', '.js', '.wxml']) {
        const dependency = resolve(file, ref) + ext
        assert.ok(fs.existsSync(dependency), `Missing native component dependency: ${dependency}`)
      }
    }
  }
  if (file.endsWith('.wxml') || file.endsWith('.wxs')) {
    const source = fs.readFileSync(file, 'utf8')
    const refs = file.endsWith('.wxml')
      ? [...source.matchAll(/<(?:wxs|import|include)\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1])
      : [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1])
    for (const ref of refs) {
      if (ref.includes('{{')) continue
      assert.ok(fs.existsSync(resolve(file, ref)), `Missing template/WXS dependency: ${ref} from ${file}`)
    }
  }
}
const page = JSON.parse(fs.readFileSync(path.join(root, 'pages/agent/index.json'), 'utf8'))
for (const tag of ['t-chat-message', 't-chat-sender', 't-chat-markdown-tail']) {
  assert.ok(page.usingComponents[tag], `Agent page does not register ${tag}`)
}
assert.ok(fs.existsSync(path.join(root, 'licenses/tdesign-miniprogram.txt')), 'Missing TDesign license')
console.log(`Native chat dependencies verified (${output.length} files, ${output.reduce((size, file) => size + fs.statSync(file).size, 0)} bytes)`)
