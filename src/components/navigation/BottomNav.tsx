import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './BottomNav.scss'

export type NavKey = 'case' | 'agent' | 'consultation' | 'profile'

const items: Array<{ key: NavKey; label: string; code: string; path: string }> = [
  { key: 'case', label: '案件', code: '01', path: '/pages/case/index' },
  { key: 'agent', label: 'Agent', code: 'AI', path: '/pages/agent/index' },
  { key: 'consultation', label: '咨询', code: '02', path: '/pages/consultation/index' },
  { key: 'profile', label: '我的', code: '03', path: '/pages/profile/index' },
]

interface BottomNavProps {
  active: NavKey
  badge?: number
}

export function BottomNav({ active, badge }: BottomNavProps) {
  const navigate = (path: string) => {
    Taro.reLaunch({ url: path })
  }

  return (
    <View className="bottom-nav" role="navigation" aria-label="主导航">
      <View className="bottom-nav__inner">
        {items.map((item) => {
          const isActive = item.key === active
          return (
            <View
              key={item.key}
              className={`bottom-nav__item ${isActive ? 'is-active' : ''}`}
              onClick={() => navigate(item.path)}
              role="button"
              aria-label={item.label}
            >
              <View className="bottom-nav__mark">
                <Text>{item.code}</Text>
                {item.key === 'consultation' && badge ? (
                  <Text className="bottom-nav__badge">{badge}</Text>
                ) : null}
              </View>
              <Text className="bottom-nav__label">{item.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
