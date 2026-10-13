import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { useAppStore } from '../../store'
import { Icon } from '../../components'
import { MaterialType, QuickReply } from '../../services/api'
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

const agentMaterialTypes: Array<{ type: MaterialType; label: string }> = [
  { type: 'accident_report', label: '交警认定书' },
  { type: 'medical_record', label: '医疗记录' },
  { type: 'scene_photo', label: '现场照片' },
  { type: 'other', label: '其他材料' }
]

function getMaterialLabel(type: string) {
  return agentMaterialTypes.find(item => item.type === type)?.label || '其他材料'
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
    processMaterial,
    loadMessages
  } = useAppStore()
  const [inputText, setInputText] = useState('')
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false)
  const [isContextExpanded, setIsContextExpanded] = useState(false)

  useEffect(() => {
    if (!IS_H5) loadMessages().catch(() => undefined)
  }, [loadMessages])

  const stage = currentCase ? conversationState : 'collecting'
  const stageLabel = stageLabels[stage] || '收集信息'
  const stageColor = stageColors[stage] || 'status-collecting'

  const handleSend = async (quickReply?: QuickReply) => {
    if (isAiTyping) return
    const text = quickReply?.value || inputText.trim()
    if (!text && !quickReply?.action) return

    setInputText('')
    try {
      await sendMessage(text, quickReply?.action)
    } catch (error: unknown) {
      if (!quickReply) setInputText(text)
      Taro.showToast({ title: (error as Error).message || '发送失败', icon: 'none' })
    }
  }

  const handleChooseImage = async () => {
    if (isUploadingMaterial) return
    try {
      const typeChoice = await Taro.showActionSheet({
        itemList: agentMaterialTypes.map(item => item.label)
      })
      const selectedType = agentMaterialTypes[typeChoice.tapIndex]?.type
      if (!selectedType) return
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      setIsUploadingMaterial(true)
      Taro.showLoading({ title: '上传并识别中' })
      const uploaded = await uploadImage(result.tempFilePaths[0])
      await processMaterial(selectedType, uploaded.artifactId)
      Taro.showToast({ title: '识别完成，请核对', icon: 'success' })
      Taro.navigateTo({ url: `/pages/materials/index?caseId=${currentCase?.id || ''}` })
    } catch (error: unknown) {
      const failure = error as { errMsg?: string; message?: string }
      if (!failure.errMsg?.includes('cancel')) {
        await Taro.showModal({
          title: '材料处理失败',
          content: `${failure.message || '上传或识别未完成'}。可再次重试，或前往材料页继续处理。`,
          confirmText: '材料页',
          cancelText: '稍后重试',
          success: result => {
            if (result.confirm) Taro.navigateTo({ url: '/pages/materials/index' })
          }
        })
      }
    } finally {
      setIsUploadingMaterial(false)
      Taro.hideLoading()
    }
  }

  return (
    <View className="agent-page">
      <View className="case-status-bar" onClick={() => currentCase && setIsContextExpanded(value => !value)}>
        <View className="status-copy">
          <Text className="case-title">案件工作台</Text>
          <View className="status-meta">
            <View className={`status-badge ${stageColor}`}>
              <View className="status-dot" />
              <Text className="status-text">{stageLabel}</Text>
            </View>
            <Text className="material-summary">已整理 {materials.length} 份材料</Text>
          </View>
        </View>
        {currentCase && <Icon name="arrow-right-s-line" className={`context-toggle ${isContextExpanded ? 'expanded' : ''}`} size={22} color="#6B7280" />}
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
            {isContextExpanded && (
              <View className="case-context-panel">
                <View className="context-progress">
                  <View className={`context-step ${materials.length ? 'complete' : 'active'}`}><Text>1</Text><Text>补充材料</Text></View>
                  <View className={`context-step ${conversationState === 'confirming' ? 'active' : ''}`}><Text>2</Text><Text>核对信息</Text></View>
                  <View className={`context-step ${conversationState === 'ready' ? 'active' : ''}`}><Text>3</Text><Text>生成报告</Text></View>
                </View>
                <View className="context-actions">
                  <View className="quick-reply" onClick={() => Taro.navigateTo({ url: '/pages/materials/index' })}><Text>查看并核对材料</Text></View>
                  {conversationState === 'ready' && <View className="quick-reply" onClick={() => Taro.navigateTo({ url: '/pages/report/index' })}><Text>查看案件报告</Text></View>}
                </View>
                {materials.length > 0 && (
                  <ScrollView className="context-materials" scrollX>
                    <View className="context-material-list">
                      {materials.map(material => (
                        <View key={material.id} className="context-material">
                          <Image src={material.imageUrl} className="context-material-thumb" mode="aspectFill" />
                          <View className="context-material-copy">
                            <Text className="context-material-name">{getMaterialLabel(material.type)}</Text>
                            <Text className={`context-material-status ${material.confirmed ? 'confirmed' : ''}`}>
                              {material.confirmed ? '已确认' : material.status === 'processing' ? '识别中' : material.status === 'failed' ? '处理失败' : '待核对'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            )}

            {messages.length === 0 && !isAiTyping && (
              <View className="conversation-empty">
                <View className="assistant-mark"><Text>灵</Text></View>
                <Text className="empty-title">把情况告诉我</Text>
                <Text className="empty-description">可以直接描述事故经过，也可以先上传认定书、现场照片或医疗材料。</Text>
                <View className="starter-actions">
                  <View className="starter-action primary" onClick={() => setInputText('我想描述一下事故经过')}><Text>描述事故经过</Text></View>
                  <View className="starter-action" onClick={handleChooseImage}><Text>上传事故材料</Text></View>
                </View>
                <View className="starter-checklist">
                  <Text className="checklist-label">建议先准备</Text>
                  <Text className="checklist-text">事故时间地点 · 双方责任信息 · 认定书或现场照片</Text>
                </View>
              </View>
            )}

            {messages.length > 0 && (
              <View className="conversation-section">
                <View className="messages-list">
                  {messages.map((msg, index) => (
                    <View key={msg.id} id={`msg-${index}`} className={`message ${msg.role}`}>
                      {msg.role === 'assistant' && <View className="message-avatar"><Text>灵</Text></View>}
                      <View className="message-body">
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
                        {msg.quickReplies && msg.quickReplies.length > 0 && (
                          <View className="quick-replies">
                            {msg.quickReplies.map(reply => (
                              <View
                                key={`${reply.action || 'message'}-${reply.value}`}
                                className="quick-reply"
                                onClick={() => handleSend(reply)}
                              >
                                <Text>{reply.label || reply.text || reply.value}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {isAiTyping && (
              <View className="message assistant typing-message">
                <View className="message-avatar"><Text>灵</Text></View>
                <View className="message-body">
                  <View className="message-bubble loading">
                    <Text className="loading-dot" />
                    <Text className="loading-dot" />
                    <Text className="loading-dot" />
                  </View>
                  <Text className="typing-label">正在整理案件信息</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {currentCase && (
        <View className="input-bar">
          <View className="composer-shell">
            <View className={`attach-button ${isUploadingMaterial ? 'disabled' : ''}`} onClick={handleChooseImage}>
              <Icon name="add-line" size={24} color="#6B7280" />
            </View>
            <View className="input-wrapper">
              {IS_H5 ? (
                <input
                  className="text-input"
                  placeholder="把事故情况告诉灵迈…"
                  value={inputText}
                  onChange={event => setInputText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) handleSend()
                  }}
                />
              ) : (
                <Input
                  className="text-input"
                  placeholder="把事故情况告诉灵迈…"
                  placeholderClass="placeholder"
                  value={inputText}
                  onInput={event => setInputText(event.detail.value)}
                  onConfirm={() => handleSend()}
                />
              )}
            </View>
            <View className={`send-button ${inputText.trim() && !isAiTyping ? 'ready' : ''}`} onClick={() => handleSend()}>
              <Icon name="arrow-right-line" className="send-arrow" size={22} color="#FFFFFF" />
            </View>
          </View>
          <Text className="composer-hint">内容由 AI 辅助整理，重要结论请结合原始材料核对</Text>
        </View>
      )}
    </View>
  )
}
