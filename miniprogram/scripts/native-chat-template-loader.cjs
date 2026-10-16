// Taro 4.0.7 treats dotted WXML bindings (e.g. {{item.url}}) as static
// dependencies. Scope the compatibility fix to TDesign, retaining its WXS
// and template imports without changing the emitted template.
const { createRequire } = require('node:module')
const loaderPath = require.resolve('@tarojs/webpack5-runner/dist/loaders/miniTemplateLoader')
const runnerRequire = createRequire(loaderPath)
const originalLoader = require(loaderPath).default
const sax = runnerRequire('sax')
const { isUrlRequest, urlToRequest } = runnerRequire('loader-utils')

module.exports = function nativeChatTemplateLoader(source) {
  if (!/[\\/]tdesign-miniprogram[\\/]/.test(this.resourcePath)) {
    return originalLoader.call(this, source)
  }
  this.cacheable?.()
  const callback = this.async()
  const parser = sax.parser(false, { lowercase: true })
  const requests = new Set()
  parser.onattribute = ({ name, value }) => {
    if ((name === 'src' || name === 'from') && value &&
      !value.includes('{{') && isUrlRequest(value)) {
      requests.add(urlToRequest(value))
    }
  }
  parser.onend = async () => {
    try {
      for (const request of requests) await this.importModule(request)
      callback(null, source)
    } catch (error) {
      callback(error)
    }
  }
  parser.write(`<root>${source}</root>`).close()
}
