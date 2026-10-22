import { Button, Text, View } from '@tarojs/components'
import { useState } from 'react'
import { usePaymentOrders } from '../../hooks/usePaymentOrders'
import type { PaymentOrderRecord } from '../../services/api'
import { privacyOperator } from '../../content/privacy'

const STATUS: Record<PaymentOrderRecord['status'], string> = {
  created: '待支付', pending: '待确认', paid: '已支付',
  failed: '支付失败', closed: '已关闭', refunded: '已退款',
}

function dateLabel(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function OrderHistoryContent({ orders, loading, error, hasMore, refresh, loadMore, retry, refreshStatus, refreshingOrderId }: ReturnType<typeof usePaymentOrders>) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return <View className="order-center">
    <View className="order-center-heading">
      <View><Text className="order-center-title">订单中心</Text><Text className="order-center-subtitle">全部案件 · 全部交易记录</Text></View>
      <Button className="order-text-button" disabled={loading} onClick={refresh}>{loading ? '加载中' : '刷新订单'}</Button>
    </View>
    {loading && orders.length === 0 && <View className="order-notice" role="status"><Text>正在加载订单</Text><View className="loading-line" /><View className="loading-line loading-line-short" /></View>}
    {!!error && <View className="order-notice"><Text>{error}</Text><Button className="order-text-button" disabled={loading} onClick={retry}>重新加载</Button></View>}
    {!loading && !error && orders.length === 0 && <View className="order-notice"><Text>暂无订单记录</Text><Text className="order-center-subtitle">创建支付订单后，可在这里查看交易详情</Text></View>}
    {orders.map(order => <View className="order-record" key={order.orderId}>
      <View className="order-record-heading"><Text className="order-service">案件完整处理方案</Text><Text className={`order-status order-status-${order.status}`}>{STATUS[order.status] || '状态待确认'}</Text></View>
      <View className="order-record-body"><View className="order-record-copy"><Text className="order-number" selectable>订单号 {order.orderNo}</Text><Text className="order-date">{dateLabel(order.createdAt)}</Text></View><Text className="order-amount">{order.currency === 'CNY' ? '¥' : `${order.currency} `}{(order.amountCents / 100).toFixed(2)}</Text></View>
      <Button className="order-detail-toggle" aria-expanded={expanded === order.orderId} onClick={() => setExpanded(expanded === order.orderId ? null : order.orderId)}>{expanded === order.orderId ? '收起详情' : '订单详情'}</Button>
      {expanded === order.orderId && <View className="order-detail">
        <View><Text>关联案件</Text><Text selectable>{order.caseId}</Text></View>
        <View><Text>下单时间</Text><Text>{dateLabel(order.createdAt)}</Text></View>
        {!!order.paidAt && <View><Text>支付时间</Text><Text>{dateLabel(order.paidAt)}</Text></View>}
        <View><Text>更新于</Text><Text>{dateLabel(order.updatedAt)}</Text></View>
        <Button className="order-detail-toggle" disabled={refreshingOrderId === order.orderId} onClick={() => refreshStatus(order.orderId)}>
          {refreshingOrderId === order.orderId ? '正在刷新支付状态' : '刷新支付状态'}
        </Button>
        <Text className="order-support">订单或退款问题，请联系 {privacyOperator.email}，并提供订单号</Text>
      </View>}
    </View>)}
    {hasMore && <Button className="order-more-button" disabled={loading} onClick={loadMore}>{loading ? '加载中' : '加载更多订单'}</Button>}
    {!hasMore && orders.length > 0 && <Text className="order-end">已显示全部订单</Text>}
  </View>
}

export default function OrderHistory() {
  return <OrderHistoryContent {...usePaymentOrders()} />
}
