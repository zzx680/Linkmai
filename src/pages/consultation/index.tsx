import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { BottomNav } from '../../components/navigation/BottomNav'
import { PageHeader } from '../../components/ui/PageHeader'
import { useCurrentCaseStore } from '../../stores/currentCase'
import './index.scss'

const reviewReasons = [
  '责任认定存在争议或材料互相冲突',
  '涉及伤残、死亡或长期治疗',
  '对方或保险公司拒绝赔偿',
  '准备调解、起诉或需要正式法律文书',
]

export default function ConsultationPage() {
  const currentCase = useCurrentCaseStore((state) => state.currentCase)

  const submitConsultation = () => {
    if (!currentCase) {
      Taro.showModal({
        title: '先完成基础分析',
        content: '建议先让 Agent 整理材料，律师可以直接看到完整的案件摘要。',
        confirmText: '去 Agent',
        success: ({ confirm }) => confirm && Taro.reLaunch({ url: '/pages/agent/index' }),
      })
      return
    }
    Taro.showModal({
      title: '提交给合作律所',
      content: `将关联“${currentCase.title}”及已确认材料，律所后续与你联系。`,
      confirmText: '确认提交',
      success: ({ confirm }) => {
        if (confirm) Taro.showToast({ title: '咨询申请已提交', icon: 'success' })
      },
    })
  }

  return (
    <View className="consult-page lm-page">
      <PageHeader title="律师咨询" kicker="LEGAL SUPPORT / 合作律所" />
      <View className="consult-page__content">
        <View className="consult-page__hero reveal">
          <Text className="consult-page__hero-index">01 — HUMAN REVIEW</Text>
          <Text className="consult-page__hero-title">复杂的部分，交给专业律师继续判断。</Text>
          <Text className="consult-page__hero-copy">
            灵迈不会让你重新填写一遍。提交后，合作律所会收到当前案件摘要、材料目录与待核验问题。
          </Text>
        </View>

        <View className="consult-page__case-link reveal reveal-delay-1">
          <Text className="consult-page__case-link-label">本次关联案件</Text>
          <Text className="consult-page__case-link-value">{currentCase ? currentCase.title : '尚未完成案件分析'}</Text>
          <Text className="consult-page__case-link-meta">
            {currentCase ? `${currentCase.materialProgress} · ${currentCase.statusLabel}` : '先通过 Agent 整理材料，咨询会更高效'}
          </Text>
        </View>

        <View className="consult-page__section reveal reveal-delay-2">
          <Text className="consult-page__section-title">什么情况建议律师介入</Text>
          {reviewReasons.map((reason, index) => (
            <View className="consult-page__reason" key={reason}>
              <Text className="consult-page__reason-index">0{index + 1}</Text>
              <Text className="consult-page__reason-text">{reason}</Text>
            </View>
          ))}
        </View>

        <View className="consult-page__firm reveal reveal-delay-3">
          <View className="consult-page__firm-heading">
            <Text className="consult-page__firm-label">合作律所服务</Text>
            <Text className="consult-page__firm-badge">资质核验</Text>
          </View>
          <Text className="consult-page__firm-title">交通事故专项咨询</Text>
          <View className="consult-page__firm-features">
            <Text>· 律师阅读 Agent 整理的案件摘要</Text>
            <Text>· 核对争议责任、人伤项目和证据风险</Text>
            <Text>· 根据需要承接协商、调解或诉讼服务</Text>
          </View>
          <Text className="consult-page__firm-note">具体服务内容和费用由合作律所沟通确认，平台不承诺案件结果。</Text>
          <View className="consult-page__submit" onClick={submitConsultation} role="button">
            <Text>{currentCase ? '关联当前案件并提交' : '先去完成基础分析'}</Text>
            <Text>↗</Text>
          </View>
        </View>
      </View>
      <BottomNav active="consultation" />
    </View>
  )
}
