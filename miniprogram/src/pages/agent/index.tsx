import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import { useState, useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { useAgentStore } from '../../store/agent'
import { sendMessage, createConversation } from '../../utils/agent'
import { chooseImage, uploadToOSS } from '../../utils/upload'
import './index.scss'

export default function Agent() {
  const { conversationId, messages, isLoading, setConversationId, addMessage, setLoading } = useAgentStore()
  const [inputText, setInputText] = useState('')
  const [uploadingImages, setUploadingImages] = useState<string[]>([])
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

      addMessage({
        id: Date.now().toString(),
        role: 'assistant',
        content: '我会帮你分析事故责任与赔偿金额',
        timestamp: Date.now()
      })
    } catch (err) {
      Taro.showToast({ title: '初始化失败', icon: 'none' })
    }
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

  const handleQuickAction = (action: string) => {
    setInputText(action)
  }

  return (
    <View className="agent-page">
      <ScrollView
        className="messages-container"
        scrollY
        scrollWithAnimation
        scrollIntoView={`msg-${messages.length - 1}`}
      >
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

        {messages.length === 1 && (
          <View className="quick-options">
            <View className="option-card" onClick={() => handleQuickAction('我想上传交警认定书')}>
              <View className="option-icon-wrapper">
                <Image
                  src="https://cdn-icons-png.flaticon.com/512/2965/2965358.png"
                  className="option-icon-img"
                  mode="aspectFit"
                />
              </View>
              <Text className="option-text">上传交警认定书</Text>
              <Text className="option-arrow">→</Text>
            </View>
            <View className="option-card" onClick={() => handleQuickAction('我想上传医疗材料')}>
              <View className="option-icon-wrapper">
                <Image
                  src="https://cdn-icons-png.flaticon.com/512/2913/2913133.png"
                  className="option-icon-img"
                  mode="aspectFit"
                />
              </View>
              <Text className="option-text">上传医疗材料</Text>
              <Text className="option-arrow">→</Text>
            </View>
            <View className="option-card" onClick={() => handleQuickAction('我想上传车损材料')}>
              <View className="option-icon-wrapper">
                <Image
                  src="https://cdn-icons-png.flaticon.com/512/3097/3097108.png"
                  className="option-icon-img"
                  mode="aspectFit"
                />
              </View>
              <Text className="option-text">上传车损材料</Text>
              <Text className="option-arrow">→</Text>
            </View>
            <View className="option-card subtle" onClick={() => handleQuickAction('我没有任何材料')}>
              <Text className="option-text">我没有材料，口述事故经过</Text>
              <Text className="option-arrow">→</Text>
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
      </ScrollView>

      <View className="input-bar">
        <View className="attach-button" onClick={handleChooseImage}>
          <Text className="icon">📎</Text>
        </View>
        <View className="input-wrapper">
          <Input
            className="text-input"
            placeholder="输入消息..."
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
