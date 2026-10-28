import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components'
import { useAppStore } from '../../store'
import { getPrivacyRequests, submitPrivacyRequest, PrivacyRequest, PrivacyRequestKind } from '../../services/api'
import { privacyOperator, privacySections, privacyRequestLabels, privacyStatusLabels } from '../../content/privacy'
import { revokeCaseDataConsent } from '../../utils/privacy-consent'
import './index.scss'

export default function Privacy() {
  const { isLoggedIn, token, retryAuth, isAuthenticating } = useAppStore()
  const [requests, setRequests] = useState<PrivacyRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState<PrivacyRequestKind | null>(null)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const submitLock = useRef(false)

  const refresh = async () => {
    const session = useAppStore.getState().token
    if (!session) return
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    try {
      const items = await getPrivacyRequests()
      if (version === requestVersion.current && useAppStore.getState().token === session) setRequests(items)
    } catch (failure) {
      if (version === requestVersion.current && useAppStore.getState().token === session) {
        setError(failure instanceof Error ? failure.message : '申请记录暂时无法加载')
      }
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }

  useEffect(() => {
    setRequests([])
    setError('')
    setLoading(false)
    if (isLoggedIn) void refresh()
    return () => { requestVersion.current += 1 }
  }, [isLoggedIn, token])

  const submit = async (kind: PrivacyRequestKind) => {
    if (submitLock.current || !isLoggedIn) return
    const session = useAppStore.getState().token
    submitLock.current = true
    try {
      const result = await Taro.showModal({
        title: privacyRequestLabels[kind],
        content: kind === 'export_data'
          ? '提交后将由运营人员核验并处理，可在本页查看进度和回复。请勿通过反馈发送完整身份证或银行卡信息。'
          : '这是人工核验申请，不会立即删除数据或自动退款。处理可能影响案件访问；依法保留的交易记录将在回复中说明。是否提交？',
        confirmText: '提交申请', confirmColor: '#2A64F0'
      })
      if (!result.confirm || useAppStore.getState().token !== session) return
      setSubmitting(kind)
      setError('')
      const item = await submitPrivacyRequest(kind)
      if (useAppStore.getState().token !== session) return
      // A refresh started before submission must not hide the newly saved request.
      requestVersion.current += 1
      setLoading(false)
      setRequests(items => [item, ...items.filter(other => other.id !== item.id)].slice(0, 20))
      Taro.showToast({ title: '申请已受理，等待核验', icon: 'none' })
    } catch (failure) {
      if (useAppStore.getState().token === session) {
        setError(failure instanceof Error ? failure.message : '申请提交失败，请稍后重试')
      }
    } finally {
      submitLock.current = false
      setSubmitting(null)
    }
  }

  const revoke = async () => {
    const userId = useAppStore.getState().user?.id
    if (!userId) return
    const result = await Taro.showModal({ title: '撤回后续资料处理授权', content: '撤回后，再次发送事故描述、上传识别材料或生成报告时会重新征求同意。已发起的处理和已保存的数据不会自动删除；如需清除资料，请另行申请删除。', confirmText: '撤回授权', confirmColor: '#2A64F0' })
    if (!result.confirm || useAppStore.getState().user?.id !== userId) return
    revokeCaseDataConsent(userId)
    Taro.showToast({ title: '已撤回后续处理授权', icon: 'none' })
  }

  return (
    <View className="support-page privacy-page">
      <View className="support-header">
        <Text className="support-eyebrow">个人信息与账户</Text>
        <Text className="support-title">隐私与安全</Text>
        <Text className="support-description">了解资料如何用于案件整理，以及如何管理你的数据。</Text>
      </View>
      <View className="privacy-summary">
        <Icon name="shield-check" size={24} color="#000000" />
        <View className="card-copy"><Text className="card-title">只提交案件必需的信息</Text><Text className="card-description">医疗、身份等资料可能涉及敏感个人信息。上传前请遮盖无关内容，识别后逐项核对。</Text></View>
      </View>
      <View className="privacy-list">
        {privacySections.map((section, index) => (
          <View className="support-card privacy-policy-card" key={section.title}>
            <Text className="privacy-section-number">0{index + 1}</Text>
            <Text className="card-title">{section.title}</Text>
            {section.paragraphs.map(paragraph => <Text className="privacy-paragraph" key={paragraph}>{paragraph}</Text>)}
          </View>
        ))}
      </View>
      <View className="support-section">
        <Text className="section-title">管理我的数据</Text>
        <Text className="privacy-request-note">申请需由运营人员核验后处理。提交成功不代表已删除或已注销，请关注本页进度与回复。</Text>
        {!isLoggedIn ? (
          <View className="support-card privacy-login"><Text className="card-description">阅读隐私说明不需要登录；提交或查询个人数据申请需要验证账户。</Text><Button className="privacy-primary" loading={isAuthenticating} disabled={isAuthenticating} onClick={() => retryAuth()}>登录后管理数据</Button></View>
        ) : <>
          <View className="privacy-request-actions">
            <Button className="privacy-request-button" onClick={revoke}><Text>后续资料处理授权</Text><Text className="privacy-action-status">撤回 →</Text></Button>
            {(Object.keys(privacyRequestLabels) as PrivacyRequestKind[]).map(kind => {
              const open = requests.some(item => item.kind === kind && ['pending', 'processing'].includes(item.status))
              return <Button className="privacy-request-button" key={kind} loading={submitting === kind} disabled={!!submitting || open} onClick={() => submit(kind)}>
                <Text>{privacyRequestLabels[kind]}</Text><Text className="privacy-action-status">{open ? '已提交' : '申请'} →</Text>
              </Button>
            })}
          </View>
          <View className="privacy-history-heading"><Text className="card-title">最近申请</Text><Button className="privacy-refresh" disabled={loading || !!submitting} onClick={refresh}>{loading ? '加载中' : '刷新'}</Button></View>
          {!loading && !error && !requests.length && <Text className="privacy-request-note">暂无申请记录</Text>}
          <View className="privacy-list">{requests.map(item => <View className="support-card privacy-history-card" key={item.id}>
            <View className="privacy-history-top"><Text className="card-title">{privacyRequestLabels[item.kind]}</Text><Text className={`privacy-request-status privacy-request-status-${item.status}`}>{privacyStatusLabels[item.status]}</Text></View>
            <Text className="privacy-request-note">{new Date(item.createdAt).toLocaleDateString('zh-CN')} · 编号 {item.id}</Text>
            {item.response && <Text className="privacy-paragraph">处理回复：{item.response}</Text>}
          </View>)}</View>
        </>}
        {error && <View className="privacy-error" role="alert"><Text>{error}</Text></View>}
      </View>
      <View className="support-card privacy-operator">
        <Text className="card-title">运营与联系</Text>
        <Text className="privacy-paragraph">{privacyOperator.name}</Text>
        <Text className="privacy-paragraph" selectable>隐私、注销与付费问题：{privacyOperator.email}</Text>
        <Text className="privacy-paragraph">个人数据事宜可通过本页申请入口提交，产品使用问题可前往“帮助与反馈”。</Text>
      </View>
      <Text className="support-note">灵迈提供 AI 辅助整理与分析，不替代专业法律意见。</Text>
    </View>
  )
}
