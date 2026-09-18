import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

interface Lawyer {
  id: string
  name: string
  title: string
  avatar: string
  experience: string
  cases: string
  rating: string
  specialties: string[]
  status: 'online' | 'offline'
  price: string
  bio?: string
}

const mockLawyers: Lawyer[] = [
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
    price: '¥300',
    bio: '专注交通事故领域15年，擅长复杂人伤案件'
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
    price: '¥400',
    bio: '保险理赔专家，多家保险公司法律顾问'
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
    price: '¥200',
    bio: '高效务实，擅长快速理赔和证据分析'
  }
]

const consultationScenarios = [
  { icon: '📋', title: '责任争议', desc: '对认定结果有异议', color: 'blue' },
  { icon: '💰', title: '赔偿谈判', desc: '协商不成需起诉', color: 'orange' },
  { icon: '🏥', title: '伤残鉴定', desc: '需要专业评估', color: 'green' },
  { icon: '⚡', title: '紧急情况', desc: '时效临近或证据灭失', color: 'red' }
]

export default function Consultation() {
  const handleLawyerClick = (lawyerId: string) => {
    Taro.showToast({ title: '咨询功能开发中', icon: 'none' })
  }

  const handleScenarioClick = (scenario: string) => {
    Taro.showToast({ title: `${scenario}咨询开发中`, icon: 'none' })
  }

  const onlineCount = mockLawyers.filter(l => l.status === 'online').length

  return (
    <View className="consultation-page">
      {/* 页头 */}
      <View className="page-header">
        <Text className="page-title">律师咨询</Text>
        <Text className="page-subtitle">复杂案件可转接专业律师协助处理</Text>
      </View>

      {/* 信息横幅 */}
      <View className="info-banner">
        <View className="banner-icon-wrapper">
          <Text className="banner-icon">⚖️</Text>
        </View>
        <View className="banner-content">
          <Text className="banner-title">需要律师协助？</Text>
          <Text className="banner-desc">合作律所提供专业法律服务</Text>
        </View>
      </View>

      {/* 在线律师区块 */}
      <View className="section-header">
        <View className="header-left">
          <Text className="section-title">在线律师</Text>
          <View className="online-indicator">
            <View className="online-dot" />
            <Text className="online-text">{onlineCount}位在线</Text>
          </View>
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

            {lawyer.bio && (
              <View className="lawyer-bio">
                <Text className="bio-text">{lawyer.bio}</Text>
              </View>
            )}

            <View className="specialties">
              {lawyer.specialties.map((tag, index) => (
                <View key={index} className="specialty-tag">
                  <Text className="tag-text">{tag}</Text>
                </View>
              ))}
            </View>

            <View className="lawyer-footer">
              <View className="price-wrapper">
                <Text className="price-label">咨询费</Text>
                <Text className="price">{lawyer.price}</Text>
                <Text className="price-unit">/次</Text>
              </View>
              <View className={`consult-btn ${lawyer.status === 'online' ? 'online' : 'offline'}`}>
                <Text className="btn-text">
                  {lawyer.status === 'online' ? '立即咨询' : '预约咨询'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* 常见咨询场景 */}
      <View className="scenarios-section">
        <View className="section-header">
          <Text className="section-title">常见咨询场景</Text>
        </View>
        <View className="scenarios-grid">
          {consultationScenarios.map((scenario, index) => (
            <View
              key={index}
              className={`scenario-card ${scenario.color}`}
              onClick={() => handleScenarioClick(scenario.title)}
            >
              <Text className="scenario-icon">{scenario.icon}</Text>
              <Text className="scenario-title">{scenario.title}</Text>
              <Text className="scenario-desc">{scenario.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 服务说明 */}
      <View className="service-info">
        <View className="info-item">
          <Text className="info-icon">✓</Text>
          <Text className="info-text">7×24小时在线响应</Text>
        </View>
        <View className="info-item">
          <Text className="info-icon">✓</Text>
          <Text className="info-text">专业律师持证执业</Text>
        </View>
        <View className="info-item">
          <Text className="info-icon">✓</Text>
          <Text className="info-text">咨询内容严格保密</Text>
        </View>
      </View>
    </View>
  )
}
