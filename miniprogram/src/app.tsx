import { Component, PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import './app.scss'
import { useAppStore } from './store'
import { IS_H5 } from './config/env'

class App extends Component<PropsWithChildren> {
  componentDidMount() {
    if (IS_H5 || !useAppStore.getState().token) return
    useAppStore.getState().checkLoginStatus().catch(error => {
      console.error('App initialization error:', error)
      Taro.showToast({ title: '正在恢复账户状态', icon: 'none' })
    })
  }

  componentDidShow() {}

  componentDidHide() {}

  render() {
    return this.props.children
  }
}

export default App
