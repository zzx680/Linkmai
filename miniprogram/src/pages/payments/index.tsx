import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { getCurrentCase } from '../../services/api'
import { Icon } from '../../components'
import { useCasePayment } from '../../hooks/useCasePayment'
import { useAppStore } from '../../store'
import { entitlementLabel, formatPaymentPrice } from '../../utils/payment'
import { IS_H5 } from '../../config/env'
import OrderHistory from './OrderHistory'
import brandMark from '../../assets/brand/linkmai-chat.png'
import laurel from '../../assets/payments/laurel.png'
import unlockSparkles from '../../assets/payments/unlock-sparkles.png'
import './index.scss'

const FEATURE_DETAILS = {
  fullReport: { icon: 'chart-no-axes-combined', title: '完整事故处理报告', description: '汇总责任、材料与关键结论' },
  compensationEstimate: { icon: 'scale', title: '赔偿项目与依据', description: '梳理相关项目、凭证和规则参考' },
  actionPlan: { icon: 'route', title: '分步骤处理方案', description: '按当前进展给出下一步行动建议' },
  rerunAfterMaterialUpdate: { icon: 'loader-circle', title: '补充材料后更新分析', description: '材料变化后重新整理完整方案' }
} as const

function formatPaidAt(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function CasePaymentPanel() {
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
      <View className="case-payment-panel centered-page">
        <View className="empty-card">
          <View className="empty-icon"><Icon name="user-round" size={30} color="#2A64F0" /></View>
          <Text className="empty-title">登录后查看付费权益</Text>
          <Text className="empty-description">登录后可查看当前案件的解锁状态，并继续完成支付</Text>
          <View className="primary-button" onClick={() => retryAuth()}><Text>{authRetryable ? '重新登录' : '登录'}</Text></View>
        </View>
      </View>
    )
  }

  if (isLoading && !currentCase) {
    return <View className="case-payment-panel"><View className="loading-card"><View className="loading-line loading-line-short" /><View className="loading-line" /><View className="loading-line" /></View></View>
  }

  if (loadError) {
    return <View className="case-payment-panel centered-page"><View className="empty-card"><Text className="empty-title">暂时无法加载权益</Text><Text className="empty-description">{loadError}</Text><View className="primary-button" onClick={refresh}><Text>重新加载</Text></View></View></View>
  }

  if (!currentCase) {
    return (
      <View className="case-payment-panel centered-page">
        <View className="empty-card">
          <View className="empty-icon"><Icon name="file-text" size={30} color="#2A64F0" /></View>
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
    <View className="case-payment-panel">
      <View className="payments-header">
        <View className="membership-emblem"><Image className="membership-logo" src={brandMark} mode="aspectFit" /></View>
        <View className="payments-brand"><Text className="payments-title">灵迈</Text><Text className="payments-pro">PRO</Text></View>
      </View>

      <View className={`plan-card plan-card-${status}`}>
        <View className="plan-card-content">
          <View className="plan-topline">
            <Text className="plan-kicker">单次案件解决方案</Text>
            <View className="status-pill">
              <Icon name={isPaid ? 'check' : isRefunded ? 'undo-2' : 'clock-3'} size={14} color="#111827" />
              <Text>{entitlementLabel(status)}</Text>
            </View>
          </View>
          <View className="plan-price-row">
            <View className="plan-price-copy">
              <Text className="plan-price-label">一次性解锁</Text>
              <Text className="plan-price">{price || '金额待确认'}</Text>
            </View>
            <View className="plan-mark"><Icon name={isPaid ? 'circle-check' : 'shield-check'} size={30} color="#FFFFFF" /></View>
          </View>
        </View>
      </View>

      {(isPaid || isPending || isRefunded || !price) && (
        <View className={`status-panel${isPaid ? ' status-panel-success' : isRefunded || !price ? ' status-panel-muted' : ''}`}>
          <Icon name={isPaid ? 'circle-check' : isRefunded ? 'undo-2' : !price ? 'info' : 'clock-3'} size={20} color={isPaid ? '#057A55' : isRefunded || !price ? '#6B7280' : '#2A64F0'} />
          <Text>{isPaid
            ? `本案件已解锁，后续更新不再收费${paidAt ? ` · ${paidAt}` : ''}`
            : isRefunded ? '该订单已退款，相关付费权益已失效'
              : !price ? '暂未取得有效金额，请稍后重新加载'
                : '付款尚未确认；继续支付前会先核对原订单'}</Text>
        </View>
      )}

      {features.length > 0 && <View className="features-section">
        <View className="benefits-heading">
          <Image className="benefits-laurel" src={laurel} mode="aspectFit" aria-hidden />
          <Text className="section-title">完整方案包含</Text>
          <Image className="benefits-laurel benefits-laurel-right" src={laurel} mode="aspectFit" aria-hidden />
        </View>
        <View className="benefits-card">
          {features.map(feature => (
            <View className="benefit-item" key={feature.title}>
              <View className="benefit-icon"><Icon name={feature.icon} size={23} color="#111827" /></View>
              <View className="benefit-copy">
                <Text className="benefit-title">{feature.title}</Text>
                <Text className="benefit-description">{feature.description}</Text>
              </View>
              <View className="benefit-check"><Text>✓</Text></View>
            </View>
          ))}
        </View>
      </View>}

      <View className="action-panel payment-dock">
        {canPay && <Button className={`primary-button${isPaying ? ' button-disabled' : ''}`} disabled={isPaying} onClick={handlePayment}>
          <Image className="unlock-sparkles" src={unlockSparkles} mode="aspectFit" aria-hidden />
          <Text>{isPaying ? '正在准备支付...' : '立即解锁'}</Text>
        </Button>}
        {isPending && <>
          {price && <Button className={`primary-button${isPaying || isLoading ? ' button-disabled' : ''}`} disabled={isPaying || isLoading} onClick={() => { if (!isPaying && !isLoading) handlePayment() }}><Text>{isPaying ? '正在核对原订单...' : `继续支付 · ${price}`}</Text></Button>}
          <Button className={`secondary-button${isPaying || isLoading ? ' button-disabled' : ''}`} disabled={isPaying || isLoading} onClick={refresh}><Text>{isPaying || isLoading ? '正在确认...' : '刷新支付结果'}</Text></Button>
        </>}
        {isPaid && <Button className="primary-button" onClick={goNext}><Text>{currentCase.hasReport ? '查看完整方案' : '继续处理案件'}</Text></Button>}
        {(isRefunded || !price) && <Button className="secondary-button" onClick={refresh}><Text>重新加载</Text></Button>}
      </View>

    </View>
  )
}

export default function PaymentsPage() {
  const { isLoggedIn, token } = useAppStore()
  const [historyOpen, setHistoryOpen] = useState(false)
  useEffect(() => { setHistoryOpen(false) }, [token])
  return <View className="payments-page">
    <CasePaymentPanel />
    {isLoggedIn && <View className="payment-history">
      <Button className="history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>
        <Text>{historyOpen ? '收起订单记录' : '查看订单记录'}</Text>
        <Icon name="chevron-right" size={14} color="#6B7280" className={historyOpen ? 'history-chevron history-chevron-open' : 'history-chevron'} />
      </Button>
      {historyOpen && <OrderHistory key={token} />}
    </View>}
  </View>
}
