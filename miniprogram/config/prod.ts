import { resolveApiBase } from './api-base'

const apiBase = resolveApiBase(process.env.TARO_APP_API_BASE, true)

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
