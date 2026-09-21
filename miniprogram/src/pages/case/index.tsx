import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { SkeletonCaseCard } from '../../components'
import './index.scss'

// Mock 数据
const mockCases = [
  {
    id: '1',
    title: '市南区香港路追尾事故',
    date: '2024-09-15',
    status: 'completed',
    responsibility: '对方全责',
    compensation: '¥12,500',
    thumbnail: '🚗',
    lastUpdate: '2小时前'
  },
  {
    id: '2',
    title: '崂山区海尔路路口碰撞',
    date: '2024-09-10',
    status: 'analyzing',
    responsibility: '分析中...',
    compensation: '待计算',
    thumbnail: '🚙',
    lastUpdate: '1天前'
  },
  {
    id: '3',
    title: '李沧区京口路刮擦事故',
    date: '2024-09-05',
    status: 'completed',
    responsibility: '同等责任',
    compensation: '¥8,200',
    thumbnail: '🚕',
    lastUpdate: '5天前'
  }
]

export default function Case() {
  const [cases, setCases] = useState(mockCases)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 模拟加载数据
    setTimeout(() => {
      setLoading(false)
    }, 1000)
  }, [])

  const handleCaseClick = (caseId: string) => {
    Taro.navigateTo({ url: `/pages/case-detail/index?id=${caseId}` })
  }

  const handleNewCase = () => {
    Taro.switchTab({ url: '/pages/agent/index' })
  }

  return (
    <View className="case-page">
      <View className="header">
        <Text className="title">我的案例</Text>
        <View className="new-case-btn" onClick={handleNewCase}>
          <Text className="btn-text">+ 新建</Text>
        </View>
      </View>

      {loading ? (
        <View className="cases-list">
          <SkeletonCaseCard />
          <SkeletonCaseCard />
          <SkeletonCaseCard />
        </View>
      ) : cases.length === 0 ? (
        <View className="empty-state">
          <Text className="empty-icon">📋</Text>
          <Text className="empty-title">还没有案例</Text>
          <Text className="empty-subtitle">点击右上角创建第一个案例</Text>
        </View>
      ) : (
        <View className="cases-list">
          {cases.map(item => (
            <View
              key={item.id}
              className="case-card"
              onClick={() => handleCaseClick(item.id)}
            >
              <View className="case-header">
                <View className="case-icon-wrapper">
                  <Text className="case-icon">{item.thumbnail}</Text>
                </View>
                <View className="case-info">
                  <Text className="case-title">{item.title}</Text>
                  <Text className="case-date">{item.lastUpdate}</Text>
                </View>
                <View className={`status-badge ${item.status}`}>
                  <Text className="status-text">
                    {item.status === 'completed' ? '已完成' : '分析中'}
                  </Text>
                </View>
              </View>

              <View className="case-divider" />

              <View className="case-details">
                <View className="detail-item">
                  <Text className="detail-label">责任判定</Text>
                  <Text className="detail-value">{item.responsibility}</Text>
                </View>
                <View className="detail-item">
                  <Text className="detail-label">预估赔偿</Text>
                  <Text className="detail-value highlight">{item.compensation}</Text>
                </View>
              </View>

              <View className="case-footer">
                <Text className="view-detail">查看详情 →</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View className="footer-tip">
        <Text className="tip-text">案例数据仅保存在本地</Text>
      </View>
    </View>
  )
}
