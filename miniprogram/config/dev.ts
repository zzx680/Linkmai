import { resolveApiBase } from './api-base'

const apiBase = resolveApiBase(process.env.TARO_APP_API_BASE, false)

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
