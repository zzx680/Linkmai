import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { createPaymentOrder, getCurrentCase, getPaymentOrder } from '../services/api'
import { useAppStore } from '../store'
import { IS_H5 } from '../config/env'
import {
  formatPaymentPrice, matchesPaymentAmount, matchesPendingPayment, paymentConfirmation,
  PAYMENT_POLL_DELAYS, PENDING_PAYMENT_KEY, PendingPayment, PaymentConfirmation
} from '../utils/payment'

let paymentInProgress = false

export function useCasePayment() {
  const [isPaying, setIsPaying] = useState(false)
  const [confirmation, setConfirmation] = useState<PaymentConfirmation | null>(null)
  const mounted = useRef(true)
  const sessionVersion = useRef(0)
  const userId = useAppStore(state => state.user?.id)
  const caseId = useAppStore(state => state.currentCase?.id)

  useEffect(() => {
    mounted.current = true
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.token !== previous.token || state.user?.id !== previous.user?.id
        || state.currentCase?.id !== previous.currentCase?.id) sessionVersion.current += 1
    })
    return () => { mounted.current = false; unsubscribe() }
  }, [])

  useEffect(() => { setConfirmation(null) }, [userId, caseId])

  const run = async (resume: boolean) => {
    const state = useAppStore.getState()
    const currentCase = state.currentCase
    const owner = state.user?.id
    if (!owner || !state.isLoggedIn || !currentCase || paymentInProgress) return
    if (!resume && (currentCase.entitlement?.status === 'paid' || currentCase.entitlement?.status === 'refunded'
      || !formatPaymentPrice(currentCase.entitlement))) return
    const token = state.token
    const version = sessionVersion.current
    const isCurrent = () => {
      const latest = useAppStore.getState()
      return mounted.current && sessionVersion.current === version && latest.isLoggedIn && latest.token === token
        && latest.user?.id === owner && latest.currentCase?.id === currentCase.id
    }
    const readPending = (): PendingPayment | null => {
      const value = Taro.getStorageSync(PENDING_PAYMENT_KEY)
      return matchesPendingPayment(value, owner, currentCase.id) ? value : null
    }
    const refreshCase = async () => {
      const latest = await getCurrentCase()
      if (isCurrent() && latest?.id === currentCase.id) useAppStore.setState({ currentCase: latest })
    }
    const poll = async (pending: PendingPayment) => {
      for (const delay of PAYMENT_POLL_DELAYS) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
        if (!isCurrent()) return null
        const order = await getPaymentOrder(pending.orderId)
        if (!isCurrent()) return null
        if (order.caseId !== pending.caseId) throw new Error('订单与当前案件不一致')
        const result = paymentConfirmation(order)
        if (result !== 'pending') {
          Taro.removeStorageSync(PENDING_PAYMENT_KEY)
          return result
        }
      }
      return 'pending' as const
    }
    paymentInProgress = true
    setIsPaying(true)
    try {
      let pending = readPending()
      if (resume) {
        if (!pending) return
      } else {
        if (IS_H5) {
          Taro.showToast({ title: '请在微信小程序中完成支付', icon: 'none' })
          return
        }
        const result = await createPaymentOrder(currentCase.id, `${currentCase.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        if (!isCurrent()) return
        if (result.alreadyPaid) {
          await refreshCase()
          if (isCurrent()) {
            setConfirmation('paid')
            const previous = readPending()
            if (previous) Taro.removeStorageSync(PENDING_PAYMENT_KEY)
          }
          return
        }
        if (!result.orderId || !result.payment) throw new Error('支付参数未准备好，请稍后重试')
        if (!matchesPaymentAmount(result, currentCase.entitlement)) {
          await refreshCase()
          if (isCurrent()) Taro.showToast({ title: '支付金额已更新，请核对后重新支付', icon: 'none' })
          return
        }
        pending = { userId: owner, caseId: currentCase.id, orderId: result.orderId }
        Taro.setStorageSync(PENDING_PAYMENT_KEY, pending)
        try {
          await Taro.requestPayment(result.payment)
        } catch (error: any) {
          const message = error?.errMsg || error?.message || String(error)
          if (isCurrent()) Taro.showToast({ title: message.includes('cancel') ? '已取消支付' : '支付未完成，正在确认订单', icon: 'none' })
        }
      }
      const result = await poll(pending!)
      if (!result || !isCurrent()) return
      setConfirmation(result)
      await refreshCase()
      if (!isCurrent()) return
      Taro.showToast({
        title: result === 'paid' ? '已解锁完整方案' : result === 'refunded' ? '订单已退款'
          : result === 'failed' ? '订单未完成，可重新支付' : '支付结果待确认，请稍后刷新',
        icon: result === 'paid' ? 'success' : 'none'
      })
    } catch (error: any) {
      if (isCurrent()) Taro.showToast({ title: error?.message || '支付结果确认失败，请稍后刷新', icon: 'none' })
    } finally {
      paymentInProgress = false
      if (mounted.current) setIsPaying(false)
    }
  }

  return { isPaying, confirmation, handlePayment: () => run(false), reconcilePendingPayment: () => run(true) }
}
