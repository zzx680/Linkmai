import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

// Mock 律师数据
const mockLawyers = [
  {
    id: '1',
    name: '张律师',
    title: '交通事故专家律师',
    avatar: '👨‍⚖️',
    experience: '15年',
    cases: '500+',
    rating: '4.9',
    specialties: ['人伤赔偿', '责任争议', '诉讼代理'],
    status: 'online',
    price: '¥300/次'
  },
  {
    id: '2',
    name: '李律师',
    avatar: '👩‍⚖️',
    title: '高级合伙人',
    experience: '12年',
    cases: '380+',
    rating: '4.8',
    specialties: ['保险理赔', '伤残鉴定', '调解谈判'],
    status: 'online',
    price: '¥400/次'
  },
  {
    id: '3',
    name: '王律师',
    avatar: '👨‍💼',
    title: '资深律师',
    experience: '8年',
    cases: '200+',
    rating: '4.7',
    specialties: ['快速理赔', '证据收集', '法律咨询'],
    status: 'offline',
    price: '¥200/次'
  }
]

export default function Consultation() {
  const handleLawyerClick = (lawyerId: string) => {
    Taro.showToast({ title: '咨询功能开发中', icon: 'none' })
  }

  return (
    <View className="consultation-page">
      <View className="header">
        <Text className="title">律师咨询</Text>
        <Text className="subtitle">专业交通事故律师为您服务</Text>
      </View>

      <View className="info-banner">
        <View className="banner-content">
          <Text className="banner-icon">⚖️</Text>
          <View className="banner-text">
            <Text className="banner-title">需要律师协助？</Text>
            <Text className="banner-desc">复杂案件可转接合作律所专业处理</Text>
          </View>
        </View>
      </View>

      <View className="section-title">
        <Text className="section-text">在线律师</Text>
        <View className="online-indicator">
          <View className="online-dot" />
          <Text className="online-text">3位在线</Text>
        </View>
      </View>

      <View className="lawyers-list">
        {mockLawyers.map(lawyer => (
          <View
            key={lawyer.id}
            className="lawyer-card"
            onClick={() => handleLawyerClick(lawyer.id)}
          >
            <View className="lawyer-header">
              <View className="avatar-wrapper">
                <Text className="avatar">{lawyer.avatar}</Text>
                {lawyer.status === 'online' && <View className="status-dot" />}
              </View>
              <View className="lawyer-info">
                <View className="name-row">
                  <Text className="lawyer-name">{lawyer.name}</Text>
                  <View className="rating">
                    <Text className="star">⭐</Text>
                    <Text className="rating-text">{lawyer.rating}</Text>
                  </View>
                </View>
                <Text className="lawyer-title">{lawyer.title}</Text>
                <View className="stats">
                  <Text className="stat-item">从业 {lawyer.experience}</Text>
                  <Text className="stat-divider">·</Text>
                  <Text className="stat-item">{lawyer.cases} 案例</Text>
                </View>
              </View>
            </View>

            <View className="specialties">
              {lawyer.specialties.map((tag, index) => (
                <View key={index} className="specialty-tag">
                  <Text className="tag-text">{tag}</Text>
                </View>
              ))}
            </View>

            <View className="lawyer-footer">
              <Text className="price">{lawyer.price}</Text>
              <View className="consult-btn">
                <Text className="btn-text">
                  {lawyer.status === 'online' ? '立即咨询' : '预约咨询'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View className="service-cards">
        <Text className="cards-title">常见咨询场景</Text>
        <View className="cards-grid">
          <View className="service-card">
            <Text className="card-icon">📋</Text>
            <Text className="card-title">责任争议</Text>
            <Text className="card-desc">认定结果有异议</Text>
          </View>
          <View className="service-card">
            <Text className="card-icon">💰</Text>
            <Text className="card-title">赔偿谈判</Text>
            <Text className="card-desc">协商不成需起诉</Text>
          </View>
          <View className="service-card">
            <Text className="card-icon">🏥</Text>
            <Text className="card-title">伤残鉴定</Text>
            <Text className="card-desc">需要专业评估</Text>
          </View>
          <View className="service-card">
            <Text className="card-icon">⚡</Text>
            <Text className="card-title">紧急情况</Text>
            <Text className="card-desc">时效临近或证据灭失</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
