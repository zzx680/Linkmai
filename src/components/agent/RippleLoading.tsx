import { View, Text } from '@tarojs/components'
import './RippleLoading.scss'

interface RippleLoadingProps {
  text?: string
  detail?: string
  size?: 'small' | 'medium'
}

export function RippleLoading({
  text = '正在处理材料',
  detail = '请稍候，完成后会继续下一步',
  size = 'medium',
}: RippleLoadingProps) {
  return (
    <View className={`ripple-loading ripple-loading--${size}`} aria-label={text}>
      <View className="ripple-loading__orb">
        <View className="ripple-loading__ring ripple-loading__ring--one" />
        <View className="ripple-loading__ring ripple-loading__ring--two" />
        <View className="ripple-loading__ring ripple-loading__ring--three" />
        <View className="ripple-loading__core" />
      </View>
      <Text className="ripple-loading__text">{text}</Text>
      <Text className="ripple-loading__detail">{detail}</Text>
    </View>
  )
}
