import Taro from '@tarojs/taro'
import { TabNavigationController } from './navigation-controller'

export const tabRoutes = ['/pages/case/index', '/pages/agent/index', '/pages/profile/index']

export function getCurrentTabRoute() {
  const pages = Taro.getCurrentPages()
  const route = pages[pages.length - 1]?.route || ''
  return route ? `/${route.replace(/^\//, '')}` : ''
}

export const tabNavigation = new TabNavigationController(
  getCurrentTabRoute(),
  route => Taro.switchTab({ url: route }),
  () => { Taro.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' }) },
)

// Page onShow covers programmatic navigation, return from a detail page and
// cached tab pages, in addition to native tab-bar component lifecycle events.
export function syncTabRoute(route: string) {
  if (tabRoutes.includes(route)) tabNavigation.sync(route)
}
