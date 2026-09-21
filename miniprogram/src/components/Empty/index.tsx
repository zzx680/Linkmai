import { View, Text } from '@tarojs/components'
import { FC, ReactNode } from 'react'
import './index.scss'

interface EmptyProps {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

const Empty: FC<EmptyProps> = ({
  icon = '📋',
  title,
  description,
  action,
  className = ''
}) => {
  return (
    <View className={`lm-empty ${className}`}>
      <Text className="empty-icon">{icon}</Text>
      <Text className="empty-title">{title}</Text>
      {description && <Text className="empty-description">{description}</Text>}
      {action && <View className="empty-action">{action}</View>}
    </View>
  )
}

export default Empty
