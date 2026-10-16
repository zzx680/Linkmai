import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

const stages = ['描述事故', '核对材料', '解锁方案', '查看报告']

export default function CaseJourney({ active, title, description }: { active: number; title: string; description: string }) {
  const navigate = (index: number) => {
    if (index === 0) Taro.switchTab({ url: '/pages/agent/index' })
    else Taro.navigateTo({ url: ['/pages/agent/index', '/pages/materials/index', '/pages/payments/index', '/pages/report/index'][index] })
  }
  return (
    <View className="case-journey">
      <View className="journey-heading"><Text className="journey-stage">{String(active + 1).padStart(2, '0')} / 04</Text></View>
      <Text className="journey-title">{title}</Text>
      <Text className="journey-description">{description}</Text>
      <View className="journey-steps">
        {stages.map((label, index) => <View key={label} className={`journey-step ${index === active ? 'current' : ''}`} role="button" aria-label={label} onClick={() => navigate(index)}><Text className="journey-number">{String(index + 1).padStart(2, '0')}</Text><Text>{label}</Text></View>)}
      </View>
    </View>
  )
}
