import { Image, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import defaultAvatar from '../../assets/brand/default-avatar.png'
import './index.scss'

interface AvatarProps {
  name: string
  size?: number
  src?: string
  className?: string
}

export default function Avatar({
  size = 64,
  src,
  className = ''
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageSource = src && !imageFailed ? src : defaultAvatar

  useEffect(() => setImageFailed(false), [src])

  return (
    <View
      className={`ui-avatar ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`
      }}
    >
      <Image
        className="ui-avatar-image"
        src={imageSource}
        mode="aspectFill"
        onError={() => {
          if (src && imageSource === src) setImageFailed(true)
        }}
      />
    </View>
  )
}
