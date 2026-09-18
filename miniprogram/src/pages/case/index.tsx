import { View, Text, Image, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import './index.scss'

type CaseStatus = 'draft' | 'analyzing' | 'completed' | 'archived'
type CaseFilter = 'all' | 'analyzing' | 'completed'

interface Case {
  id: string
  title: string
  date: string
  status: CaseStatus
  responsibility?: string
  compensation?: string
  evidenceCount: number
  lastUpdate: string
  createdAt: string
}

const mockCases: Case[] = [
  {
    id: '1',
    title: '市南区香港路追尾事故',
    date: '2024-09-15',
    status: 'completed',
    responsibility: '对方全责',
    compensation: '¥12,500',
    evidenceCount: 5,
    lastUpdate: '2小时前',
    createdAt: '2024-09-15 14:30'
  },
  {
    id: '2',
    title: '崂山区海尔路路口碰撞',
    date: '2024-09-10',
    status: 'analyzing',
    responsibility: '分析中...',
    compensation: '待计算',
    evidenceCount: 3,
    lastUpdate: '1天前',
    createdAt: '2024-09-10 09:15'
  },
  {
    id: '3',
    title: '李沧区京口路刮擦事故',
    date: '2024-09-05',
    status: 'completed',
    responsibility: '同等责任',
    compensation: '¥8,200',
    evidenceCount: 4,
    lastUpdate: '5天前',
    createdAt: '2024-09-05 16:45'
  },
  {
    id: '4',
    title: '市北区辽宁路停车场事故',
    date: '2024-09-01',
    status: 'draft',
    evidenceCount: 1,
    lastUpdate: '10天前',
    createdAt: '2024-09-01 11:20'
  }
]

export default function Case() {
  const [cases, setCases] = useState<Case[]>(mockCases)
  const [filter, setFilter] = useState<CaseFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const handleCaseClick = (caseId: string) => {
    Taro.showToast({ title: '案例详情开发中', icon: 'none' })
  }

  const handleNewCase = () => {
    Taro.switchTab({ url: '/pages/agent/index' })
  }

  const getFilteredCases = () => {
    let filtered = cases

    if (filter !== 'all') {
      filtered = filtered.filter(c => c.status === filter)
    }

    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    return filtered
  }

  const filteredCases = getFilteredCases()

  const getStatusConfig = (status: CaseStatus) => {
    const configs = {
      draft: { label: '草稿', color: 'draft' },
      analyzing: { label: '分析中', color: 'analyzing' },
      completed: { label: '已完成', color: 'completed' },
      archived: { label: '已归档', color: 'archived' }
    }
    return configs[status]
  }

  const getCaseStats = () => {
    return {
      all: cases.length,
      analyzing: cases.filter(c => c.status === 'analyzing').length,
      completed: cases.filter(c => c.status === 'completed').length
    }
  }

  const stats = getCaseStats()

  return (
    <View className="case-page">
      {/* 页头 */}
      <View className="page-header">
        <View className="header-top">
          <Text className="page-title">案件库</Text>
          <View className="new-case-btn" onClick={handleNewCase}>
            <Text className="btn-icon">+</Text>
            <Text className="btn-text">新建</Text>
          </View>
        </View>

        {/* 搜索栏 */}
        <View className="search-bar">
          <Text className="search-icon">🔍</Text>
          <Input
            className="search-input"
            placeholder="搜索案件..."
            placeholderClass="search-placeholder"
            value={searchQuery}
            onInput={(e) => setSearchQuery(e.detail.value)}
          />
          {searchQuery && (
            <View className="clear-btn" onClick={() => setSearchQuery('')}>
              <Text className="clear-icon">×</Text>
            </View>
          )}
        </View>

        {/* 统计卡片 */}
        <View className="stats-row">
          <View className="stat-card">
            <Text className="stat-value">{stats.all}</Text>
            <Text className="stat-label">全部案件</Text>
          </View>
          <View className="stat-card">
            <Text className="stat-value highlight">{stats.analyzing}</Text>
            <Text className="stat-label">进行中</Text>
          </View>
          <View className="stat-card">
            <Text className="stat-value success">{stats.completed}</Text>
            <Text className="stat-label">已完成</Text>
          </View>
        </View>

        {/* 筛选标签 */}
        <View className="filter-tabs">
          <View
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <Text className="tab-text">全部</Text>
            {filter === 'all' && <View className="tab-indicator" />}
          </View>
          <View
            className={`filter-tab ${filter === 'analyzing' ? 'active' : ''}`}
            onClick={() => setFilter('analyzing')}
          >
            <Text className="tab-text">分析中</Text>
            {filter === 'analyzing' && <View className="tab-indicator" />}
          </View>
          <View
            className={`filter-tab ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            <Text className="tab-text">已完成</Text>
            {filter === 'completed' && <View className="tab-indicator" />}
          </View>
        </View>
      </View>

      {/* 案件列表 */}
      {filteredCases.length === 0 ? (
        <View className="empty-state">
          <Text className="empty-icon">
            {searchQuery ? '🔍' : '📋'}
          </Text>
          <Text className="empty-title">
            {searchQuery ? '未找到匹配案件' : '还没有案件'}
          </Text>
          <Text className="empty-subtitle">
            {searchQuery ? '试试其他关键词' : '点击右上角创建第一个案件'}
          </Text>
        </View>
      ) : (
        <View className="cases-list">
          {filteredCases.map(item => {
            const statusConfig = getStatusConfig(item.status)
            return (
              <View
                key={item.id}
                className="case-card"
                onClick={() => handleCaseClick(item.id)}
              >
                <View className="case-header">
                  <View className="case-main">
                    <Text className="case-title">{item.title}</Text>
                    <View className="case-meta">
                      <Text className="meta-text">{item.createdAt}</Text>
                      <Text className="meta-divider">·</Text>
                      <Text className="meta-text">{item.evidenceCount} 个材料</Text>
                    </View>
                  </View>
                  <View className={`status-badge ${statusConfig.color}`}>
                    <View className="status-dot" />
                    <Text className="status-text">{statusConfig.label}</Text>
                  </View>
                </View>

                {item.status !== 'draft' && (
                  <View>
                    <View className="case-divider" />
                    <View className="case-details">
                      <View className="detail-row">
                        <View className="detail-item">
                          <Text className="detail-label">责任判定</Text>
                          <Text className="detail-value">
                            {item.responsibility || '-'}
                          </Text>
                        </View>
                        <View className="detail-item">
                          <Text className="detail-label">预估赔偿</Text>
                          <Text className={`detail-value ${item.status === 'completed' ? 'highlight' : ''}`}>
                            {item.compensation || '-'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                <View className="case-footer">
                  <Text className="update-time">更新于 {item.lastUpdate}</Text>
                  <Text className="view-detail">查看详情 →</Text>
                </View>
              </View>
            )
          })}
        </View>
      )}

      {/* 页脚提示 */}
      <View className="footer-section">
        <View className="footer-tip">
          <Text className="tip-icon">🔒</Text>
          <Text className="tip-text">数据安全存储，仅本人可见</Text>
        </View>
      </View>
    </View>
  )
}
