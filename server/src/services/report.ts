import { analyzeWithDeepSeek } from './deepseek'
import { CollectedFact } from './agent'

export interface ReportData {
  caseId: string
  facts: CollectedFact[]
  analysis: string
  liability: string
  compensation: string
  recommendations: string[]
  generatedAt: string
}

/**
 * 生成事故分析报告
 */
export async function generateReport(facts: CollectedFact[]): Promise<ReportData> {
  try {
    // 构建 Prompt
    const factsText = facts
      .filter((f) => f.confirmed)
      .map((f) => `- ${f.label}: ${f.value}`)
      .join('\n')

    const prompt = `你是交通事故专业分析师。基于以下事实信息，生成一份详细的事故分析报告。

事实信息：
${factsText}

请按以下格式返回 JSON：
\`\`\`json
{
  "analysis": "事故经过分析（3-5段，详细描述事故发生的时间、地点、过程、损失情况）",
  "liability": "责任认定总结（明确各方责任比例和依据）",
  "compensation": "赔偿建议（列出主要赔偿项目和估算金额，如医疗费、车损、误工费等）",
  "recommendations": ["建议1", "建议2", "建议3"]（3-5条具体建议）
}
\`\`\`

要求：
1. 分析要客观、专业，基于交通法规
2. 责任认定要有法律依据
3. 赔偿建议要合理、具体
4. 建议要实用、可操作

只返回 JSON，不要其他文字。`

    const response = await analyzeWithDeepSeek(prompt)

    // 解析 AI 返回
    const parsed = parseReportResponse(response)

    return {
      caseId: '',
      facts,
      analysis: parsed.analysis,
      liability: parsed.liability,
      compensation: parsed.compensation,
      recommendations: parsed.recommendations,
      generatedAt: new Date().toISOString(),
    }
  } catch (err: any) {
    console.error('报告生成失败:', err)
    throw new Error('报告生成失败: ' + err.message)
  }
}

function parseReportResponse(response: string): {
  analysis: string
  liability: string
  compensation: string
  recommendations: string[]
} {
  try {
    // 提取 JSON
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('无法解析 AI 响应')
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const data = JSON.parse(jsonStr)

    return {
      analysis: data.analysis || '暂无分析',
      liability: data.liability || '责任认定中',
      compensation: data.compensation || '赔偿计算中',
      recommendations: data.recommendations || [],
    }
  } catch (err) {
    console.error('解析报告失败:', err)
    return {
      analysis: '报告生成中遇到问题，请稍后重试',
      liability: '',
      compensation: '',
      recommendations: [],
    }
  }
}

/**
 * 格式化报告为文本
 */
export function formatReportAsText(report: ReportData): string {
  return `
# 交通事故分析报告

生成时间：${new Date(report.generatedAt).toLocaleString('zh-CN')}

## 一、事故分析

${report.analysis}

## 二、责任认定

${report.liability}

## 三、赔偿建议

${report.compensation}

## 四、处理建议

${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---
本报告由灵迈 AI 助手生成，仅供参考。如有争议，请以法院判决为准。
`.trim()
}
