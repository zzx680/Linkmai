import { Button, View, Text, ScrollView, Image } from '@tarojs/components'
import { useState, useEffect, useRef } from 'react'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { syncTabRoute } from '../../custom-tab-bar/navigation'
import { useAppStore } from '../../store'
import { Icon } from '../../components'
import { MaterialType, QuickReply } from '../../services/api'
import { IS_H5 } from '../../config/env'
import brandLogo from '../../assets/brand/linkmai-chat.png'
import { AgentChatMessage, AgentChatSender } from '../../components/AgentChat'
import { getQuickReplyLabel, getQuickReplySelection } from '../../components/AgentChat/labels'
import OnboardingGuide from '../../components/OnboardingGuide'
import { completeGuideSteps } from '../../components/OnboardingGuide/progress'
import { useSpeechInput } from '../../hooks/useSpeechInput'
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
    user,
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
  const inputRevision = useRef(0)
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false)
  const [isContextExpanded, setIsContextExpanded] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useDidShow(() => syncTabRoute('/pages/agent/index'))
  useDidHide(() => setKeyboardHeight(0))

  useEffect(() => {
    if (!IS_H5) loadMessages().catch(() => undefined)
  }, [loadMessages, currentCase?.id])

  const stage = currentCase ? conversationState : 'collecting'
  const stageLabel = stageLabels[stage] || '收集信息'
  const stageColor = stageColors[stage] || 'status-collecting'

  const handleInputChange = (value: string) => {
    inputRevision.current += 1
    setInputText(value)
  }
  const speech = useSpeechInput({ userId: user?.id, caseId: currentCase?.id, value: inputText, onChange: handleInputChange })

  const handleSend = async (quickReply?: QuickReply, value = inputText) => {
    if (!currentCase || isAiTyping || isUploadingMaterial || speech.state !== 'idle') return
    const selection = quickReply ? getQuickReplySelection(quickReply) : { text: value.trim(), action: undefined }
    if (selection.action === 'upload') {
      handleChooseImage()
      return
    }
    if (selection.action === 'generate_report') {
      Taro.navigateTo({ url: `/pages/report/index?caseId=${currentCase.id}` })
      return
    }
    const { text, action } = selection
    if (!text && !action) return

    const draftRevision = inputRevision.current
    if (!quickReply) setInputText('')
    try {
      await sendMessage(text, action)
      completeGuideSteps(['login', 'create-case', 'describe'])
    } catch (error: unknown) {
      if (!quickReply && inputRevision.current === draftRevision) setInputText(text)
      Taro.showToast({ title: (error as Error).message || '发送失败', icon: 'none' })
    }
  }

  const handleChooseImage = async () => {
    if (!currentCase || isUploadingMaterial || isAiTyping || speech.state !== 'idle') return
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
      completeGuideSteps(['login', 'create-case', 'describe', 'upload'])
      Taro.showToast({ title: '识别完成，请核对', icon: 'success' })
      Taro.navigateTo({ url: `/pages/materials/index?caseId=${currentCase?.id || ''}` })
    } catch (error: unknown) {
      const failure = error as { errMsg?: string; message?: string }
      if (!failure.errMsg?.includes('cancel')) {
        await Taro.showModal({
          title: '材料处理失败',
          content: `${failure.message || '上传或识别未完成'} 可再次重试，或前往材料页继续处理`,
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
    <View
      className={`agent-page${keyboardHeight > 0 ? ' keyboard-open' : ''}`}
      style={keyboardHeight > 0 ? { height: `calc(100vh - ${keyboardHeight}px)` } : undefined}
    >
      <View className="chat-toolbar">
        <Button className={`chat-context-button ${isContextExpanded ? 'is-open' : ''}`} aria-label="案件进度" onClick={() => currentCase ? setIsContextExpanded(value => !value) : Taro.switchTab({ url: '/pages/case/index' })}>
          <Icon name="folder-open" size={20} color="#000000" />
          <Text>案件进度</Text>
          <View className={`status-badge ${stageColor}`}><View className="status-dot" /></View>
        </Button>
        {currentCase && <Button className="chat-materials-button" aria-label="查看材料" onClick={() => Taro.navigateTo({ url: '/pages/materials/index' })}>
          <Icon name="files" size={20} color="#000000" />
          <Text>材料 {materials.length}</Text>
        </Button>}
      </View>

      <ScrollView
        className={`workspace-container${!messages.length && !isAiTyping ? ' workspace-empty' : ''}`}
        scrollY
        scrollWithAnimation
        scrollIntoView={isAiTyping ? 'chat-pending' : messages.length ? `msg-${messages.length - 1}` : ''}
      >
        {!currentCase && (
          <View className="init-section">
            <Image src={brandLogo} className="chat-brand-logo" mode="aspectFit" />
            <View className="welcome-header">
              <Text className="welcome-title">先创建一个案件</Text>
              <Text className="welcome-subtitle">回到首页创建案件后，这里会成为你的处理工作台</Text>
              <Button className="return-home-button" onClick={() => Taro.switchTab({ url: '/pages/case/index' })}>返回首页</Button>
            </View>
          </View>
        )}

        {currentCase && (
          <View className="workspace-content">
            {isContextExpanded && (
              <View className="case-context-panel">
                <View className="context-heading"><Text className="case-title">案件工作台</Text><Text className={`status-badge ${stageColor}`}>{stageLabel}</Text></View>
                <Text className="material-summary">已整理 {materials.length} 份材料</Text>
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
                <Image src={brandLogo} className="chat-brand-logo" mode="aspectFit" />
                <Text className="empty-title">欢迎回来，想从哪里开始？</Text>
              </View>
            )}

            {messages.length > 0 && (
              <View className="conversation-section">
                <View className="messages-list">
                  {messages.map((msg, index) => (
                    <View key={msg.id} id={`msg-${index}`} className="chat-message-row">
                      <AgentChatMessage message={msg} />
                      {msg.quickReplies && msg.quickReplies.length > 0 && (
                        <View className="quick-replies">
                          {msg.quickReplies.map(reply => (
                            <View
                              key={`${reply.action || 'message'}-${reply.value}`}
                              className="quick-reply"
                              onClick={() => handleSend(reply)}
                            >
                              <Text>{getQuickReplyLabel(reply)}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {isAiTyping && (
              <View id="chat-pending" className="chat-message-row">
                <AgentChatMessage pending />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {currentCase && (
        <View className="input-bar">
          <AgentChatSender
            value={inputText}
            sending={isAiTyping}
            onChange={handleInputChange}
            onSend={value => { handleSend(undefined, value) }}
            onKeyboardHeightChange={height => setKeyboardHeight(Number.isFinite(height) ? Math.max(0, height) : 0)}
            onAttach={handleChooseImage}
            uploading={isUploadingMaterial}
            onDictate={speech.start}
            speechState={speech.state}
            speechText={speech.partial}
            speechSeconds={speech.seconds}
            onSpeechStop={speech.stop}
            onSpeechCancel={speech.cancel}
          />
        </View>
      )}
      <OnboardingGuide enabled={Boolean(currentCase) && !isAiTyping && !isUploadingMaterial && speech.state === 'idle' && keyboardHeight === 0} steps={[
        { id: 'describe', target: 'guide-describe', number: '02 / 03', title: '把事故经过说给灵迈', description: '点击「口述经过」说出时间、地点和经过，转成文字后核对再发送', nextLabel: '下一步', targetLabel: '口述经过', onTarget: speech.start },
        { id: 'upload', target: 'guide-upload', number: '03 / 03', title: '有材料，也可以直接上传', description: '从这里上传认定书、现场照片或医疗记录，识别后再逐项核对', nextLabel: '开始使用', targetLabel: '上传事故材料', onTarget: handleChooseImage }
      ]} />
    </View>
  )
}
