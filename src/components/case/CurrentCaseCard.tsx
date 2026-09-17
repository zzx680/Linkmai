import { View, Text } from '@tarojs/components'
import { CurrentCase } from '../../types/domain'
import './CurrentCaseCard.scss'

interface CurrentCaseCardProps {
  currentCase: CurrentCase
  onPrimary: () => void
  onSecondary: () => void
}

export function CurrentCaseCard({ currentCase, onPrimary, onSecondary }: CurrentCaseCardProps) {
  const isReady = currentCase.status === 'ready'
  const isReview = currentCase.status === 'needs_review'
  const primaryLabel = isReady ? '查看报告' : isReview ? '咨询律所' : '继续补充'

  return (
    <View className="current-case-card">
      <View className="current-case-card__header">
        <View className="current-case-card__signal" />
        <Text className="current-case-card__eyebrow">CURRENT CASE / 当前案件</Text>
        <Text className="current-case-card__status">{currentCase.statusLabel}</Text>
      </View>
      <Text className="current-case-card__title">{currentCase.title}</Text>
      <Text className="current-case-card__meta">{currentCase.accidentType} · {currentCase.updatedAt}</Text>
      <View className="current-case-card__summary">
        <View className="current-case-card__metric">
          <Text className="current-case-card__metric-label">责任参考</Text>
          <Text className="current-case-card__metric-value">{currentCase.liability || '待分析'}</Text>
        </View>
        <View className="current-case-card__metric">
          <Text className="current-case-card__metric-label">赔偿参考</Text>
          <Text className="current-case-card__metric-value">{currentCase.compensation || '待补材料'}</Text>
        </View>
      </View>
      <View className="current-case-card__footer">
        <Text className="current-case-card__materials">{currentCase.materialProgress}</Text>
        <View className="current-case-card__actions">
          <View className="current-case-card__link" onClick={onSecondary} role="button">
            <Text>继续问 Agent</Text>
          </View>
          <View className="current-case-card__primary" onClick={onPrimary} role="button">
            <Text>{primaryLabel}</Text>
            <Text>↗</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
