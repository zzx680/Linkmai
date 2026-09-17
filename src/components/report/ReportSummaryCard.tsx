import { View, Text } from '@tarojs/components'
import { ReportSummary } from '../../types/domain'
import './ReportSummaryCard.scss'

interface ReportSummaryCardProps {
  report: ReportSummary
  onOpen: () => void
  onConsult: () => void
}

export function ReportSummaryCard({ report, onOpen, onConsult }: ReportSummaryCardProps) {
  return (
    <View className="report-summary-card">
      <View className="report-summary-card__topline">
        <Text className="report-summary-card__eyebrow">REFERENCE REPORT / 01</Text>
        <Text className="report-summary-card__stamp">已生成</Text>
      </View>
      <Text className="report-summary-card__title">定责与赔偿参考报告</Text>
      <View className="report-summary-card__liability">
        <Text className="report-summary-card__label">定责参考</Text>
        <Text className="report-summary-card__conclusion">{report.liability.conclusion}</Text>
        <Text className="report-summary-card__basis">依据：{report.liability.basis}</Text>
      </View>
      <View className="report-summary-card__amount-row">
        <View>
          <Text className="report-summary-card__label">赔偿参考区间</Text>
          <Text className="report-summary-card__amount">{report.compensation.range}</Text>
        </View>
        <Text className="report-summary-card__confidence">{report.liability.confidence}</Text>
      </View>
      <View className="report-summary-card__actions">
        <View className="report-summary-card__button report-summary-card__button--primary" onClick={onOpen} role="button">
          <Text>查看完整报告</Text>
          <Text>↗</Text>
        </View>
        <View className="report-summary-card__button report-summary-card__button--secondary" onClick={onConsult} role="button">
          <Text>咨询律所</Text>
        </View>
      </View>
      <Text className="report-summary-card__disclaimer">本报告仅供参考，不替代交警认定、保险定损或律师正式法律意见。</Text>
    </View>
  )
}
