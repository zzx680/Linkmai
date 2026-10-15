import { Button, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { Icon } from '../../components'
import './index.scss'

export default function Help() {
  const [feedback, setFeedback] = useState('')

  const submitFeedback = () => {
    if (!feedback.trim()) {
      Taro.showToast({ title: '请先填写你的问题或建议', icon: 'none' })
      return
    }
    setFeedback('')
    Taro.showToast({ title: '已收到你的反馈', icon: 'success' })
  }

  return (
    <View className="support-page help-page">
      <View className="support-header">
        <Text className="support-eyebrow">帮助中心</Text>
        <Text className="support-title">帮助与反馈</Text>
        <Text className="support-description">你可以在处理页继续描述事故，也可以在这里留下产品使用反馈。</Text>
      </View>

      <View className="support-card quick-help-card">
        <View className="card-icon"><Icon name="messages-square" size={22} color="#1E43A8" /></View>
        <View className="card-copy">
          <Text className="card-title">处理事故</Text>
          <Text className="card-description">从底部“处理”进入对话，按提示讲清事故经过并整理材料。</Text>
        </View>
      </View>

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
          <Button className="feedback-submit" onClick={submitFeedback}>提交反馈</Button>
        </View>
      </View>

      <Text className="support-note">反馈仅在本次页面中确认，不会自动上传你的案件或材料内容。</Text>
    </View>
  )
}
