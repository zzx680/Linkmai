import { View, Text } from '@tarojs/components'
import { FC, ReactNode } from 'react'
import Icon from '../Icon'
import './index.scss'

interface EmptyProps {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

const Empty: FC<EmptyProps> = ({
  icon = 'file-list-line',
  title,
  description,
  action,
  className = ''
}) => {
  return (
    <View className={`lm-empty ${className}`}>
      <Icon name={icon} size={64} color="#8E8E93" />
      <Text className="empty-title">{title}</Text>
      {description && <Text className="empty-description">{description}</Text>}
      {action && <View className="empty-action">{action}</View>}
    </View>
  )
}

export default Empty
