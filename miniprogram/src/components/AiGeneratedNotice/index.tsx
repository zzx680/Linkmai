import { Text, View } from '@tarojs/components'
import './index.scss'

export default function AiGeneratedNotice() {
  return <View className="ai-generated-notice" aria-label="AI生成内容说明">
    <Text className="ai-generated-notice-title">AI生成</Text>
    <Text className="ai-generated-notice-description">内容由人工智能辅助生成，仅供参考，重要信息请核对原始材料，不构成确定的法律结论。</Text>
  </View>
}
