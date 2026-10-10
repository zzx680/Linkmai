import path from 'path'

const isH5 = process.env.TARO_ENV === 'h5'
const isProduction = process.env.NODE_ENV === 'production'
const apiBase = process.env.TARO_APP_API_BASE || 'http://localhost:8000/api'
const outputRoot = process.env.TARO_OUTPUT_ROOT || (isH5 ? 'dist-h5' : 'dist')

if (isProduction && !apiBase.startsWith('https://')) {
  throw new Error('生产构建必须提供 HTTPS TARO_APP_API_BASE')
}

const config = {
  projectName: 'linkmai',
  date: '2026-9-17',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2
  },
  sourceRoot: 'src',
  outputRoot,
  plugins: [
    '@tarojs/plugin-framework-react',
    '@tarojs/plugin-platform-h5'
  ],
  defineConstants: {
    __API_BASE__: JSON.stringify(apiBase),
    __IS_H5__: JSON.stringify(isH5)
  },
  copy: {
    patterns: [],
    options: {}
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false
    }
  },
  cache: {
    enable: false
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {}
      },
      url: {
        enable: true,
        config: {
          limit: 1024
        }
      },
      cssModules: {
        enable: false,
        config: {
          namingPattern: 'module',
          generateScopedName: '[name]__[local]___[hash:base64:5]'
        }
      }
    }
  }
}

export default function (merge) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  return merge({}, config, require('./prod'))
}
