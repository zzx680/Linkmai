import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { BottomNav } from '../../components/navigation/BottomNav'
import { PageHeader } from '../../components/ui/PageHeader'
import { useCurrentCaseStore } from '../../stores/currentCase'
import './index.scss'

const menuSections = [
  {
    title: '服务与记录',
    items: [
      { label: '律师咨询记录', value: '暂无进行中的服务' },
      { label: '订单记录', value: '查看全部' },
    ],
  },
  {
    title: '隐私与数据',
    items: [
      { label: '材料使用授权', value: '仅当前案件' },
      { label: '导出我的数据', value: '申请导出' },
    ],
  },
  {
    title: '帮助',
    items: [
      { label: '联系客服', value: '工作日 9:00—18:00' },
      { label: '服务协议与隐私政策', value: '查看' },
      { label: '关于灵迈', value: '版本 0.1.0' },
    ],
  },
]

export default function ProfilePage() {
  const currentCase = useCurrentCaseStore((state) => state.currentCase)
  const clearCurrentCase = useCurrentCaseStore((state) => state.clearCurrentCase)

  const handleMenuItem = (label: string) => {
    Taro.showToast({ title: `${label}将在正式服务中接入`, icon: 'none' })
  }

  const deleteCase = () => {
    if (!currentCase) return
    Taro.showModal({
      title: '删除当前案件',
      content: '案件、对话和已上传材料将一并删除，此操作无法恢复。',
      confirmText: '确认删除',
      confirmColor: '#b3483b',
      success: ({ confirm }) => {
        if (confirm) {
          clearCurrentCase()
          Taro.showToast({ title: '当前案件已删除', icon: 'success' })
        }
      },
    })
  }

  return (
    <View className="profile-page lm-page">
      <PageHeader title="我的" kicker="ACCOUNT / 个人中心" />
      <View className="profile-page__content">
        <View className="profile-page__identity reveal">
          <View className="profile-page__avatar"><Text>LM</Text></View>
          <View>
            <Text className="profile-page__identity-title">微信用户</Text>
            <Text className="profile-page__identity-meta">灵迈服务账号 · 已登录</Text>
          </View>
          <Text className="profile-page__identity-arrow">↗</Text>
        </View>

        <View className="profile-page__privacy-card reveal reveal-delay-1">
          <Text className="profile-page__privacy-label">隐私状态</Text>
          <Text className="profile-page__privacy-title">你的材料只用于当前案件分析</Text>
          <Text className="profile-page__privacy-copy">原始材料存储在私有空间，可撤回授权并申请删除。</Text>
        </View>

        {menuSections.map((section, sectionIndex) => (
          <View className={`profile-page__section reveal reveal-delay-${Math.min(sectionIndex + 1, 3)}`} key={section.title}>
            <Text className="profile-page__section-title">{section.title}</Text>
            <View className="profile-page__menu">
              {section.items.map((item) => (
                <View className="profile-page__menu-item" key={item.label} onClick={() => handleMenuItem(item.label)} role="button">
                  <Text className="profile-page__menu-label">{item.label}</Text>
                  <View className="profile-page__menu-value">
                    <Text>{item.value}</Text>
                    <Text>›</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        {currentCase ? (
          <View className="profile-page__danger reveal reveal-delay-3" onClick={deleteCase} role="button">
            <Text>删除当前案件及全部材料</Text>
          </View>
        ) : null}
      </View>
      <BottomNav active="profile" />
    </View>
  )
}
