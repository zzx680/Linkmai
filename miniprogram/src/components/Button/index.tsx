import { View, Text } from '@tarojs/components'
import { ReactNode, CSSProperties } from 'react'
import './index.scss'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'text' | 'danger'
  size?: 'small' | 'medium' | 'large'
  block?: boolean
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  className?: string
  style?: CSSProperties
}

export default function Button({
  children,
  variant = 'primary',
  size = 'medium',
  block = false,
  disabled = false,
  loading = false,
  onClick,
  className = '',
  style
}: ButtonProps) {
  const handleClick = () => {
    if (disabled || loading) return
    onClick?.()
  }

  const classNames = [
    'ui-button',
    `ui-button-${variant}`,
    `ui-button-${size}`,
    block && 'ui-button-block',
    disabled && 'ui-button-disabled',
    loading && 'ui-button-loading',
    className
  ].filter(Boolean).join(' ')

  return (
    <View className={classNames} style={style} onClick={handleClick}>
      {loading && <Text className="ui-button-spinner">⟳</Text>}
      <Text className="ui-button-text">{children}</Text>
    </View>
  )
}
