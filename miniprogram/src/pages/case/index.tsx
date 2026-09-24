import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import { createPaymentOrder } from '../../services/api'
import { Icon, SkeletonCaseCard } from '../../components'
import './index.scss'

const DEFAULT_PRICE_CENTS = 4990

function formatPrice(amountCents?: number) {
  return `¥${((amountCents || DEFAULT_PRICE_CENTS) / 100).toFixed(2)}`
}

function getNextAction(caseData: ReturnType<typeof useAppStore.getState>['currentCase']) {
  if (!caseData) return 'create_case'
  if (caseData.nextAction) return caseData.nextAction
  if (!caseData.materialCount) return 'continue_materials'
  if (caseData.hasReport && caseData.entitlement?.status === 'paid') return 'view_report'
  if (caseData.entitlement?.status !== 'paid') return 'unlock_full_plan'
  return 'continue_case'
}

export default function CasePage() {
  const { currentCase, isLoadingCase, loadCurrentCase, createCase } = useAppStore()
  const [isCreating, setIsCreating] = useState(false)
  const [isPaying, setIsPaying] = useState(false)

  useEffect(() => {
    loadCurrentCase()
  }, [loadCurrentCase])

  const nextAction = useMemo(() => getNextAction(currentCase), [currentCase])
  const entitlement = currentCase?.entitlement
  const isPaid = entitlement?.status === 'paid'
  const price = formatPrice(entitlement?.amountCents)

  const handleCreateCase = async () => {
    setIsCreating(true)
    try {
      await createCase()
      Taro.reLaunch({ url: '/pages/agent/index' })
    } finally {
      setIsCreating(false)
    }
  }

  const handlePayment = async () => {
    if (!currentCase || isPaying) return
    setIsPaying(true)
    try {
      const idempotencyKey = `${currentCase.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const result = await createPaymentOrder(currentCase.id, idempotencyKey)

      if (!result.alreadyPaid && result.payment && result.orderId) {
        await Taro.requestPayment(result.payment)
        await useAppStore.getState().loadCurrentCase()
        Taro.showToast({ title: '已解锁完整方案', icon: 'success' })
        return
      }

      await useAppStore.getState().loadCurrentCase()
      if (result.alreadyPaid) {
        Taro.showToast({ title: '该案件已解锁', icon: 'success' })
      }
    } catch (error: any) {
      if (error?.errMsg?.includes('cancel')) return
      Taro.showToast({ title: error?.message || '支付未完成，请稍后重试', icon: 'none' })
    } finally {
      setIsPaying(false)
    }
  }

  const handlePrimaryAction = () => {
    if (nextAction === 'create_case') return handleCreateCase()
    if (nextAction === 'unlock_full_plan') return handlePayment()
    if (nextAction === 'view_report') return Taro.navigateTo({ url: '/pages/report/index' })
    return Taro.reLaunch({ url: '/pages/agent/index' })
  }

  if (isLoadingCase && !currentCase) {
    return (
      <View className="case-page loading-page">
        <View className="welcome-block skeleton-welcome">
          <View className="skeleton-line short" />
          <View className="skeleton-line long" />
        </View>
        <SkeletonCaseCard />
      </View>
    )
  }

  const actionLabel = nextAction === 'create_case'
    ? '免费开始处理'
    : nextAction === 'unlock_full_plan'
      ? `解锁完整方案 ${price}`
      : nextAction === 'view_report'
        ? '查看完整方案'
        : nextAction === 'continue_materials'
          ? '继续补充材料'
          : '继续处理案件'

  return (
    <View className="case-page">
      <View className="welcome-block">
        <Text className="welcome-eyebrow">Hello 👋</Text>
        <Text className="welcome-title">欢迎使用灵迈</Text>
        <Text className="welcome-description">帮你理清事故责任、赔偿和处理步骤</Text>
      </View>

      {!currentCase ? (
        <View className="case-card empty-case-card">
          <View className="case-card-icon"><Icon name="file-list-3-line" size={28} color="#1E43A8" /></View>
          <View className="case-card-copy">
            <Text className="case-card-title">从一份材料开始</Text>
            <Text className="case-card-description">上传事故材料，灵迈会帮你整理出清晰的处理路径。</Text>
          </View>
          <View className="primary-action" onClick={handlePrimaryAction}>
            <Text>{isCreating ? '正在创建...' : actionLabel}</Text>
            <Icon name="arrow-right-line" size={20} color="#FFFFFF" />
          </View>
        </View>
      ) : (
        <View className="case-card">
          <View className="case-card-header">
            <View className="case-card-icon"><Icon name="car-line" size={28} color="#1E43A8" /></View>
            <View className="case-card-heading">
              <Text className="case-card-kicker">当前案件</Text>
              <Text className="case-card-title">{currentCase.title || '交通事故案件'}</Text>
              <Text className="case-card-meta">{currentCase.statusLabel || '正在处理'} · 已整理 {currentCase.materialCount || 0} 份材料</Text>
            </View>
            <Icon name="arrow-right-s-line" size={22} color="#9CA3AF" />
          </View>

          <View className="progress-track"><View className="progress-value" style={{ width: `${Math.min(Math.max((currentCase.materialCount || 0) * 20, 12), 100)}%` }} /></View>

          <View className="case-summary">
            <View className="summary-item">
              <Text className="summary-label">责任判定</Text>
              <Text className="summary-value">{currentCase.liability || '待分析'}</Text>
            </View>
            <View className="summary-item">
              <Text className="summary-label">赔偿估算</Text>
              <Text className="summary-value">{currentCase.compensation || '待计算'}</Text>
            </View>
          </View>

          {!isPaid && (
            <View className="payment-note">
              <Icon name="shield-check-line" size={18} color="#1E43A8" />
              <Text>一次付费，完整处理本案件；后续更新不再收费</Text>
            </View>
          )}
          {isPaid && <View className="unlocked-note"><Icon name="checkbox-circle-line" size={18} color="#1E43A8" /><Text>本案件已解锁完整处理方案</Text></View>}

          <View className="primary-action" onClick={handlePrimaryAction}>
            <Text>{isPaying ? '正在准备支付...' : actionLabel}</Text>
            {!isPaying && <Icon name="arrow-right-line" size={20} color="#FFFFFF" />}
          </View>
        </View>
      )}

      {currentCase && (
        <View className="next-step-card">
          <View className="next-step-icon"><Icon name="route-line" size={22} color="#1E43A8" /></View>
          <View className="next-step-copy">
            <Text className="next-step-label">接下来</Text>
            <Text className="next-step-title">{nextAction === 'unlock_full_plan' ? '材料整理完成后，解锁完整处理方案' : currentCase.statusLabel || '继续完善案件信息'}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
