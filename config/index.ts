import { defineConfig } from '@tarojs/cli'

export default defineConfig({
  projectName: 'lingmai',
  date: '2026-09-17',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: `dist/${process.env.TARO_ENV || 'weapp'}`,
  framework: 'react',
  plugins: ['@tarojs/plugin-html'],
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false,
    },
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
      },
      cssModules: {
        enable: false,
      },
    },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    htmlPluginOption: {
      filename: 'index.html',
    },
  },
})
