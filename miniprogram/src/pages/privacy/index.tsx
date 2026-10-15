import { Text, View } from '@tarojs/components'
import { Icon } from '../../components'
import './index.scss'

const sections = [
  {
    icon: 'shield-check',
    title: '账户与会话',
    text: '登录用于保存案件进度。你可以在“我的”页面编辑资料或退出当前账户。'
  },
  {
    icon: 'folder-open',
    title: '案件与材料',
    text: '你上传并确认的材料用于整理案件事实与生成分析内容，请仅提交与当前案件相关的信息。'
  },
  {
    icon: 'lock-keyhole',
    title: '安全使用建议',
    text: '请避免在反馈中填写银行卡密码、验证码或与案件无关的敏感个人信息。'
  }
]

export default function Privacy() {
  return (
    <View className="support-page privacy-page">
      <View className="support-header">
        <Text className="support-eyebrow">账户保护</Text>
        <Text className="support-title">隐私与安全</Text>
        <Text className="support-description">灵迈仅在提供案件整理与服务功能所需的范围内使用你的账户和案件信息。</Text>
      </View>

      <View className="privacy-list">
        {sections.map(section => (
          <View className="support-card privacy-card" key={section.title}>
            <View className="card-icon"><Icon name={section.icon} size={22} color="#1E43A8" /></View>
            <View className="card-copy">
              <Text className="card-title">{section.title}</Text>
              <Text className="card-description">{section.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text className="support-note">灵迈提供 AI 辅助整理与分析，不替代专业法律意见。</Text>
    </View>
  )
}
