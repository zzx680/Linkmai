const apiBase = process.env.TARO_APP_API_BASE

if (!apiBase || !apiBase.startsWith('https://')) {
  throw new Error('生产构建必须提供 HTTPS TARO_APP_API_BASE')
}

export default {
  env: {
    NODE_ENV: '"production"'
  },
  defineConstants: {
    __API_BASE__: JSON.stringify(apiBase)
  },
  mini: {},
  h5: {}
}
