import { View, Text, Image } from '@tarojs/components'
import brandLogo from '../../assets/brand/linkmai-logo.png'
import './PageHeader.scss'

interface PageHeaderProps {
  kicker?: string
  title: string
  action?: string
  onAction?: () => void
}

export function PageHeader({ kicker, title, action, onAction }: PageHeaderProps) {
  return (
    <View className="page-header">
      <View>
        <View className="page-header__brand">
          <Image className="page-header__logo" src={brandLogo} mode="aspectFit" aria-label="灵迈 Linkmai AI" />
          {kicker ? <Text className="page-header__kicker">{kicker}</Text> : null}
        </View>
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
