import { Image, Text, View } from '@tarojs/components'
import brandLogo from '../../assets/brand/linkmai-wordmark.png'
import './index.scss'

export default function About() {
  return (
    <View className="about-page">
      <View className="about-brand">
        <Image className="about-logo" src={brandLogo} mode="aspectFit" aria-label="灵迈 Linkmai AI" />
      </View>

      <View className="about-card">
        <Text className="about-title">关于灵迈</Text>
        <Text className="about-description">面向交通事故当事人的案件整理工具，帮助你梳理经过、核对材料并了解下一步处理方向。</Text>
        <View className="about-notice">
          <Text className="about-notice-title">辅助整理，不替代判断</Text>
          <Text className="about-description">灵迈基于你提供的信息生成整理与分析建议，不构成法律意见。遇到紧急情况，请优先联系相关救援部门。</Text>
        </View>
      </View>

      <View className="about-version"><Text>当前版本 1.0.0</Text></View>
    </View>
  )
}
