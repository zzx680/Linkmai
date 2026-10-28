import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { createReportNotificationSubscription, getReportNotificationConfig } from '../services/api'
import { IS_H5 } from '../config/env'
import { useAppStore } from '../store'

export function useReportNotification(caseId?: string | null) {
  const userId = useAppStore(state => state.user?.id || '')
  const [templateId, setTemplateId] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('')
  const [isSubscribing, setIsSubscribing] = useState(false)
  const requestInFlight = useRef(false)

  useEffect(() => {
    let active = true
    setTemplateId('')
    setSubscriptionId('')
    if (!caseId || !userId || IS_H5) return () => { active = false }
    void getReportNotificationConfig()
      .then(result => { if (active && result.enabled) setTemplateId(result.templateId) })
      .catch(() => undefined)
    return () => { active = false }
  }, [caseId, userId])

  const subscribe = async () => {
    if (!caseId || !userId || !templateId || requestInFlight.current) return false
    requestInFlight.current = true
    setIsSubscribing(true)
    try {
      const requestWechatSubscribeMessage = Taro.requestSubscribeMessage as unknown as (
        options: { tmplIds: string[] }
      ) => Promise<Record<string, string>>
      const authorization = await requestWechatSubscribeMessage({ tmplIds: [templateId] })
      if (authorization.errMsg !== 'requestSubscribeMessage:ok') throw new Error('SUBSCRIBE_AUTHORIZATION_FAILED')
      if (authorization[templateId] !== 'accept') return false
      if (useAppStore.getState().user?.id !== userId || useAppStore.getState().currentCase?.id !== caseId) return false
      const result = await createReportNotificationSubscription(caseId)
      if (useAppStore.getState().user?.id !== userId || useAppStore.getState().currentCase?.id !== caseId) return false
      setSubscriptionId(result.subscriptionId)
      Taro.showToast({ title: '已开启本次完成提醒', icon: 'success' })
      return true
    } catch {
      Taro.showToast({ title: '提醒未开启，可继续生成报告', icon: 'none' })
      return false
    } finally {
      requestInFlight.current = false
      setIsSubscribing(false)
    }
  }

  return {
    enabled: Boolean(templateId && userId), subscriptionId, isSubscribing, subscribe,
    clearSubscription: () => setSubscriptionId(''),
  }
}
