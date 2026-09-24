import { View } from '@tarojs/components'
import './index.scss'

interface IconProps {
  name: string
  size?: number
  color?: string
  className?: string
  onClick?: () => void
}

export default function Icon({ name, size = 24, color, className = '', onClick }: IconProps) {
  return (
    <View
      className={`icon-component ri-${name} ${className}`}
      style={{
        fontSize: `${size}px`,
        color: color,
        width: `${size}px`,
        height: `${size}px`,
        lineHeight: `${size}px`
      }}
      onClick={onClick}
    />
  )
}
