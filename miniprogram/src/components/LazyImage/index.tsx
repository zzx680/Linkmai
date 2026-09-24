import { Image } from '@tarojs/components'
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import './index.scss'

interface LazyImageProps {
  src: string
  alt?: string
  className?: string
  mode?: 'scaleToFill' | 'aspectFit' | 'aspectFill' | 'widthFix' | 'heightFix'
  width?: number | string
  height?: number | string
  placeholder?: string
  onLoad?: () => void
  onError?: () => void
}

export default function LazyImage({
  src,
  alt = '',
  className = '',
  mode = 'aspectFill',
  width,
  height,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23F7F4EF" width="400" height="300"/%3E%3C/svg%3E',
  onLoad,
  onError
}: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState(placeholder)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!src) return

    const observer = Taro.createIntersectionObserver(null, { threshold: [0.01] })

    observer.relativeToViewport({ bottom: 100 }).observe('.lazy-image', (res) => {
      if (res.intersectionRatio > 0) {
        // 图片进入可视区域，开始加载
        setImageSrc(src)
        observer.disconnect()
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [src])

  const handleLoad = () => {
    setIsLoading(false)
    onLoad?.()
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
    onError?.()
  }

  return (
    <Image
      src={imageSrc}
      mode={mode}
      className={`lazy-image ${className} ${isLoading ? 'loading' : ''} ${hasError ? 'error' : ''}`}
      style={{ width, height }}
      onLoad={handleLoad}
      onError={handleError}
    />
  )
}
