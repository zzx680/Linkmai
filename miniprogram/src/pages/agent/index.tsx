import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import { useState, useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { useAppStore } from '../../store'
import { chooseImage } from '../../utils/upload'
import { IS_H5 } from '../../config/env'
import './index.scss'

const stageLabels: Record<string, string> = {
  collecting: '收集信息',
  confirming: '待确认',
  analyzing: '分析中',
  ready: '可以生成报告'
}

const stageColors: Record<string, string> = {
  collecting: 'status-collecting',
  confirming: 'status-reviewing',
  analyzing: 'status-analyzing',
  ready: 'status-completed'
}

export default function Agent() {
  const {
    currentCase,
    messages,
    materials,
    conversationState,
    isAiTyping,
    sendMessage,
    uploadImage,
    loadMessages
  } = useAppStore()
  const [inputText, setInputText] = useState('')
  const [uploadingImages, setUploadingImages] = useState<string[]>([])
  const scrollViewRef = useRef(null)

  useEffect(() => {
    if (!IS_H5) loadMessages().catch(() => undefined)
  }, [loadMessages])

  const stage = currentCase ? conversationState : 'collecting'
  const stageLabel = stageLabels[stage] || '收集信息'
  const stageColor = stageColors[stage] || 'status-collecting'

  const handleSend = async () => {
    if (!inputText.trim() && uploadingImages.length === 0) return

    const text = inputText.trim()
    const images = uploadingImages
    setInputText('')
    setUploadingImages([])

    try {
      await sendMessage(text, images)
    } catch (error: any) {
      setInputText(text)
      setUploadingImages(images)
      Taro.showToast({ title: error.message || '发送失败', icon: 'none' })
    }
  }

  const handleChooseImage = async () => {
    try {
      const files = await chooseImage()
      Taro.showLoading({ title: '上传中...' })
      const uploads = await Promise.all(files.map(file => uploadImage(file)))
      setUploadingImages(prev => [...prev, ...uploads.map(upload => upload.url)])
    } catch (error: any) {
      Taro.showToast({ title: error.message || '上传失败', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  return (
    <View className="agent-page">
      <View className="case-status-bar">
        <View className="status-left">
          <Text className="case-title">案件工作台</Text>
          <View className={`status-badge ${stageColor}`}>
            <View className="status-dot" />
            <Text className="status-text">{stageLabel}</Text>
          </View>
        </View>
        <View className="progress-indicator">
          <Text className="progress-text">{materials.length} 个材料</Text>
        </View>
      </View>

      <ScrollView
        className="workspace-container"
        scrollY
        scrollWithAnimation
        scrollIntoView={`msg-${messages.length - 1}`}
      >
        {!currentCase && (
          <View className="init-section">
            <View className="welcome-header">
              <Text className="welcome-title">先创建一个案件</Text>
              <Text className="welcome-subtitle">回到首页创建案件后，这里会成为你的处理工作台</Text>
            </View>
          </View>
        )}

        {currentCase && (
          <View className="workspace-content">
            <View className="plan-preview-card">
              <View className="plan-header">
                <Text className="plan-title">当前处理进度</Text>
              </View>
              <View className="plan-steps">
                <View className={`plan-step ${materials.length ? 'complete' : 'active'}`}>
                  <View className={`step-indicator ${materials.length ? 'complete' : 'active'}`}>
                    <Text className="step-number">1</Text>
                  </View>
                  <Text className="step-text">描述事故经过并补充材料</Text>
                </View>
                <View className={`plan-step ${conversationState === 'confirming' ? 'active' : ''}`}>
                  <View className={`step-indicator ${conversationState === 'confirming' ? 'active' : ''}`}>
                    <Text className="step-number">2</Text>
                  </View>
                  <Text className="step-text">核对识别出的关键信息</Text>
                </View>
                <View className={`plan-step ${conversationState === 'ready' ? 'active' : ''}`}>
                  <View className={`step-indicator ${conversationState === 'ready' ? 'active' : ''}`}>
                    <Text className="step-number">3</Text>
                  </View>
                  <Text className="step-text">生成案件报告</Text>
                </View>
              </View>
            </View>

            {materials.length > 0 && (
              <View className="evidence-section">
                <View className="section-header">
                  <Text className="section-title">已上传材料</Text>
                  <Text className="section-count">{materials.length}</Text>
                </View>
                <View className="evidence-grid">
                  {materials.map(material => (
                    <View key={material.id} className="evidence-item">
                      <Image src={material.imageUrl} className="evidence-thumbnail" mode="aspectFill" />
                      <View className="evidence-info">
                        <Text className="evidence-name">{material.type}</Text>
                        <View className={`evidence-status ${material.status}`}>
                          <Text className="status-label">
                            {material.confirmed ? '已确认' : material.status === 'processing' ? '识别中' : material.status === 'failed' ? '处理失败' : '待核对'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {messages.length > 0 && (
              <View className="conversation-section">
                <View className="section-header">
                  <Text className="section-title">处理记录</Text>
                </View>
                <View className="messages-list">
                  {messages.map((msg, index) => (
                    <View key={msg.id} id={`msg-${index}`} className={`message ${msg.role}`}>
                      <View className="message-bubble">
                        {msg.images && msg.images.length > 0 && (
                          <View className="message-images">
                            {msg.images.map((img, imageIndex) => (
                              <Image key={imageIndex} src={img} className="message-image" mode="aspectFill" />
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

            {isAiTyping && (
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

      {currentCase && (
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
              onInput={event => setInputText(event.detail.value)}
              onConfirm={handleSend}
            />
          </View>
          <View className="send-button" onClick={handleSend}>
            <Text className="icon">➤</Text>
          </View>
        </View>
      )}

      {uploadingImages.length > 0 && (
        <View className="preview-images">
          {uploadingImages.map((image, index) => (
            <View key={index} className="preview-item">
              <Image src={image} className="preview-image" mode="aspectFill" />
              <View className="remove-button" onClick={() => setUploadingImages(prev => prev.filter((_, itemIndex) => itemIndex !== index))}>
                <Text>×</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
