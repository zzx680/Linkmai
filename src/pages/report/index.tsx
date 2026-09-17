import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCurrentCaseStore, demoReport } from '../../stores/currentCase'
import { BottomNav } from '../../components/navigation/BottomNav'
import { PageHeader } from '../../components/ui/PageHeader'
import './index.scss'

export default function ReportPage() {
  const currentCase = useCurrentCaseStore((state) => state.currentCase)
  const report = useCurrentCaseStore((state) => state.report) || demoReport

  if (!currentCase) {
    Taro.reLaunch({ url: '/pages/case/index' })
    return null
  }

  return (
    <View className="report-page lm-page">
      <PageHeader title="参考报告" action="返回案件" onAction={() => Taro.reLaunch({ url: '/pages/case/index' })} />
      <View className="report-page__content">
        <View className="report-page__meta reveal">
          <Text className="report-page__meta-label">REFERENCE REPORT</Text>
          <Text className="report-page__case-title">{currentCase.title}</Text>
          <Text className="report-page__date">根据已确认材料生成 · 当前版本</Text>
        </View>

        <View className="report-page__notice reveal reveal-delay-1">
          <Text className="report-page__notice-mark">i</Text>
          <Text>这是一份定责与赔偿参考报告，不替代交警认定、保险定损或律师正式法律意见。</Text>
        </View>

        <View className="report-page__section reveal reveal-delay-1">
          <View className="report-page__section-heading">
            <Text className="report-page__section-index">01</Text>
            <Text className="report-page__section-title">定责参考</Text>
          </View>
          <Text className="report-page__lead">{report.liability.conclusion}</Text>
          <View className="report-page__basis">
            <Text className="report-page__basis-label">判断依据</Text>
            <Text className="report-page__basis-value">{report.liability.basis}</Text>
          </View>
          <View className="report-page__uncertainty">
            <Text className="report-page__uncertainty-label">分析提示</Text>
            <Text className="report-page__uncertainty-value">{report.liability.confidence}；最终责任以有权机关认定为准。</Text>
          </View>
        </View>

        <View className="report-page__section reveal reveal-delay-2">
          <View className="report-page__section-heading">
            <Text className="report-page__section-index">02</Text>
            <Text className="report-page__section-title">赔偿参考</Text>
          </View>
          <Text className="report-page__amount">{report.compensation.range}</Text>
          <Text className="report-page__amount-note">已知项目估算区间 · 金额以有效凭证和最终核定为准</Text>
          <View className="report-page__items">
            {report.compensation.items.map((item) => (
              <View className="report-page__item" key={item.label}>
                <View>
                  <Text className="report-page__item-label">{item.label}</Text>
                  {item.note ? <Text className="report-page__item-note">{item.note}</Text> : null}
                </View>
                <Text className="report-page__item-amount">{item.amount}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="report-page__section reveal reveal-delay-3">
          <View className="report-page__section-heading">
            <Text className="report-page__section-index">03</Text>
            <Text className="report-page__section-title">下一步</Text>
          </View>
          {report.nextSteps.map((step, index) => (
            <View className="report-page__step" key={step}>
              <Text className="report-page__step-index">0{index + 1}</Text>
              <Text className="report-page__step-text">{step}</Text>
            </View>
          ))}
        </View>

        {report.missingMaterials.length > 0 ? (
          <View className="report-page__missing reveal reveal-delay-3">
            <Text className="report-page__missing-label">还可以补充</Text>
            {report.missingMaterials.map((material) => (
              <Text className="report-page__missing-item" key={material}>＋ {material}</Text>
            ))}
          </View>
        ) : null}

        <View className="report-page__actions reveal reveal-delay-3">
          <View className="report-page__action report-page__action--primary" onClick={() => Taro.reLaunch({ url: '/pages/consultation/index' })} role="button">
            <Text>材料复杂？咨询合作律所</Text>
            <Text>↗</Text>
          </View>
          <View className="report-page__action report-page__action--secondary" onClick={() => Taro.showToast({ title: 'PDF 导出将在服务端接入', icon: 'none' })} role="button">
            <Text>导出 PDF</Text>
          </View>
        </View>
      </View>
      <BottomNav active="case" />
    </View>
  )
}
