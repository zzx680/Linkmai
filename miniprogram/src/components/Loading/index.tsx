import { View } from '@tarojs/components'
import './index.scss'

interface LoadingProps {
  size?: 'small' | 'medium' | 'large'
  text?: string
  className?: string
}

export default function Loading({
  size = 'medium',
  text,
  className = ''
}: LoadingProps) {
  const classNames = [
    'ui-loading',
    `ui-loading-${size}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <View className={classNames}>
      <View className="ui-loading-spinner" />
      {text && <View className="ui-loading-text">{text}</View>}
    </View>
  )
}
