import { View, Text } from '@tarojs/components'
import './index.scss'

interface AvatarProps {
  name: string
  size?: number
  src?: string
  className?: string
}

export default function Avatar({
  name,
  size = 64,
  src,
  className = ''
}: AvatarProps) {
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase()
  }

  const getColorFromName = (name: string) => {
    const colors = [
      '#C4612F', // terracotta
      '#34c759', // green
      '#007AFF', // blue
      '#FF9500', // orange
      '#AF52DE', // purple
      '#FF2D55'  // pink
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  const backgroundColor = getColorFromName(name)

  return (
    <View
      className={`ui-avatar ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: src ? 'transparent' : backgroundColor
      }}
    >
      {src ? (
        <View
          className="ui-avatar-image"
          style={{ backgroundImage: `url(${src})` }}
        />
      ) : (
        <Text className="ui-avatar-text" style={{ fontSize: `${size * 0.4}px` }}>
          {getInitials(name)}
        </Text>
      )}
    </View>
  )
}
