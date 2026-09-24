import { View } from '@tarojs/components'
import './index.scss'

interface SkeletonProps {
  type?: 'text' | 'title' | 'avatar' | 'image' | 'card'
  width?: string
  height?: string
  className?: string
  animated?: boolean
}

export default function Skeleton({
  type = 'text',
  width,
  height,
  className = '',
  animated = true
}: SkeletonProps) {
  const classNames = [
    'ui-skeleton',
    `ui-skeleton-${type}`,
    animated && 'ui-skeleton-animated',
    className
  ].filter(Boolean).join(' ')

  const style: any = {}
  if (width) style.width = width
  if (height) style.height = height

  return <View className={classNames} style={style} />
}

// 骨架屏组合组件
export function SkeletonCard() {
  return (
    <View className="ui-skeleton-card-wrapper">
      <Skeleton type="title" width="60%" />
      <Skeleton type="text" width="100%" />
      <Skeleton type="text" width="80%" />
    </View>
  )
}

export function SkeletonCaseCard() {
  return (
    <View className="ui-skeleton-case-wrapper">
      <View className="ui-skeleton-case-header">
        <Skeleton type="title" width="70%" />
        <Skeleton type="text" width="30%" height="40px" />
      </View>
      <Skeleton type="text" width="100%" />
      <Skeleton type="text" width="90%" />
      <View className="ui-skeleton-case-footer">
        <Skeleton type="text" width="40%" />
        <Skeleton type="text" width="30%" />
      </View>
    </View>
  )
}

export function SkeletonProfile() {
  return (
    <View className="ui-skeleton-profile-wrapper">
      <View className="ui-skeleton-profile-header">
        <Skeleton type="avatar" width="120px" height="120px" />
        <View className="ui-skeleton-profile-info">
          <Skeleton type="title" width="60%" />
          <Skeleton type="text" width="40%" />
        </View>
      </View>
    </View>
  )
}
