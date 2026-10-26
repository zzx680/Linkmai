import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import Avatar from './Avatar'

const stages = ['描述事故', '整理材料', '解锁方案', '查看报告']

export default function CaseJourney({
  active,
  title,
  description,
  compact = false,
  actionLabel,
  actionId,
  onAction,
  actionLoading = false,
  identityLabel,
  identityAvatar,
}: {
  active: number
  title?: string
  description?: string
  compact?: boolean
  actionLabel?: string
  actionId?: string
  onAction?: () => void
  actionLoading?: boolean
  identityLabel?: string
  identityAvatar?: string
}) {
  const currentStep = Math.max(0, Math.min(stages.length - 1, active))
  const navigate = (index: number) => {
    if (index === 0) Taro.switchTab({ url: '/pages/agent/index' })
    else Taro.navigateTo({ url: ['/pages/agent/index', '/pages/materials/index', '/pages/payments/index', '/pages/report/index'][index] })
  }
  return (
    <View className={`case-journey${compact ? ' case-journey-compact' : ''}`}>
      {!compact && <View className="journey-heading"><Text className="journey-stage">{currentStep + 1} / {stages.length}</Text></View>}
      {title && <Text className="journey-title">{title}</Text>}
      {description && <Text className="journey-description">{description}</Text>}
      {identityLabel && (
        <View className="journey-identity">
          <Avatar name={identityLabel} src={identityAvatar} size={40} />
          <Text className="journey-identity-label">{identityLabel}</Text>
        </View>
      )}
      <View className="journey-progress" aria-label={`当前进度：${stages[currentStep]}`}>
        <View className="journey-track"><View className="journey-track-fill" style={{ width: `${currentStep / (stages.length - 1) * 100}%` }} /></View>
        <View className="journey-steps">
          {stages.map((label, index) => {
            const stateClass = index < currentStep ? 'completed' : index === currentStep ? 'current' : 'upcoming'
            return (
              <View key={label} className={`journey-step ${stateClass}`} role="button" aria-label={`${index + 1}. ${label}${index === currentStep ? '，当前步骤' : ''}`} onClick={() => navigate(index)}>
                <View className="journey-node"><Text>{index < currentStep ? '✓' : index + 1}</Text></View>
                <Text className="journey-step-label">{label}</Text>
              </View>
            )
          })}
        </View>
      </View>
      {actionLabel && <Button id={actionId} className="journey-start-action" loading={actionLoading} disabled={actionLoading} onClick={onAction || (() => Taro.switchTab({ url: '/pages/agent/index' }))}>{actionLabel}</Button>}
    </View>
  )
}
