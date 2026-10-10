const apiBase = process.env.TARO_APP_API_BASE || 'http://localhost:8000/api'

export default {
  env: {
    NODE_ENV: '"development"'
  },
  defineConstants: {
    __API_BASE__: JSON.stringify(apiBase)
  },
  mini: {},
  h5: {}
}
