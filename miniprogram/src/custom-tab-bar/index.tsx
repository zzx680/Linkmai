import { Component } from 'react'
import { View, Image } from '@tarojs/components'
import { getCurrentTabRoute, syncTabRoute, tabNavigation } from './navigation'
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
  private unsubscribe?: () => void
  state: TabBarState = {
    selected: 0,
    items: [
      {
        pagePath: '/pages/case/index',
        text: '首页',
        icon: '/assets/icons/case.png',
        activeIcon: '/assets/icons/case-active.png'
      },
      {
        pagePath: '/pages/agent/index',
        text: '处理',
        icon: '/assets/icons/agent.png',
        activeIcon: '/assets/icons/agent-active.png'
      },
      {
        pagePath: '/pages/profile/index',
        text: '我的',
        icon: '/assets/icons/profile.png',
        activeIcon: '/assets/icons/profile-active.png'
      }
    ]
  }

  componentDidMount() {
    this.unsubscribe = tabNavigation.subscribe(route => {
      const index = this.state.items.findIndex(item => item.pagePath === route)
      if (index !== -1 && index !== this.state.selected) this.setState({ selected: index })
    })
    this.syncSelected()
  }

  componentWillUnmount() {
    this.unsubscribe?.()
  }

  componentDidShow() {
    this.syncSelected()
  }

  syncSelected() {
    syncTabRoute(getCurrentTabRoute())
  }

  switchTab = (index: number) => {
    const item = this.state.items[index]
    if (!item) return

    tabNavigation.request(item.pagePath)
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
