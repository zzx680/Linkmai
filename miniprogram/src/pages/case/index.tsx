import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { Icon, SkeletonCaseCard } from '../../components'
import { IS_H5 } from '../../config/env'
import { syncTabRoute } from '../../custom-tab-bar/navigation'
import { useCasePayment } from '../../hooks/useCasePayment'
import { useAppStore } from '../../store'
import { formatPaymentPrice } from '../../utils/payment'
import { getCaseNextStep, getHomeMode, getHomeStepDetail, getJourneyStep } from './home-state'
import CaseJourney from '../../components/CaseJourney'
import OnboardingGuide from '../../components/OnboardingGuide'
import { completeGuideSteps } from '../../components/OnboardingGuide/progress'
import './index.scss'

export default function CasePage() {
  const {
    user,
    isLoggedIn,
    authRetryable,
    authError,
    isAuthenticating,
    currentCase,
    isLoadingCase,
    caseLoadError,
    materials,
    conversationState,
    loadCurrentCase,
    createCase,
    retryAuth
  } = useAppStore()
  const [isCreating, setIsCreating] = useState(false)
  const { isPaying, handlePayment, reconcilePendingPayment } = useCasePayment()

  useDidShow(() => {
    syncTabRoute('/pages/case/index')
    if (!IS_H5 && useAppStore.getState().isLoggedIn) {
      loadCurrentCase().finally(reconcilePendingPayment)
    }
  })

  const mode = getHomeMode({ isLoggedIn, isLoadingCase, caseLoadError, currentCase })
  const nextStep = useMemo(() => currentCase
    ? getCaseNextStep({ currentCase, materials, conversationState })
    : 'login', [currentCase, materials, conversationState])
  const detail = getHomeStepDetail(nextStep, materials.length || currentCase?.materialCount || 0)
  const price = formatPaymentPrice(currentCase?.entitlement)
  const confirmedCount = materials.filter(material => material.confirmed).length
  const nickname = user?.nickname || 'momo'

  const goToMaterials = () => {
    if (!currentCase) return
    Taro.navigateTo({ url: `/pages/materials/index?caseId=${currentCase.id}` })
  }

  const handleCreateCase = async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      await createCase()
      completeGuideSteps(['login', 'create-case'])
      await Taro.switchTab({ url: '/pages/agent/index' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '创建失败，请重试', icon: 'none' })
    } finally {
      setIsCreating(false)
    }
  }

  const handlePrimaryAction = () => {
    if (isCreating || isPaying || isAuthenticating) return
    if (mode === 'logged_out' || authRetryable) {
      retryAuth().then(ok => {
        if (ok) {
          completeGuideSteps(['login'])
          Taro.showToast({ title: '登录成功', icon: 'success' })
        }
      })
      return
    }
    if (mode === 'load_error') {
      loadCurrentCase()
      return
    }
    if (mode === 'empty') {
      handleCreateCase()
      return
    }
    if (!currentCase) return

    if (nextStep === 'unlock_full_plan') {
      if (price) handlePayment()
      else Taro.navigateTo({ url: '/pages/payments/index' })
      return
    }
    if (nextStep === 'view_payment_status' || nextStep === 'view_refund_status') {
      Taro.navigateTo({ url: '/pages/payments/index' })
      return
    }
    if (nextStep === 'view_report') {
      Taro.navigateTo({ url: `/pages/report/index?caseId=${currentCase.id}` })
      return
    }
    if (nextStep === 'confirm_materials') {
      goToMaterials()
      return
    }
    Taro.switchTab({ url: '/pages/agent/index' })
  }

  if (mode === 'logged_out' || (!user && isAuthenticating)) {
    return (
      <View className="case-page welcome-page">
        <View className="welcome-intro">
          <Text className="welcome-title">Hello👋<Text className="welcome-title-line">欢迎使用灵迈</Text></Text>
        </View>
        <CaseJourney active={0} compact identityLabel="登录后使用案件工作台" actionId="guide-login" actionLabel={isAuthenticating ? '正在连接微信账户' : authRetryable ? '重新连接并开始' : '微信登录并开始'} onAction={handlePrimaryAction} actionLoading={isAuthenticating} />
        {authError && <View className="auth-error-panel"><Text className="auth-error-title">暂未连接到你的账户</Text></View>}
        <View className="welcome-privacy-link" onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })} role="button"><Text>查看隐私说明与数据管理</Text></View>
        <View className="welcome-boundary"><Text>灵迈提供 AI 辅助整理与分析，不替代专业法律意见。</Text></View>
      </View>
    )
  }

  if (mode === 'loading') {
    return (
      <View className="case-page loading-page">
        <View className="identity-block skeleton-identity">
          <View className="skeleton-line long" />
          <View className="skeleton-line short" />
        </View>
        <SkeletonCaseCard />
      </View>
    )
  }

  const isEmpty = mode === 'empty'
  const isLoggedOut = !isLoggedIn
  const hasCase = Boolean(currentCase)
  const primaryLabel = isLoggedOut
    ? authRetryable ? '重新登录后开始' : '登录后开始'
    : mode === 'load_error'
      ? '重新加载'
      : isEmpty
        ? isCreating ? '正在创建...' : '创建案件'
        : nextStep === 'unlock_full_plan' && price
          ? `解锁完整方案 ${price}`
          : isPaying
            ? '正在准备支付...'
            : detail.cta

  return (
    <View className="case-page">
      <View className="identity-block">
        <View className="home-welcome">
          <Text className="home-welcome-hello">Hello👋</Text>
          <Text className="home-welcome-title">欢迎使用灵迈</Text>
        </View>
      </View>

      <CaseJourney active={getJourneyStep(nextStep)} compact identityLabel={`${nickname}的案件工作台`} identityAvatar={user?.avatar} actionLabel="开始处理" />
      {authError && <View className="auth-error-panel"><Text className="auth-error-title">暂未连接到你的账户</Text><Button loading={isAuthenticating} disabled={isAuthenticating} onClick={() => retryAuth()} className="auth-retry">重新连接</Button></View>}

      {mode === 'load_error' && (
        <View className="load-error-note">
          <Icon name="info" size={18} color="#2A64F0" />
          <Text>暂时无法更新进度{caseLoadError ? `：${caseLoadError}` : ''}</Text>
        </View>
      )}

      <View className={`workbench-card workbench-card-stacked${hasCase ? ` workbench-card-${nextStep}` : ''}`}>
        <View className="workbench-card-header">
          <View className="workbench-icon"><Icon name={isLoggedOut ? 'user-round' : isEmpty ? 'file-text' : nextStep === 'view_report' ? 'circle-check' : 'route'} size={26} color="#2A64F0" /></View>
          <View className="workbench-heading">
            <View className="status-pill"><Text>{isLoggedOut ? '账户登录' : isEmpty ? '新建案件' : detail.badge}</Text></View>
          </View>
        </View>
        <Text className="workbench-title workbench-standalone-title">{isLoggedOut ? '登录后开始处理事故' : isEmpty ? '创建你的第一个案件' : detail.title}</Text>
        <Text className="workbench-description">{isLoggedOut
          ? '案件和材料会保存在你的账户中，方便随时继续处理'
          : isEmpty
            ? '描述经过，上传材料，核对信息'
            : detail.description}</Text>

        {hasCase && (
          <>
            <View className="progress-row">
              <Text>案件进度</Text>
              <Text>{detail.progress}%</Text>
            </View>
            <View className="progress-track"><View className="progress-value" style={{ width: `${detail.progress}%` }} /></View>
          </>
        )}

        {hasCase && nextStep === 'unlock_full_plan' && (
          <View className="payment-note"><Icon name="shield-check" size={18} color="#2A64F0" /><Text>一次付费，仅解锁当前案件；后续更新不再收费</Text></View>
        )}
        {hasCase && nextStep === 'continue_case' && (
          <View className="unlocked-note"><Icon name="circle-check" size={18} color="#059669" /><Text>本案件已解锁完整处理方案</Text></View>
        )}

        <View id="guide-create-case" className={`primary-action${isCreating || isPaying ? ' primary-action-disabled' : ''}`} onClick={handlePrimaryAction}>
          <Text>{primaryLabel}</Text>
          {!isCreating && !isPaying && <Icon name="arrow-right" size={20} color="#2A64F0" />}
        </View>
      </View>

      {hasCase && (
        <>
          <View className="summary-section">
            <Text className="section-label">案件摘要</Text>
            <View className="case-summary">
              <View className="summary-item"><Text className="summary-value">{materials.length || currentCase?.materialCount || 0}</Text><Text className="summary-label">材料份数</Text></View>
              <View className="summary-item"><Text className="summary-value">{confirmedCount}</Text><Text className="summary-label">已确认材料</Text></View>
              <View className="summary-item"><Text className="summary-value">{currentCase?.hasReport ? '已生成' : '处理中'}</Text><Text className="summary-label">完整方案</Text></View>
            </View>
            <View className="summary-link" onClick={goToMaterials}><Text>查看材料与已整理信息</Text><Icon name="chevron-right" size={18} color="#2A64F0" /></View>
          </View>

          <View className="quick-section">
            <Text className="section-label">快捷入口</Text>
            <View className="quick-grid">
              <View className="quick-item" onClick={() => Taro.switchTab({ url: '/pages/agent/index' })}><Icon name="messages-square" size={20} color="#AF52DE" /><Text>处理案件</Text></View>
              <View className="quick-item" onClick={goToMaterials}><Icon name="folder-open" size={20} color="#34C759" /><Text>材料与证据</Text></View>
              <View className="quick-item" onClick={() => Taro.navigateTo({ url: '/pages/payments/index' })}><Icon name="credit-card" size={20} color="#FF9500" /><Text>案件权益</Text></View>
            </View>
          </View>
        </>
      )}
      <OnboardingGuide enabled={isEmpty && !isCreating && !isAuthenticating && !authError} scrollPage steps={[
        { id: 'create-case', target: 'guide-create-case', number: '01 / 03', title: '从第一个案件开始', description: '点击这里创建案件，接下来就可以描述经过、整理事故材料', nextLabel: '知道了', targetLabel: '创建第一个案件', onTarget: handlePrimaryAction }
      ]} />
    </View>
  )
}
