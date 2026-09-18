import { Component } from 'react'
import Taro from '@tarojs/taro'
import { View, Image } from '@tarojs/components'
import './index.scss'

interface TabItem {
  pagePath: string
  text: string
  icon: string
  activeIcon: string
}

interface TabBarState {
  selected: number
  items: TabItem[]
}

export default class CustomTabBar extends Component<{}, TabBarState> {
  state: TabBarState = {
    selected: 0,
    items: [
      {
        pagePath: '/pages/case/index',
        text: '案件',
        icon: '/assets/icons/case.png',
        activeIcon: '/assets/icons/case-active.png'
      },
      {
        pagePath: '/pages/agent/index',
        text: 'Agent',
        icon: '/assets/icons/agent.png',
        activeIcon: '/assets/icons/agent-active.png'
      },
      {
        pagePath: '/pages/consultation/index',
        text: '咨询',
        icon: '/assets/icons/consultation.png',
        activeIcon: '/assets/icons/consultation-active.png'
      },
      {
        pagePath: '/pages/profile/index',
        text: '我的',
        icon: '/assets/icons/profile.png',
        activeIcon: '/assets/icons/profile-active.png'
      }
    ]
  }

  componentDidShow() {
    this.syncSelected()
  }

  getCurrentRoute() {
    const pages = Taro.getCurrentPages()
    const current = pages[pages.length - 1]
    return current && current.route ? `/${current.route}` : ''
  }

  syncSelected() {
    const currentRoute = this.getCurrentRoute()
    const index = this.state.items.findIndex(item => item.pagePath === currentRoute)
    if (index !== -1 && index !== this.state.selected) {
      this.setState({ selected: index })
    }
  }

  switchTab = (index: number) => {
    const item = this.state.items[index]
    if (!item) return

    if (item.pagePath === this.getCurrentRoute()) {
      this.setState({ selected: index })
      return
    }

    this.setState({ selected: index })
    Taro.switchTab({
      url: item.pagePath,
      success: () => this.syncSelected(),
      fail: () => {
        this.syncSelected()
        Taro.showToast({ title: '页面暂时无法打开', icon: 'none' })
      }
    })
  }

  render() {
    const { selected, items } = this.state

    return (
      <View className='tab-shell'>
        <View className='tab-pill'>
          {items.map((item, index) => (
            <View
              key={item.pagePath}
              className={`tab-item ${selected === index ? 'tab-item-active' : ''}`}
              onClick={() => this.switchTab(index)}
              hoverClass='tab-item-pressed'
              hoverStartTime={0}
              hoverStayTime={120}
            >
              {selected === index && <View className='tab-active-bloom' />}
              <Image
                className='tab-icon'
                src={selected === index ? item.activeIcon : item.icon}
                mode='aspectFit'
              />
              <View className='tab-label'>{item.text}</View>
            </View>
          ))}
        </View>
      </View>
    )
  }
}
