import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import { useState, useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { useAgentStore } from '../../store/agent'
import { sendMessage, createConversation } from '../../utils/agent'
import { chooseImage, uploadToOSS } from '../../utils/upload'
import './index.scss'

type CaseStage = 'init' | 'collecting' | 'analyzing' | 'reviewing' | 'completed'

interface Evidence {
  id: string
  type: 'police-report' | 'medical' | 'damage' | 'scene' | 'other'
  name: string
  url: string
  status: 'uploaded' | 'analyzing' | 'extracted'
  extractedData?: string
}

export default function Agent() {
  const { conversationId, messages, isLoading, setConversationId, addMessage, setLoading } = useAgentStore()
  const [inputText, setInputText] = useState('')
  const [uploadingImages, setUploadingImages] = useState<string[]>([])
  const [caseStage, setCaseStage] = useState<CaseStage>('init')
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([])
  const [aiPlan, setAiPlan] = useState<string[]>([])
  const [showPlanPreview, setShowPlanPreview] = useState(false)
  const scrollViewRef = useRef(null)

  useEffect(() => {
    if (!conversationId) {
      initConversation()
    }
  }, [])

  const initConversation = async () => {
    try {
      const id = await createConversation()
      setConversationId(id)
      setCaseStage('init')
    } catch (err) {
      Taro.showToast({ title: '初始化失败', icon: 'none' })
    }
  }

  const handleStartCase = (type: string) => {
    setCaseStage('collecting')
    setAiPlan([
      '收集事故相关材料',
      '识别并提取关键信息',
      '分析责任认定依据',
      '计算赔偿金额明细',
      '生成案件分析报告'
    ])
    setShowPlanPreview(true)

    addMessage({
      id: Date.now().toString(),
      role: 'assistant',
      content: `好的，我将协助处理${type}类材料。请上传相关文件或描述事故经过。`,
      timestamp: Date.now()
    })
  }

  const handleSend = async () => {
    if (!inputText.trim() && uploadingImages.length === 0) return
    if (!conversationId) return

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: inputText,
      images: uploadingImages,
      timestamp: Date.now()
    }

    addMessage(userMessage)
    setInputText('')

    // 添加上传的图片到证据列表
    if (uploadingImages.length > 0) {
      const newEvidence: Evidence[] = uploadingImages.map((url, index) => ({
        id: `${Date.now()}-${index}`,
        type: 'scene',
        name: `现场照片 ${evidenceList.length + index + 1}`,
        url,
        status: 'uploaded'
      }))
      setEvidenceList(prev => [...prev, ...newEvidence])
    }

    setUploadingImages([])
    setLoading(true)

    try {
      const response = await sendMessage(conversationId, inputText, uploadingImages)

      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message,
        timestamp: Date.now()
      })

      // 模拟阶段切换
      if (evidenceList.length >= 2 && caseStage === 'collecting') {
        setCaseStage('analyzing')
      }
    } catch (err) {
      Taro.showToast({ title: '发送失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleChooseImage = async () => {
    try {
      const images = await chooseImage()
      Taro.showLoading({ title: '上传中...' })
      const uploadPromises = images.map(img => uploadToOSS(img, 'image'))
      const urls = await Promise.all(uploadPromises)
      setUploadingImages(prev => [...prev, ...urls])
      Taro.hideLoading()
    } catch (err) {
      Taro.hideLoading()
      Taro.showToast({ title: '上传失败', icon: 'none' })
    }
  }

  const handleApproveAnalysis = () => {
    setCaseStage('completed')
    Taro.showToast({ title: '分析已确认，正在生成报告', icon: 'success' })
  }

  const getStageLabel = () => {
    const labels = {
      init: '初始化',
      collecting: '收集材料',
      analyzing: '分析中',
      reviewing: '待确认',
      completed: '已完成'
    }
    return labels[caseStage]
  }

  const getStageColor = () => {
    if (caseStage === 'init') return 'status-init'
    if (caseStage === 'collecting') return 'status-collecting'
    if (caseStage === 'analyzing') return 'status-analyzing'
    if (caseStage === 'reviewing') return 'status-reviewing'
    return 'status-completed'
  }

  return (
    <View className="agent-page">
      {/* 案件状态栏 */}
      <View className="case-status-bar">
        <View className="status-left">
          <Text className="case-title">案件工作台</Text>
          <View className={`status-badge ${getStageColor()}`}>
            <View className="status-dot" />
            <Text className="status-text">{getStageLabel()}</Text>
          </View>
        </View>
        {caseStage !== 'init' && (
          <View className="progress-indicator">
            <Text className="progress-text">{evidenceList.length} 个材料</Text>
          </View>
        )}
      </View>

      <ScrollView
        className="workspace-container"
        scrollY
        scrollWithAnimation
        scrollIntoView={`msg-${messages.length - 1}`}
      >
        {/* 初始状态 - 选择案件类型 */}
        {caseStage === 'init' && (
          <View className="init-section">
            <View className="welcome-header">
              <Text className="welcome-title">开始新案件</Text>
              <Text className="welcome-subtitle">选择材料类型，AI 将协助整理和分析</Text>
            </View>

            <View className="case-type-grid">
              <View className="type-card primary" onClick={() => handleStartCase('交警认定书')}>
                <View className="card-icon-wrapper">
                  <Text className="card-icon">📋</Text>
                </View>
                <Text className="card-title">交警认定书</Text>
                <Text className="card-desc">责任已认定</Text>
                <View className="card-badge">推荐</View>
              </View>

              <View className="type-card" onClick={() => handleStartCase('医疗材料')}>
                <View className="card-icon-wrapper">
                  <Text className="card-icon">🏥</Text>
                </View>
                <Text className="card-title">医疗材料</Text>
                <Text className="card-desc">人伤案件</Text>
              </View>

              <View className="type-card" onClick={() => handleStartCase('车损材料')}>
                <View className="card-icon-wrapper">
                  <Text className="card-icon">🚗</Text>
                </View>
                <Text className="card-title">车损材料</Text>
                <Text className="card-desc">财产损失</Text>
              </View>

              <View className="type-card subtle" onClick={() => handleStartCase('口述')}>
                <View className="card-icon-wrapper">
                  <Text className="card-icon">💬</Text>
                </View>
                <Text className="card-title">口述经过</Text>
                <Text className="card-desc">无书面材料</Text>
              </View>
            </View>

            <View className="info-cards">
              <View className="info-card">
                <Text className="info-icon">⚖️</Text>
                <View className="info-content">
                  <Text className="info-title">AI 分析责任</Text>
                  <Text className="info-text">基于交通法规和判例库</Text>
                </View>
              </View>
              <View className="info-card">
                <Text className="info-icon">🔍</Text>
                <View className="info-content">
                  <Text className="info-title">证据可追溯</Text>
                  <Text className="info-text">每条结论均可查看依据</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 工作区 - 材料收集和分析 */}
        {caseStage !== 'init' && (
          <View className="workspace-content">
            {/* AI 执行计划预览 */}
            {showPlanPreview && aiPlan.length > 0 && (
              <View className="plan-preview-card">
                <View className="plan-header">
                  <Text className="plan-icon">🤖</Text>
                  <Text className="plan-title">AI 执行计划</Text>
                  <View
                    className="plan-dismiss"
                    onClick={() => setShowPlanPreview(false)}
                  >
                    <Text className="dismiss-icon">×</Text>
                  </View>
                </View>
                <View className="plan-steps">
                  {aiPlan.map((step, index) => (
                    <View key={index} className="plan-step">
                      <View className={`step-indicator ${index === 0 ? 'active' : ''}`}>
                        <Text className="step-number">{index + 1}</Text>
                      </View>
                      <Text className="step-text">{step}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 证据材料区 */}
            {evidenceList.length > 0 && (
              <View className="evidence-section">
                <View className="section-header">
                  <Text className="section-icon">📎</Text>
                  <Text className="section-title">材料库</Text>
                  <Text className="section-count">{evidenceList.length}</Text>
                </View>
                <View className="evidence-grid">
                  {evidenceList.map(evidence => (
                    <View key={evidence.id} className="evidence-item">
                      <Image
                        src={evidence.url}
                        className="evidence-thumbnail"
                        mode="aspectFill"
                      />
                      <View className="evidence-info">
                        <Text className="evidence-name">{evidence.name}</Text>
                        <View className={`evidence-status ${evidence.status}`}>
                          <Text className="status-dot">●</Text>
                          <Text className="status-label">
                            {evidence.status === 'uploaded' && '已上传'}
                            {evidence.status === 'analyzing' && '识别中'}
                            {evidence.status === 'extracted' && '已提取'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 对话记录 */}
            {messages.length > 0 && (
              <View className="conversation-section">
                <View className="section-header">
                  <Text className="section-icon">💬</Text>
                  <Text className="section-title">分析记录</Text>
                </View>
                <View className="messages-list">
                  {messages.map((msg, index) => (
                    <View key={msg.id} id={`msg-${index}`} className={`message ${msg.role}`}>
                      <View className="message-bubble">
                        {msg.images && msg.images.length > 0 && (
                          <View className="message-images">
                            {msg.images.map((img, i) => (
                              <Image key={i} src={img} className="message-image" mode="aspectFill" />
                            ))}
                          </View>
                        )}
                        <Text className="message-text">{msg.content}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 分析结果待确认 */}
            {caseStage === 'reviewing' && (
              <View className="review-section">
                <View className="review-card">
                  <Text className="review-title">责任分析完成</Text>
                  <Text className="review-subtitle">请确认以下分析结果</Text>
                  <View className="review-result">
                    <View className="result-item">
                      <Text className="result-label">责任判定</Text>
                      <Text className="result-value">对方全责</Text>
                    </View>
                    <View className="result-item">
                      <Text className="result-label">预估赔偿</Text>
                      <Text className="result-value highlight">¥12,500</Text>
                    </View>
                  </View>
                  <View className="review-actions">
                    <View className="action-btn secondary">
                      <Text className="btn-text">查看详情</Text>
                    </View>
                    <View className="action-btn primary" onClick={handleApproveAnalysis}>
                      <Text className="btn-text">确认并生成报告</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {isLoading && (
              <View className="message assistant">
                <View className="message-bubble loading">
                  <Text className="loading-dot">●</Text>
                  <Text className="loading-dot">●</Text>
                  <Text className="loading-dot">●</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* 输入栏 */}
      {caseStage !== 'init' && caseStage !== 'completed' && (
        <View className="input-bar">
          <View className="attach-button" onClick={handleChooseImage}>
            <Text className="icon">+</Text>
          </View>
          <View className="input-wrapper">
            <Input
              className="text-input"
              placeholder="补充信息或提问..."
              placeholderClass="placeholder"
              value={inputText}
              onInput={(e) => setInputText(e.detail.value)}
              onConfirm={handleSend}
            />
          </View>
          <View className="send-button" onClick={handleSend}>
            <Text className="icon">➤</Text>
          </View>
        </View>
      )}

      {/* 图片预览 */}
      {uploadingImages.length > 0 && (
        <View className="preview-images">
          {uploadingImages.map((img, i) => (
            <View key={i} className="preview-item">
              <Image src={img} className="preview-image" mode="aspectFill" />
              <View
                className="remove-button"
                onClick={() => setUploadingImages(prev => prev.filter((_, idx) => idx !== i))}
              >
                <Text>×</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
