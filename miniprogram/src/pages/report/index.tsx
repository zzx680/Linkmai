import { View, Text, ScrollView } from '@tarojs/components'
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { useAppStore } from '../../store'
import { exportReport } from '../../services/api'
import './index.scss'

function splitParagraphs(value?: string) {
  return (value || '').split(/\n+/).map(item => item.trim()).filter(Boolean)
}

export default function Report() {
  const {
    currentCase,
    currentReport,
    materials,
    isGeneratingReport,
    generateReport,
    loadReport
  } = useAppStore()
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentCase?.hasReport && !currentReport) {
      loadReport(currentCase.id).catch(() => setError('报告暂时无法加载'))
    }
  }, [currentCase?.id, currentCase?.hasReport])

  const handleGenerate = async () => {
    setError('')
    try {
      await generateReport()
    } catch {
      setError('报告生成失败，请稍后重试')
    }
  }

  const handleExport = async (format: 'pdf' | 'word') => {
    if (!currentCase) return
    setIsExporting(true)
    try {
      const result = await exportReport(currentCase.id, format)
      if (result.downloadUrl) {
        Taro.setClipboardData({ data: result.downloadUrl })
        Taro.showToast({ title: '下载地址已复制', icon: 'success' })
      } else {
        Taro.showToast({ title: result.message || '导出功能即将上线', icon: 'none' })
      }
    } catch (exportError: any) {
      Taro.showToast({ title: exportError.message || '导出失败', icon: 'none' })
    } finally {
      setIsExporting(false)
    }
  }

  const goMaterials = () => Taro.navigateTo({ url: '/pages/materials/index' })
  const goConsultation = () => Taro.switchTab({ url: '/pages/consultation/index' })

  const confirmedMaterials = materials.filter(material => material.confirmed)
  const confirmedFieldsCount = confirmedMaterials.reduce((total, material) => total + material.fields.length, 0)

  if (isGeneratingReport) {
    return (
      <View className="report-page">
        <View className="generating-state">
          <View className="generating-mark">✦</View>
          <Text className="generating-title">正在整理案件分析</Text>
          <Text className="generating-description">灵迈正在基于已确认的材料生成分析，请保持页面打开。</Text>
          <View className="generation-steps">
            <View className="generation-step active"><View className="step-dot" /><Text>核对已确认事实</Text></View>
            <View className="generation-step active"><View className="step-dot" /><Text>生成责任与赔偿分析</Text></View>
            <View className="generation-step pending"><View className="step-dot" /><Text>整理下一步建议</Text></View>
          </View>
        </View>
      </View>
    )
  }

  if (!currentReport) {
    return (
      <View className="report-page">
        <View className="page-header">
          <Text className="eyebrow">CASE BRIEF</Text>
          <Text className="page-title">案件报告</Text>
          <Text className="page-description">报告会把已确认的材料整理成可阅读、可复核的处理摘要。</Text>
        </View>

        <View className="preflight-card">
          <View className="preflight-icon">◎</View>
          <Text className="preflight-title">生成前检查</Text>
          <Text className="preflight-description">只有已确认的材料字段会进入报告。AI 输出仅供参考，不替代律师意见或司法认定。</Text>
          <View className="preflight-list">
            <View className="preflight-row"><Text>已添加材料</Text><Text className="row-value">{materials.length} 份</Text></View>
            <View className="preflight-row"><Text>已确认材料</Text><Text className="row-value">{confirmedMaterials.length} 份</Text></View>
            <View className="preflight-row"><Text>可用事实字段</Text><Text className="row-value">{confirmedFieldsCount} 项</Text></View>
            <View className="preflight-row"><Text>材料状态</Text><Text className={`row-value ${confirmedFieldsCount ? 'ready' : 'warning'}`}>{confirmedFieldsCount ? '可以生成' : '需要核对'}</Text></View>
          </View>
          {error && <Text className="error-text">{error}</Text>}
          <View className={`generate-button ${confirmedFieldsCount === 0 ? 'disabled' : ''}`} onClick={confirmedFieldsCount ? handleGenerate : goMaterials}>
            <Text>{confirmedFieldsCount ? '生成案件报告' : materials.length ? '先去核对材料' : '先去添加材料'}</Text>
          </View>
        </View>

        <View className="report-note">
          <Text className="note-icon">i</Text>
          <Text>报告会明确区分材料事实、AI 分析和行动建议，重要结论请回到原始材料核对。</Text>
        </View>
      </View>
    )
  }

  const analysisParagraphs = splitParagraphs(currentReport.analysis)
  const liabilityParagraphs = splitParagraphs(currentReport.liability)
  const compensationParagraphs = splitParagraphs(currentReport.compensation)

  return (
    <View className="report-page">
      <ScrollView className="report-scroll" scrollY showScrollbar={false}>
        <View className="page-header result-header">
          <View>
            <Text className="eyebrow">ANALYSIS REPORT</Text>
            <Text className="page-title">案件分析报告</Text>
            <Text className="page-description">{currentCase?.title || '当前案件'} · {new Date(currentReport.generatedAt).toLocaleString('zh-CN')}</Text>
          </View>
          <View className="report-status"><Text>已生成</Text></View>
        </View>

        <View className="scope-banner">
          <Text className="scope-icon">◇</Text>
          <View><Text className="scope-title">阅读边界</Text><Text className="scope-text">以下内容是基于已确认材料的 AI 辅助分析，不是确定的法律结论。</Text></View>
        </View>

        <View className="report-section">
          <View className="section-heading"><Text className="section-index">01</Text><Text className="section-title">事故分析</Text></View>
          <View className="content-card">{analysisParagraphs.length ? analysisParagraphs.map((paragraph, index) => <Text key={index} className="body-paragraph">{paragraph}</Text>) : <Text className="muted-text">暂无事故分析内容。</Text>}</View>
        </View>

        <View className="report-section">
          <View className="section-heading"><Text className="section-index">02</Text><Text className="section-title">责任认定</Text></View>
          <View className="content-card liability-card">
            <View className="liability-mark">⚖️</View>
            <View className="liability-copy">{liabilityParagraphs.length ? liabilityParagraphs.map((paragraph, index) => <Text key={index} className="body-paragraph">{paragraph}</Text>) : <Text className="muted-text">暂无责任分析。</Text>}</View>
          </View>
        </View>

        <View className="report-section">
          <View className="section-heading"><Text className="section-index">03</Text><Text className="section-title">赔偿建议</Text></View>
          <View className="content-card compensation-card">
            <Text className="card-caption">AI 估算与说明</Text>
            {compensationParagraphs.length ? compensationParagraphs.map((paragraph, index) => <Text key={index} className="body-paragraph">{paragraph}</Text>) : <Text className="muted-text">暂无赔偿建议。</Text>}
          </View>
        </View>

        <View className="report-section">
          <View className="section-heading"><Text className="section-index">04</Text><Text className="section-title">下一步建议</Text></View>
          <View className="recommendation-card">
            {(currentReport.recommendations || []).map((item, index) => <View key={index} className="recommendation-row"><Text className="recommendation-number">{String(index + 1).padStart(2, '0')}</Text><Text className="recommendation-text">{item}</Text></View>)}
          </View>
        </View>

        <View className="source-card">
          <Text className="source-title">依据与复核</Text>
          <Text className="source-text">本报告依据当前案件中已确认的 {materials.length} 份材料生成。建议在采取行动前查看原始材料，并在责任或金额存在争议时咨询专业律师。</Text>
          <View className="source-actions"><View onClick={goMaterials}><Text>查看材料 →</Text></View><View onClick={goConsultation}><Text>咨询律师 →</Text></View></View>
        </View>

        <View className="export-actions">
          <View className="export-button secondary" onClick={() => handleExport('word')}><Text>{isExporting ? '处理中' : '导出 Word'}</Text></View>
          <View className="export-button primary" onClick={() => handleExport('pdf')}><Text>{isExporting ? '处理中' : '导出 PDF'}</Text></View>
        </View>
      </ScrollView>
    </View>
  )
}
