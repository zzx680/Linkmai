import { View, Text } from '@tarojs/components'
import './PageHeader.scss'

interface PageHeaderProps {
  kicker?: string
  title: string
  action?: string
  onAction?: () => void
}

export function PageHeader({ kicker = 'LINGMAI / 灵迈', title, action, onAction }: PageHeaderProps) {
  return (
    <View className="page-header">
      <View>
        <Text className="page-header__kicker">{kicker}</Text>
        <Text className="page-header__title">{title}</Text>
      </View>
      {action ? (
        <View className="page-header__action" onClick={onAction} role="button">
          <Text>{action}</Text>
          <Text className="page-header__arrow">↗</Text>
        </View>
      ) : null}
    </View>
  )
}
