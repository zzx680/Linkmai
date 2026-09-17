import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCurrentCaseStore, demoCase } from '../../stores/currentCase'
import { CurrentCaseCard } from '../../components/case/CurrentCaseCard'
import { BottomNav } from '../../components/navigation/BottomNav'
import './index.scss'

const draftCase = {
  ...demoCase,
  id: 'LM-DRAFT-001',
  title: '新的事故分析',
  accidentType: '等待材料确认',
  updatedAt: '刚刚开始',
  status: 'collecting' as const,
  statusLabel: '材料待上传',
  materialCount: 0,
  materialProgress: '优先上传客观材料',
  liability: undefined,
  compensation: undefined,
  hasReport: false,
}

export default function CasePage() {
  const currentCase = useCurrentCaseStore((state) => state.currentCase)
  const setCurrentCase = useCurrentCaseStore((state) => state.setCurrentCase)

  const startAgent = () => {
    if (!currentCase) setCurrentCase(draftCase)
    Taro.reLaunch({ url: '/pages/agent/index' })
  }

  const openReport = () => {
    if (!currentCase?.hasReport) {
      Taro.reLaunch({ url: '/pages/agent/index' })
      return
    }
    Taro.navigateTo({ url: '/pages/report/index' })
  }

  const showNewCaseHint = () => {
    Taro.showModal({
      title: '当前只保留一个案件',
      content: '开始新的分析会替换当前案件。已有报告建议先下载保存。',
      confirmText: '开始新的',
      cancelText: '取消',
      success: ({ confirm }) => {
        if (confirm) {
          setCurrentCase(draftCase)
          Taro.reLaunch({ url: '/pages/agent/index' })
        }
      },
    })
  }

  return (
    <View className="case-page lm-page">
      <View className="case-page__content lm-safe-content">
        <View className="case-page__topline reveal">
          <Text className="case-page__brand">LINGMAI</Text>
          <Text className="case-page__edition">事故后 · 参考服务</Text>
        </View>

        <View className="case-page__welcome reveal reveal-delay-1">
          <Text className="case-page__hello">Hello 👋</Text>
          <Text className="case-page__welcome-title">欢迎使用灵迈</Text>
          <Text className="case-page__welcome-copy">把材料交给我，先把责任与赔偿理清楚。</Text>
        </View>

        {!currentCase ? (
          <View className="case-page__empty reveal reveal-delay-2">
            <View className="case-page__empty-orbit">
              <View className="case-page__empty-dot" />
              <Text className="case-page__empty-index">01</Text>
            </View>
            <View className="case-page__empty-copy">
              <Text className="case-page__empty-title">从一份材料开始</Text>
              <Text className="case-page__empty-description">
                优先上传交警认定书、医院材料、费用票据或车损定损单，分析会更准确。
              </Text>
            </View>
            <View className="case-page__start" onClick={startAgent} role="button">
              <Text>开始分析</Text>
              <Text className="case-page__start-arrow">↗</Text>
            </View>
            <Text className="case-page__privacy">材料仅用于本次分析 · 可随时删除</Text>
          </View>
        ) : (
          <View className="case-page__with-case reveal reveal-delay-2">
            <View className="case-page__section-heading">
              <Text className="case-page__section-label">你的当前案件</Text>
              <Text className="case-page__section-note">1 / 1</Text>
            </View>
            <CurrentCaseCard currentCase={currentCase} onPrimary={openReport} onSecondary={startAgent} />
            <View className="case-page__secondary-actions">
              <View className="case-page__secondary-action" onClick={showNewCaseHint} role="button">
                <Text>分析另一场事故</Text>
                <Text>＋</Text>
              </View>
              <View className="case-page__secondary-action" onClick={() => Taro.reLaunch({ url: '/pages/consultation/index' })} role="button">
                <Text>需要律师帮助</Text>
                <Text>↗</Text>
              </View>
            </View>
          </View>
        )}

        <View className="case-page__principles reveal reveal-delay-3">
          <View className="case-page__principle">
            <Text className="case-page__principle-index">A</Text>
            <Text className="case-page__principle-text">先核对材料</Text>
          </View>
          <View className="case-page__principle">
            <Text className="case-page__principle-index">B</Text>
            <Text className="case-page__principle-text">再判断责任</Text>
          </View>
          <View className="case-page__principle">
            <Text className="case-page__principle-index">C</Text>
            <Text className="case-page__principle-text">最后算赔偿</Text>
          </View>
        </View>
      </View>
      <BottomNav active="case" />
    </View>
  )
}
