import { View } from '@tarojs/components'
import { ReactNode, CSSProperties } from 'react'
import './index.scss'

interface CardProps {
  children: ReactNode
  padding?: 'none' | 'small' | 'medium' | 'large'
  shadow?: 'none' | 'small' | 'medium' | 'large'
  border?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export default function Card({
  children,
  padding = 'medium',
  shadow = 'small',
  border = true,
  className = '',
  style,
  onClick
}: CardProps) {
  const classNames = [
    'ui-card',
    `ui-card-padding-${padding}`,
    `ui-card-shadow-${shadow}`,
    border && 'ui-card-border',
    onClick && 'ui-card-clickable',
    className
  ].filter(Boolean).join(' ')

  return (
    <View className={classNames} style={style} onClick={onClick}>
      {children}
    </View>
  )
}
