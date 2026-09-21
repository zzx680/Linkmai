import { View, Text } from '@tarojs/components'
import './index.scss'

interface BadgeProps {
  children: string
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export default function Badge({
  children,
  variant = 'default',
  size = 'medium',
  className = ''
}: BadgeProps) {
  const classNames = [
    'ui-badge',
    `ui-badge-${variant}`,
    `ui-badge-${size}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <View className={classNames}>
      <Text className="ui-badge-text">{children}</Text>
    </View>
  )
}
