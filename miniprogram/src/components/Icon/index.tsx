import { Image } from '@tarojs/components'
import { iconAssets } from './assets'
import './index.scss'

interface IconProps {
  name: string
  size?: number
  color?: string
  className?: string
  onClick?: () => void
}

export default function Icon({ name, size = 24, color = '#6B7280', className = '', onClick }: IconProps) {
  const variants = iconAssets[name] || iconAssets['circle-help']
  const src = variants[color.toUpperCase()] || variants['#6B7280']
  return (
    <Image
      className={`icon-component ${className}`}
      src={src}
      mode="aspectFit"
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
      onClick={onClick}
    />
  )
}
