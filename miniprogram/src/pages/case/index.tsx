import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { Avatar, Icon, SkeletonCaseCard } from '../../components'
import { IS_H5 } from '../../config/env'
import { syncTabRoute } from '../../custom-tab-bar/navigation'
import { useCasePayment } from '../../hooks/useCasePayment'
import { useAppStore } from '../../store'
import { formatPaymentPrice } from '../../utils/payment'
import { getCaseNextStep, getHomeMode, getHomeStepDetail } from './home-state'
import CaseJourney from '../../components/CaseJourney'
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
        if (ok) Taro.showToast({ title: '登录成功', icon: 'success' })
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
    if (nextStep === 'view_payment_status') {
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
          <Text className="welcome-title">你好👋<Text className="welcome-title-line">欢迎使用灵迈</Text></Text>
        </View>
        <View className="welcome-process">
          <View className="welcome-section-heading"><Text>从这里开始</Text><Text className="welcome-section-caption">按自己的进度，逐步处理</Text></View>
          {[
            ['01', '讲清事故经过', '用对话梳理时间、地点与当事人信息。'],
            ['02', '核对关键材料', '上传认定书与医疗记录，逐项核对识别结果。'],
            ['03', '形成处理方案', '确认事实后，按需解锁案件分析与行动建议。']
          ].map(([number, title, copy]) => <View className="welcome-process-row" key={number}><Text className="welcome-process-number">{number}</Text><View className="welcome-process-copy"><Text className="welcome-process-title">{title}</Text><Text className="welcome-process-detail">{copy}</Text></View></View>)}
        </View>
        {authError && <View className="auth-error-panel"><Text className="auth-error-title">暂未连接到你的账户</Text></View>}
        <View className="welcome-start"><Button className="welcome-login" loading={isAuthenticating} disabled={isAuthenticating} onClick={handlePrimaryAction}>{isAuthenticating ? '正在连接微信账户' : authRetryable ? '重新连接' : '微信登录并开始'}</Button></View>
        <View className="welcome-boundary"><Text>灵迈提供 AI 辅助整理与分析，不替代专业法律意见。</Text></View>
      </View>
    )
  }

  if (mode === 'loading') {
    return (
      <View className="case-page loading-page">
        <View className="identity-block skeleton-identity">
          <View className="skeleton-line short" />
          <View className="skeleton-line long" />
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
      <CaseJourney active={nextStep === 'view_report' ? 3 : nextStep === 'unlock_full_plan' || nextStep === 'view_payment_status' ? 2 : nextStep === 'confirm_materials' ? 1 : 0} title={hasCase ? '每一步，都有迹可循。' : '先把经过讲清楚。'} description={hasCase ? '材料、事实与下一步行动，集中在你的案件工作台。' : '创建案件后，灵迈会通过对话帮你梳理事故信息。'} />
      {authError && <View className="auth-error-panel"><Text className="auth-error-title">暂未连接到你的账户</Text><Button loading={isAuthenticating} disabled={isAuthenticating} onClick={() => retryAuth()} className="auth-retry">重新连接</Button></View>}
      <View className="identity-block">
        <View className="identity-topline">
          {isLoggedIn && <Avatar name={nickname} src={user?.avatar} size={40} />}
          <Text className="identity-kicker">{isLoggedIn ? `${nickname}的案件工作台` : '灵迈案件工作台'}</Text>
        </View>
        <Text className="identity-title">{isLoggedOut ? '先登录，案件进度才会保存' : isEmpty ? '从一份材料开始整理案件' : currentCase?.title || '交通事故案件'}</Text>
        <Text className="identity-description">{isLoggedOut
          ? '登录后可以创建案件、保存材料，并在后续继续查看处理进度。'
          : isEmpty
            ? '上传认定书、现场照片或医疗记录，灵迈会帮你梳理清晰的处理路径。'
            : currentCase?.statusLabel || '案件信息会随着材料和处理进度持续更新。'}</Text>
      </View>

      {mode === 'load_error' && (
        <View className="load-error-note">
          <Icon name="info" size={18} color="#1E43A8" />
          <Text>暂时无法更新进度{caseLoadError ? `：${caseLoadError}` : ''}</Text>
        </View>
      )}

      <View className={`workbench-card${hasCase ? ` workbench-card-${nextStep}` : ''}`}>
        <View className="workbench-card-header">
          <View className="workbench-icon"><Icon name={isLoggedOut ? 'user-round' : isEmpty ? 'file-text' : nextStep === 'view_report' ? 'circle-check' : 'route'} size={26} color="#1E43A8" /></View>
          <View className="workbench-heading">
            <View className="status-pill"><Text>{isLoggedOut ? '账户登录' : isEmpty ? '新建案件' : detail.badge}</Text></View>
            <Text className="workbench-title">{isLoggedOut ? '登录后开始处理事故' : isEmpty ? '创建你的第一个案件' : detail.title}</Text>
          </View>
        </View>
        <Text className="workbench-description">{isLoggedOut
          ? '案件和材料会保存在你的账户中，方便随时继续处理。'
          : isEmpty
            ? '创建后即可在处理页上传材料、描述事故经过，并核对关键信息。'
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
          <View className="payment-note"><Icon name="shield-check" size={18} color="#1E43A8" /><Text>一次付费，仅解锁当前案件；后续更新不再收费</Text></View>
        )}
        {hasCase && nextStep === 'continue_case' && (
          <View className="unlocked-note"><Icon name="circle-check" size={18} color="#059669" /><Text>本案件已解锁完整处理方案</Text></View>
        )}

        <View className={`primary-action${isCreating || isPaying ? ' primary-action-disabled' : ''}`} onClick={handlePrimaryAction}>
          <Text>{primaryLabel}</Text>
          {!isCreating && !isPaying && <Icon name="arrow-right" size={20} color="#FFFFFF" />}
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
            <View className="summary-link" onClick={goToMaterials}><Text>查看材料与已整理信息</Text><Icon name="chevron-right" size={18} color="#1E43A8" /></View>
          </View>

          <View className="quick-section">
            <Text className="section-label">快捷入口</Text>
            <View className="quick-grid">
              <View className="quick-item" onClick={() => Taro.switchTab({ url: '/pages/agent/index' })}><Icon name="messages-square" size={20} color="#1E43A8" /><Text>处理案件</Text></View>
              <View className="quick-item" onClick={goToMaterials}><Icon name="folder-open" size={20} color="#1E43A8" /><Text>材料与证据</Text></View>
              <View className="quick-item" onClick={() => Taro.navigateTo({ url: '/pages/payments/index' })}><Icon name="credit-card" size={20} color="#1E43A8" /><Text>案件权益</Text></View>
            </View>
          </View>
        </>
      )}
    </View>
  )
}
