import { Text, View } from '@tarojs/components'
import { Icon } from '../../components'
import './index.scss'

export default function About() {
  return (
    <View className="support-page about-page">
      <View className="about-mark"><Text>灵迈</Text></View>
      <View className="support-header about-header">
        <Text className="support-eyebrow">LINKMAI</Text>
        <Text className="support-title">关于灵迈</Text>
        <Text className="support-description">面向交通事故当事人的案件整理工具，帮助你梳理经过、核对材料并了解下一步处理方向</Text>
      </View>

      <View className="support-card about-card">
        <View className="card-icon"><Icon name="route" size={22} color="#2A64F0" /></View>
        <View className="card-copy">
          <Text className="card-title">辅助整理，不替代判断</Text>
          <Text className="card-description">灵迈基于你提供的信息生成整理与分析建议，不构成法律意见。遇到紧急情况，请优先联系相关救援部门。</Text>
        </View>
      </View>

      <View className="about-version"><Text>当前版本 1.0.0</Text></View>
    </View>
  )
}
