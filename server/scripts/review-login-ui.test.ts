import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const root = path.resolve(__dirname, '../..')
const html = readFileSync(path.join(root, 'server/public/review/index.html'), 'utf8')
const script = readFileSync(path.join(root, 'server/public/review/app.js'), 'utf8')
const style = readFileSync(path.join(root, 'server/public/review/style.css'), 'utf8')

test('review login password visibility is scoped to the login field', () => {
  assert.match(html, /<input id="password" type="password" required autocomplete="current-password">/)
  assert.match(html, /<button id="togglePassword" type="button" aria-controls="password" aria-pressed="false" aria-label="显示密码">显示<\/button>/)
  assert.match(html, /<input id="memberPassword" type="password"[^>]*minlength="12"[^>]*required>/)
  assert.doesNotMatch(html, /memberPassword[\s\S]*togglePassword/)
})

test('review login password visibility updates accessibility state without changing login request', () => {
  assert.match(script, /function setPasswordVisibility\(visible\)/)
  assert.match(script, /password\.type=visible\?'text':'password'/)
  assert.match(script, /toggle\.setAttribute\('aria-pressed',String\(visible\)\)/)
  assert.match(script, /toggle\.setAttribute\('aria-label',visible\?'隐藏密码':'显示密码'\)/)
  assert.match(script, /el\('togglePassword'\)\.onclick=\(\)=>setPasswordVisibility\(el\('password'\)\.type==='password'\)/)
  assert.match(script, /api\('\/login',\{email:el\('email'\)\.value,password:el\('password'\)\.value\}\)/)
  assert.match(script, /el\('password'\)\.value=''; setPasswordVisibility\(false\)/)
})

test('review login visibility control has dedicated layout and keyboard focus styles', () => {
  assert.match(style, /\.password-field\{display:block;position:relative\}/)
  assert.match(style, /\.password-field input\{padding-right:72px\}/)
  assert.match(style, /\.password-field button:focus-visible\{outline:2px solid #2a64f0/)
})
