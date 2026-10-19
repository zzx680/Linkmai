import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { getCurrentCase } from '../../services/api'
import { Icon } from '../../components'
import { useCasePayment } from '../../hooks/useCasePayment'
import { useAppStore } from '../../store'
import { entitlementLabel, formatPaymentPrice } from '../../utils/payment'
import { IS_H5 } from '../../config/env'
import CaseJourney from '../../components/CaseJourney'
import './index.scss'

const FEATURE_DETAILS = {
  fullReport: { icon: 'chart-no-axes-combined', title: '完整事故处理报告', description: '汇总责任、材料与关键结论' },
  compensationEstimate: { icon: 'scale', title: '赔偿项目与金额估算', description: '梳理可主张项目和计算依据' },
  actionPlan: { icon: 'route', title: '分步骤处理方案', description: '按当前进展给出下一步行动建议' },
  rerunAfterMaterialUpdate: { icon: 'loader-circle', title: '补充材料后更新分析', description: '材料变化后重新整理完整方案' }
} as const

function formatPaidAt(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function PaymentsPage() {
  const { currentCase, isLoggedIn, authRetryable, retryAuth } = useAppStore()
  const { isPaying, confirmation, handlePayment, reconcilePendingPayment } = useCasePayment()
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const requestVersion = useRef(0)

  useEffect(() => () => { requestVersion.current += 1 }, [])

  const refresh = async () => {
    if (isLoading || isPaying) return
    const token = useAppStore.getState().token
    const startingCaseId = useAppStore.getState().currentCase?.id
    const version = ++requestVersion.current
    setIsLoading(true)
    setLoadError('')
    try {
      const latest = await getCurrentCase()
      if (version !== requestVersion.current || useAppStore.getState().token !== token
        || useAppStore.getState().currentCase?.id !== startingCaseId) return
      useAppStore.setState({ currentCase: latest })
      await reconcilePendingPayment()
    } catch (error: any) {
      if (version === requestVersion.current && useAppStore.getState().token === token
        && useAppStore.getState().currentCase?.id === startingCaseId) setLoadError(error?.message || '权益加载失败，请重试')
    } finally {
      if (version === requestVersion.current) setIsLoading(false)
    }
  }

  useDidShow(() => {
    if (IS_H5 || !useAppStore.getState().isLoggedIn) return
    refresh()
  })

  const entitlement = currentCase?.entitlement
  const price = formatPaymentPrice(entitlement)
  const status = entitlement?.status === 'paid' || entitlement?.status === 'refunded'
    ? entitlement.status : confirmation === 'failed' ? 'unpaid' : confirmation || entitlement?.status || 'unpaid'
  const isPaid = status === 'paid'
  const features = Object.entries(FEATURE_DETAILS)
    .filter(([key]) => !isPaid || !entitlement?.features || entitlement.features[key as keyof typeof FEATURE_DETAILS])
    .map(([, detail]) => detail)

  const goHome = () => Taro.switchTab({ url: '/pages/case/index' })
  const goNext = () => {
    if (currentCase?.hasReport && status === 'paid') return Taro.navigateTo({ url: `/pages/report/index?caseId=${currentCase.id}` })
    return Taro.switchTab({ url: '/pages/agent/index' })
  }

  if (!isLoggedIn) {
    return (
      <View className="payments-page centered-page">
        <View className="empty-card">
          <View className="empty-icon"><Icon name="user-round" size={30} color="#4D6BFE" /></View>
          <Text className="empty-title">登录后查看付费权益</Text>
          <Text className="empty-description">登录后可查看当前案件的解锁状态，并继续完成支付</Text>
          <View className="primary-button" onClick={() => retryAuth()}><Text>{authRetryable ? '重新登录' : '登录'}</Text></View>
        </View>
      </View>
    )
  }

  if (isLoading && !currentCase) {
    return <View className="payments-page"><View className="loading-card"><View className="loading-line loading-line-short" /><View className="loading-line" /><View className="loading-line" /></View></View>
  }

  if (loadError) {
    return <View className="payments-page centered-page"><View className="empty-card"><Text className="empty-title">暂时无法加载权益</Text><Text className="empty-description">{loadError}</Text><View className="primary-button" onClick={refresh}><Text>重新加载</Text></View></View></View>
  }

  if (!currentCase) {
    return (
      <View className="payments-page centered-page">
        <View className="empty-card">
          <View className="empty-icon"><Icon name="file-text" size={30} color="#4D6BFE" /></View>
          <Text className="empty-title">暂无可查看的付费权益</Text>
          <Text className="empty-description">创建案件并整理材料后，可以按案件一次性解锁完整处理方案</Text>
          <View className="primary-button" onClick={goHome}><Text>返回首页创建案件</Text></View>
          <View className="secondary-button" onClick={refresh}><Text>重新加载</Text></View>
        </View>
      </View>
    )
  }

  const isPending = status === 'pending'
  const isRefunded = status === 'refunded'
  const paidAt = formatPaidAt(entitlement?.paidAt)
  const canPay = !isPaid && !isPending && !isRefunded && !!price

  return (
    <View className="payments-page">
      <CaseJourney active={2} title="让下一步，更有依据" description="先核对权益与金额，再决定是否解锁当前案件" />
      <View className="payments-header">
        <Text className="payments-eyebrow">当前案件权益</Text>
        <Text className="payments-title">解锁完整处理方案</Text>
        <Text className="payments-description">一次付费，获得当前案件从分析到行动的完整支持</Text>
      </View>

      <View className={`plan-card plan-card-${status}`}>
        <View className="plan-glow plan-glow-one" />
        <View className="plan-glow plan-glow-two" />
        <View className="plan-card-content">
          <View className="plan-topline">
            <Text className="plan-kicker">当前案件</Text>
            <View className="status-pill">
              <Icon name={isPaid ? 'check' : isRefunded ? 'undo-2' : 'clock-3'} size={14} color="#111827" />
              <Text>{entitlementLabel(status)}</Text>
            </View>
          </View>
          <Text className="plan-title">{currentCase.title || '交通事故案件'}</Text>
          <View className="plan-price-row">
            <View className="plan-price-copy">
              <Text className="plan-price-label">一次性解锁</Text>
              <Text className="plan-price">{price || '金额待确认'}</Text>
            </View>
            <View className="plan-mark"><Icon name="shield-check" size={28} color="#FFFFFF" /></View>
          </View>
          <Text className="plan-caption">仅限当前案件 · 不自动续费</Text>
        </View>
      </View>

      {(isPaid || isPending || isRefunded || !price) && (
        <View className={`status-panel${isPaid ? ' status-panel-success' : isRefunded || !price ? ' status-panel-muted' : ''}`}>
          <Icon name={isPaid ? 'circle-check' : isRefunded ? 'undo-2' : !price ? 'info' : 'clock-3'} size={20} color={isPaid ? '#057A55' : isRefunded || !price ? '#6B7280' : '#4D6BFE'} />
          <Text>{isPaid
            ? `本案件已解锁，后续更新不再收费${paidAt ? ` · ${paidAt}` : ''}`
            : isRefunded ? '该订单已退款，相关付费权益已失效'
              : !price ? '暂未取得有效金额，请稍后重新加载'
                : '付款尚未确认；继续支付前会先核对原订单'}</Text>
        </View>
      )}

      <View className="action-panel">
        {canPay && <View className={`primary-button${isPaying ? ' button-disabled' : ''}`} onClick={handlePayment}><Text>{isPaying ? '正在准备支付...' : `解锁当前案件 · ${price}`}</Text></View>}
        {isPending && <>
          {price && <View className={`primary-button${isPaying || isLoading ? ' button-disabled' : ''}`} onClick={() => { if (!isPaying && !isLoading) handlePayment() }}><Text>{isPaying ? '正在核对原订单...' : `继续支付 · ${price}`}</Text></View>}
          <View className={`secondary-button${isPaying || isLoading ? ' button-disabled' : ''}`} onClick={refresh}><Text>{isPaying || isLoading ? '正在确认...' : '刷新支付结果'}</Text></View>
        </>}
        {isPaid && <View className="primary-button" onClick={goNext}><Text>{currentCase.hasReport ? '查看完整方案' : '继续处理案件'}</Text></View>}
        {(isRefunded || !price) && <View className="secondary-button" onClick={refresh}><Text>重新加载</Text></View>}
      </View>

      {features.length > 0 && <View className="features-section">
        <Text className="section-title">完整方案包含</Text>
        <View className="benefits-card">
          {features.map(feature => (
            <View className="benefit-item" key={feature.title}>
              <View className="benefit-icon"><Icon name={feature.icon} size={23} color="#111827" /></View>
              <View className="benefit-copy">
                <Text className="benefit-title">{feature.title}</Text>
                <Text className="benefit-description">{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>}

      <View className="explanation-card">
        <View className="explanation-icon"><Icon name="lock-keyhole" size={18} color="#4D6BFE" /></View>
        <View className="explanation-copy">
          <Text className="explanation-title">安心支付</Text>
          <Text className="explanation-text">一次付费仅解锁当前案件，不会自动续费，也不会为其他案件自动扣款。</Text>
        </View>
      </View>
    </View>
  )
}
