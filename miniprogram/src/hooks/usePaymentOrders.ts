import { useEffect, useRef, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { getPaymentOrder, listPaymentOrders, PaymentOrderList } from '../services/api'
import type { PaymentOrderRecord } from '../services/api'
import { useAppStore } from '../store'

const EMPTY: PaymentOrderList = { orders: [], hasMore: false, nextOffset: 0 }

export function usePaymentOrders() {
  const { token, isLoggedIn } = useAppStore()
  const [snapshot, setSnapshot] = useState<PaymentOrderList & { owner: string | null }>({ ...EMPTY, owner: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const busy = useRef(false)
  const requestedMore = useRef(false)
  const statusBusy = useRef(false)
  const statusSequence = useRef(0)
  const [refreshingOrderId, setRefreshingOrderId] = useState<string | null>(null)
  const latest = useRef(snapshot)
  latest.current = snapshot

  const load = async (more = false) => {
    const session = useAppStore.getState()
    if (!session.isLoggedIn || !session.token || busy.current || statusBusy.current) return
    const owner = session.token
    const previous = latest.current.owner === owner ? latest.current : { ...EMPTY, owner }
    if (more && !previous.hasMore) return
    const version = ++sequence.current
    requestedMore.current = more
    busy.current = true
    setLoading(true)
    setError('')
    try {
      const result = await listPaymentOrders(more ? previous.nextOffset : 0)
      if (version !== sequence.current || useAppStore.getState().token !== owner || !useAppStore.getState().isLoggedIn) return
      const orders = more
        ? [...new Map([...previous.orders, ...result.orders].map(order => [order.orderId, order])).values()]
        : result.orders
      const next = { ...result, orders, owner }
      latest.current = next
      setSnapshot(next)
    } catch (failure) {
      if (version === sequence.current && useAppStore.getState().token === owner) {
        const status = (failure as { statusCode?: number } | null)?.statusCode
        setError(status === 404
          ? '订单查询服务暂不可用，请稍后重试或联系客服'
          : failure instanceof Error ? failure.message : '订单加载失败，请重试')
      }
    } finally {
      if (version === sequence.current) {
        busy.current = false
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    sequence.current += 1
    statusSequence.current += 1
    busy.current = false
    statusBusy.current = false
    setRefreshingOrderId(null)
    latest.current = { ...EMPTY, owner: null }
    setSnapshot(latest.current)
    setError('')
    setLoading(false)
    if (isLoggedIn && token) void load()
    return () => { sequence.current += 1; statusSequence.current += 1; busy.current = false; statusBusy.current = false }
  }, [token, isLoggedIn])

  useDidShow(() => { void load() })

  const refreshStatus = async (orderId: string) => {
    const session = useAppStore.getState()
    const owner = session.token
    if (!session.isLoggedIn || !owner || statusBusy.current || busy.current) return
    if (latest.current.owner !== owner || !latest.current.orders.some(order => order.orderId === orderId)) return
    const version = ++statusSequence.current
    statusBusy.current = true
    setRefreshingOrderId(orderId)
    try {
      const result = await getPaymentOrder(orderId)
      const currentSession = useAppStore.getState()
      if (version !== statusSequence.current || currentSession.token !== owner || !currentSession.isLoggedIn) return
      const current = latest.current
      if (current.owner !== owner) return
      const orders = current.orders.map(order => order.orderId === orderId
        ? ({ ...order, ...result, createdAt: result.createdAt || order.createdAt, updatedAt: result.updatedAt || order.updatedAt } as PaymentOrderRecord)
        : order)
      const next = { ...current, orders }
      latest.current = next
      setSnapshot(next)
      setError('')
    } catch (failure) {
      if (version === statusSequence.current && useAppStore.getState().token === owner) {
        setError(failure instanceof Error ? failure.message : '支付状态刷新失败，请重试')
      }
    } finally {
      if (version === statusSequence.current) {
        statusBusy.current = false
        setRefreshingOrderId(null)
      }
    }
  }

  return {
    ...(isLoggedIn && snapshot.owner === token ? snapshot : EMPTY),
    loading, error,
    refresh: () => load(),
    loadMore: () => load(true),
    retry: () => load(requestedMore.current),
    refreshStatus,
    refreshingOrderId,
  }
}
