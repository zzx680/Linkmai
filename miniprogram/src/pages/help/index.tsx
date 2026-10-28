import { Button, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { Icon } from '../../components'
import { submitFeedback } from '../../services/api'
import { useAppStore } from '../../store'
import { restartGuide } from '../../components/OnboardingGuide/progress'
import './index.scss'

export default function Help() {
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submitFeedbackForm = async () => {
    const content = feedback.trim()
    if (!content) {
      Taro.showToast({ title: '请先填写你的问题或建议', icon: 'none' })
      return
    }
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      await submitFeedback(content)
      setFeedback('')
      Taro.showToast({ title: '反馈已提交', icon: 'success' })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '提交失败，请稍后重试', icon: 'none' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <View className="support-page help-page">
      <View className="support-header">
        <Text className="support-eyebrow">帮助中心</Text>
        <Text className="support-title">帮助与反馈</Text>
        <Text className="support-description">你可以在处理页继续描述事故，也可以在这里留下产品使用反馈</Text>
      </View>

      <View className="support-section contact-support-section">
        <Text className="section-title">联系客服</Text>
        <View className="support-card contact-support-card">
          <View className="card-icon"><Icon name="headset" size={22} color="#2A64F0" /></View>
          <View className="card-copy">
            <Text className="card-title">需要人工协助？</Text>
            <Text className="card-description">通过微信客服会话咨询产品使用和订单问题</Text>
            <Button className="contact-service-button" openType="contact" showMessageCard sendMessageTitle="灵迈使用咨询" sendMessagePath="pages/help/index">联系微信客服</Button>
          </View>
        </View>
      </View>

      <Button className="guide-replay-button" onClick={() => {
        restartGuide()
        Taro.switchTab({ url: useAppStore.getState().currentCase ? '/pages/agent/index' : '/pages/case/index' })
      }}><Text>重新查看新人指引</Text><Text>→</Text></Button>

      <View className="support-section">
        <Text className="section-title">提交反馈</Text>
        <View className="support-card feedback-card">
          <Text className="feedback-label">问题或建议</Text>
          <Textarea
            className="feedback-input"
            value={feedback}
            maxlength={500}
            placeholder="请描述你遇到的问题或希望改进的地方"
            placeholderStyle="color: #98A2B3"
            onInput={event => setFeedback(event.detail.value)}
          />
          <Text className="feedback-count">{feedback.length}/500</Text>
          <Button className="feedback-submit" loading={isSubmitting} disabled={isSubmitting} onClick={submitFeedbackForm}>提交反馈</Button>
        </View>
      </View>

      <Text className="support-note">提交反馈不会自动上传你的案件或材料内容。</Text>
    </View>
  )
}
