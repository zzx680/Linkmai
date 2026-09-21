import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { Card, Badge, Button } from '../../components'
import './index.scss'

interface CaseDetail {
  id: string
  title: string
  date: string
  status: 'completed' | 'analyzing'
  location: string
  weather: string
  responsibility: string
  compensation: string
  description: string
  materials: {
    policeReport: string[]
    medical: string[]
    vehicleDamage: string[]
    scene: string[]
  }
  analysis: {
    faultRatio: string
    legalBasis: string[]
    compensationBreakdown: {
      label: string
      amount: string
    }[]
  }
  timeline: {
    time: string
    event: string
    status: 'completed' | 'current' | 'pending'
  }[]
}

export default function CaseDetail() {
  const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'analysis'>('overview')

  // Mock 案例详情数据
  const caseDetail: CaseDetail = {
    id: '1',
    title: '市南区香港路追尾事故',
    date: '2024-09-15 14:30',
    status: 'completed',
    location: '青岛市市南区香港中路与南京路交叉口',
    weather: '晴天，路面干燥',
    responsibility: '对方全责',
    compensation: '¥12,500',
    description: '在香港中路与南京路交叉口等红绿灯时，被后方车辆追尾，导致车辆后保险杠损坏，驾驶员轻微颈部扭伤。',
    materials: {
      policeReport: ['https://via.placeholder.com/300x400/C4612F/FFFFFF?text=Police+Report'],
      medical: ['https://via.placeholder.com/300x400/34c759/FFFFFF?text=Medical+1', 'https://via.placeholder.com/300x400/34c759/FFFFFF?text=Medical+2'],
      vehicleDamage: ['https://via.placeholder.com/300x400/ff9500/FFFFFF?text=Damage+1', 'https://via.placeholder.com/300x400/ff9500/FFFFFF?text=Damage+2'],
      scene: ['https://via.placeholder.com/300x400/007AFF/FFFFFF?text=Scene+1', 'https://via.placeholder.com/300x400/007AFF/FFFFFF?text=Scene+2']
    },
    analysis: {
      faultRatio: '对方100%责任',
      legalBasis: [
        '《道路交通安全法》第43条：同车道行驶的机动车，后车应当与前车保持足以采取紧急制动措施的安全距离',
        '《道路交通事故处理程序规定》第60条：追尾事故，后车承担全部责任'
      ],
      compensationBreakdown: [
        { label: '车辆维修费', amount: '¥8,500' },
        { label: '医疗费用', amount: '¥2,800' },
        { label: '误工费（3天）', amount: '¥900' },
        { label: '交通费', amount: '¥300' }
      ]
    },
    timeline: [
      { time: '2024-09-15 14:30', event: '事故发生', status: 'completed' },
      { time: '2024-09-15 14:45', event: '报警并拍照取证', status: 'completed' },
      { time: '2024-09-15 15:20', event: '交警到场处理', status: 'completed' },
      { time: '2024-09-15 16:00', event: '医院检查', status: 'completed' },
      { time: '2024-09-16 10:00', event: '提交材料分析', status: 'completed' },
      { time: '2024-09-16 14:00', event: 'AI 分析完成', status: 'completed' },
      { time: '2024-09-17 09:00', event: '协商赔偿中', status: 'current' },
      { time: '待定', event: '赔偿款到账', status: 'pending' }
    ]
  }

  const handleImagePreview = (current: string, urls: string[]) => {
    Taro.previewImage({ current, urls })
  }

  const handleExportReport = () => {
    Taro.showToast({ title: '报告导出功能开发中', icon: 'none' })
  }

  const handleContactLawyer = () => {
    Taro.switchTab({ url: '/pages/consultation/index' })
  }

  return (
    <View className="case-detail-page">
      {/* Header */}
      <View className="detail-header">
        <View className="header-top">
          <Text className="case-title">{caseDetail.title}</Text>
          <Badge variant={caseDetail.status === 'completed' ? 'success' : 'warning'}>
            {caseDetail.status === 'completed' ? '已完成' : '分析中'}
          </Badge>
        </View>
        <Text className="case-date">{caseDetail.date}</Text>
      </View>

      {/* Tabs */}
      <View className="tabs">
        <View
          className={`tab-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Text className="tab-text">概览</Text>
        </View>
        <View
          className={`tab-item ${activeTab === 'materials' ? 'active' : ''}`}
          onClick={() => setActiveTab('materials')}
        >
          <Text className="tab-text">材料</Text>
        </View>
        <View
          className={`tab-item ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          <Text className="tab-text">分析</Text>
        </View>
      </View>

      <ScrollView className="detail-content" scrollY>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View className="overview-tab">
            <Card className="info-card">
              <Text className="card-title">基本信息</Text>
              <View className="info-row">
                <Text className="info-label">事故地点</Text>
                <Text className="info-value">{caseDetail.location}</Text>
              </View>
              <View className="info-row">
                <Text className="info-label">天气路况</Text>
                <Text className="info-value">{caseDetail.weather}</Text>
              </View>
              <View className="info-row">
                <Text className="info-label">事故描述</Text>
                <Text className="info-value description">{caseDetail.description}</Text>
              </View>
            </Card>

            <Card className="result-card highlight">
              <Text className="card-title">责任与赔偿</Text>
              <View className="result-row">
                <View className="result-item">
                  <Text className="result-label">责任判定</Text>
                  <Text className="result-value primary">{caseDetail.responsibility}</Text>
                </View>
                <View className="result-divider" />
                <View className="result-item">
                  <Text className="result-label">预估赔偿</Text>
                  <Text className="result-value accent">{caseDetail.compensation}</Text>
                </View>
              </View>
            </Card>

            <Card className="timeline-card">
              <Text className="card-title">处理进度</Text>
              <View className="timeline">
                {caseDetail.timeline.map((item, index) => (
                  <View key={index} className="timeline-item">
                    <View className={`timeline-dot ${item.status}`} />
                    {index < caseDetail.timeline.length - 1 && (
                      <View className="timeline-line" />
                    )}
                    <View className="timeline-content">
                      <Text className="timeline-time">{item.time}</Text>
                      <Text className="timeline-event">{item.event}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && (
          <View className="materials-tab">
            <Card className="material-section">
              <Text className="section-title">📋 交警认定书</Text>
              <View className="material-grid">
                {caseDetail.materials.policeReport.map((url, i) => (
                  <Image
                    key={i}
                    src={url}
                    className="material-image"
                    mode="aspectFill"
                    onClick={() => handleImagePreview(url, caseDetail.materials.policeReport)}
                  />
                ))}
              </View>
            </Card>

            <Card className="material-section">
              <Text className="section-title">🏥 医疗材料</Text>
              <View className="material-grid">
                {caseDetail.materials.medical.map((url, i) => (
                  <Image
                    key={i}
                    src={url}
                    className="material-image"
                    mode="aspectFill"
                    onClick={() => handleImagePreview(url, caseDetail.materials.medical)}
                  />
                ))}
              </View>
            </Card>

            <Card className="material-section">
              <Text className="section-title">🚗 车损材料</Text>
              <View className="material-grid">
                {caseDetail.materials.vehicleDamage.map((url, i) => (
                  <Image
                    key={i}
                    src={url}
                    className="material-image"
                    mode="aspectFill"
                    onClick={() => handleImagePreview(url, caseDetail.materials.vehicleDamage)}
                  />
                ))}
              </View>
            </Card>

            <Card className="material-section">
              <Text className="section-title">📸 现场照片</Text>
              <View className="material-grid">
                {caseDetail.materials.scene.map((url, i) => (
                  <Image
                    key={i}
                    src={url}
                    className="material-image"
                    mode="aspectFill"
                    onClick={() => handleImagePreview(url, caseDetail.materials.scene)}
                  />
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* Analysis Tab */}
        {activeTab === 'analysis' && (
          <View className="analysis-tab">
            <Card className="analysis-card">
              <Text className="card-title">责任分析</Text>
              <View className="fault-ratio">
                <Text className="fault-text">{caseDetail.analysis.faultRatio}</Text>
              </View>
            </Card>

            <Card className="analysis-card">
              <Text className="card-title">法律依据</Text>
              {caseDetail.analysis.legalBasis.map((basis, i) => (
                <View key={i} className="legal-item">
                  <Text className="legal-text">{basis}</Text>
                </View>
              ))}
            </Card>

            <Card className="analysis-card">
              <Text className="card-title">赔偿明细</Text>
              {caseDetail.analysis.compensationBreakdown.map((item, i) => (
                <View key={i} className="compensation-row">
                  <Text className="compensation-label">{item.label}</Text>
                  <Text className="compensation-amount">{item.amount}</Text>
                </View>
              ))}
              <View className="compensation-divider" />
              <View className="compensation-row total">
                <Text className="compensation-label">合计</Text>
                <Text className="compensation-amount">{caseDetail.compensation}</Text>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>

      {/* Footer Actions */}
      <View className="detail-footer">
        <Button variant="secondary" size="medium" onClick={handleExportReport}>
          导出报告
        </Button>
        <Button variant="primary" size="medium" onClick={handleContactLawyer}>
          联系律师
        </Button>
      </View>
    </View>
  )
}
