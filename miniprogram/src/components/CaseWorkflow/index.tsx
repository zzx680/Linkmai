import { Button, View, Text, Input, Picker } from '@tarojs/components'
import { useEffect, useState } from 'react'
import Taro, { useDidShow, useDidHide } from '@tarojs/taro'
import { workflowApi, WorkflowWorkspace } from '../../services/workflow'
import { useAppStore } from '../../store'
import { ensureCaseDataConsent, ensureReviewConsent } from '../../utils/privacy-consent'
import { useReportNotification } from '../../hooks/useReportNotification'
import './index.scss'

const fields = [
  ['accident_date','事故日期','日期格式：2026-10-27'], ['jurisdiction','事故地区','选择实际事故所在地'],
  ['injury_severity','伤情','none（无人伤）/ minor（轻微）/ serious（严重）/ unknown（未确定）'],
  ['has_liability_document','是否已有事故认定书','yes / no'],
  ['claim_medical','是否主张医疗费','yes / no'], ['medical_expense_cents','医疗费（元）','填写已确认票据金额'],
  ['claim_lost_income','是否主张误工损失','yes / no'], ['lost_income_daily_cents','误工日收入（元）','按已确认收入证明填写'], ['lost_work_days','误工天数','填写整数天数'],
  ['claim_nursing','是否主张护理费','yes / no'], ['nursing_daily_cents','每日护理标准（元）','填写有依据的日标准'], ['nursing_days','护理天数','填写整数'], ['nursing_people','护理人数','填写 1–10'],
  ['claim_transportation','是否主张交通费','yes / no'], ['transportation_expense_cents','交通费（元）','填写票据金额'],
  ['claim_meals','是否主张住院伙食补助费','yes / no'], ['hospital_days','住院天数','填写整数；日标准由已审核地区规则提供'],
  ['claim_nutrition','是否主张营养费','yes / no'], ['nutrition_days','营养期天数','填写整数；日标准由已审核地区规则提供'],
  ['claim_vehicle','是否主张车辆损失','yes / no'], ['vehicle_damage_cents','车辆损失（元）','按已确认维修或评估金额填写'],
] as const
const title = (key: string) => fields.find(field => field[0] === key)?.[1] || key
const yesNo = [{label:'是',value:'yes'}, {label:'否',value:'no'}]
const injuryOptions = [{label:'无人受伤',value:'none'},{label:'轻微伤情',value:'minor'},{label:'严重伤情',value:'serious'},{label:'尚未确定',value:'unknown'}]
const regions = [['北京','CN-BJ'],['天津','CN-TJ'],['河北','CN-HE'],['山西','CN-SX'],['内蒙古','CN-NM'],['辽宁','CN-LN'],['吉林','CN-JL'],['黑龙江','CN-HL'],['上海','CN-SH'],['江苏','CN-JS'],['浙江','CN-ZJ'],['浙江·杭州','CN-ZJ-HZ'],['安徽','CN-AH'],['福建','CN-FJ'],['江西','CN-JX'],['山东','CN-SD'],['河南','CN-HA'],['湖北','CN-HB'],['湖南','CN-HN'],['广东','CN-GD'],['广西','CN-GX'],['海南','CN-HI'],['重庆','CN-CQ'],['四川','CN-SC'],['贵州','CN-GZ'],['云南','CN-YN'],['西藏','CN-XZ'],['陕西','CN-SN'],['甘肃','CN-GS'],['青海','CN-QH'],['宁夏','CN-NX'],['新疆','CN-XJ']]
const displayValue = (key: string,value: string) => key === 'injury_severity' ? injuryOptions.find(o => o.value === value)?.label || value : key === 'jurisdiction' ? regions.find(r => r[1] === value)?.[0] || value : ['yes','no'].includes(value) ? yesNo.find(o => o.value === value)!.label : value
const statuses: Record<string,string> = { proposed:'待确认', confirmed:'已确认', disputed:'有冲突', rejected:'已拒绝', draft:'待确认草稿', user_confirmed:'已确认', lawyer_review:'待律师审核', approved:'已批准', stale:'已失效', superseded:'已有新版本', pending:'待分配', in_review:'审核中', returned:'已退回', queued:'等待处理', running:'处理中', failed:'处理失败', succeeded:'处理完成', complete:'输入齐备', incomplete:'待补充', requires_review:'需复核依据' }
const documentTitles: Record<string,string> = { case_report:'事故分析报告', evidence_catalog:'证据目录', action_plan:'材料补充清单与行动计划' }
const yuan = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2,'0')}`

export default function CaseWorkflow({ caseId }: { caseId: string }) {
  const reportNotification = useReportNotification(caseId)
  const [workspace, setWorkspace] = useState<WorkflowWorkspace | null>(null)
  const [field, setField] = useState(0)
  const [value, setValue] = useState('')
  const [evidence, setEvidence] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(true)
  const [cycle, setCycle] = useState(0)
  useDidShow(() => { setVisible(true); setCycle(n => n + 1) })
  useDidHide(() => setVisible(false))
  useEffect(() => {
    setWorkspace(null); setError('')
  }, [caseId])
  useEffect(() => {
    if (!visible) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const refresh = async () => {
      try {
        const result = await workflowApi.get(caseId)
        if (!active) return
        setWorkspace(result)
        const activeWork = result.runs.some(run => ['queued','running'].includes(run.status))
          || result.reviews.some(review => ['pending','in_review'].includes(review.status))
        if (activeWork && ++attempts < 60) timer = setTimeout(refresh, 2000)
      } catch (err) { if (active) setError(err instanceof Error ? err.message : '暂时无法加载案件文书') }
    }
    void refresh()
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [caseId, visible, cycle])
  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const userId = useAppStore.getState().user?.id
      if (!userId || !await ensureCaseDataConsent(userId)) throw new Error('请先同意案件资料处理')
      if (useAppStore.getState().currentCase?.id !== caseId || useAppStore.getState().user?.id !== userId) throw new Error('案件或账号已切换，请重新操作')
      await fn(); setCycle(n => n + 1)
    }
    catch (err) { setError(err instanceof Error ? err.message : '操作未完成') }
    finally { setBusy(false) }
  }
  const selectedKey = fields[field][0]
  const options = selectedKey === 'injury_severity' ? injuryOptions : selectedKey.startsWith('claim_') || selectedKey === 'has_liability_document' ? yesNo : null
  const activeEvidence = workspace?.evidence.filter(item => item.status === 'active') || []
  const calculation = workspace?.calculations.find(item => item.contextHash === workspace.contextHash)
  const activeDocuments = workspace?.documents.filter(doc => !['stale','superseded'].includes(doc.status)) || []
  return <View className="case-workflow">
    <View className="workflow-heading"><Text className="workflow-eyebrow">案件文书</Text><Text className="workflow-title">先核对，再向前一步</Text>
      <Text className="workflow-description">损失项目由规则计算。草稿经你确认后，将交给指定律师复核。</Text>
      <Text className="workflow-version">案件版本 {workspace?.revision ?? '…'} · <Text onClick={() => setCycle(n => n + 1)}>刷新进度</Text></Text></View>
    {error && <Text className="workflow-error">{error}</Text>}
    {!workspace ? <Text>正在加载案件…</Text> : <>
      <View className="workflow-card"><Text className="workflow-card-title">补充计算与核对信息</Text><Text className="workflow-muted">刑事、特殊主体与期限风险由独立审核流程核对，用户输入不能替代该审核。</Text>
        <Picker mode="selector" range={fields.map(item => item[1])} value={field} onChange={e => { setField(Number(e.detail.value)); setValue('') }}><View className="workflow-picker">{fields[field][1]}　⌄</View></Picker>
        {selectedKey === 'accident_date' ? <Picker mode="date" value={value} onChange={e => setValue(e.detail.value)}><View className="workflow-picker">{value || '选择事故日期'}　⌄</View></Picker> : selectedKey === 'jurisdiction' ? <Picker mode="selector" range={regions.map(r => r[0])} onChange={e => setValue(regions[Number(e.detail.value)][1])}><View className="workflow-picker">{displayValue(selectedKey,value) || '选择事故所在地'}　⌄</View></Picker> : options ? <Picker mode="selector" range={options.map(o => o.label)} onChange={e => setValue(options[Number(e.detail.value)].value)}><View className="workflow-picker">{displayValue(selectedKey,value) || '请选择'}　⌄</View></Picker> : <Input className="workflow-input" value={value} placeholder={fields[field][2]} onInput={e => setValue(e.detail.value)} />}
        <Picker mode="selector" range={['用户陈述（待凭证复核）', ...activeEvidence.map(item => `材料字段：${title(item.fieldKey || '')}`)]} value={evidence} onChange={e => setEvidence(Number(e.detail.value))}>
          <View className="workflow-picker">{evidence && activeEvidence[evidence - 1] ? `依据：${title(activeEvidence[evidence - 1].fieldKey || '')}` : '依据：用户陈述（待凭证复核）'}　⌄</View></Picker>
        <View className={`workflow-button ${busy ? 'is-busy' : ''}`} onClick={() => void act(async () => {
          const [key,label] = fields[field]
          let submitted = value.trim()
          if (!submitted) throw new Error('请先填写或选择信息')
          if (key.endsWith('_cents')) {
            if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(submitted)) throw new Error('金额最多两位小数，请填写非负数字')
            const [whole, fraction = ''] = submitted.split('.'); submitted = String(Number(whole) * 100 + Number(fraction.padEnd(2,'0')))
          }
          await workflowApi.propose(caseId, { key, label, value: submitted, evidenceRefs: evidence && activeEvidence[evidence - 1] ? [activeEvidence[evidence - 1].id] : [] })
          setValue('')
        })}><Text>{busy ? '处理中…' : '添加待确认信息'}</Text></View>
      </View>
      <View className="workflow-card"><Text className="workflow-card-title">事实确认</Text>
        {workspace.facts.filter(fact => fact.status !== 'rejected').map(fact => <View key={fact.id} className="workflow-row"><Text className="workflow-label">{fact.label} · {statuses[fact.status]}</Text><Text className="workflow-body">{fact.key.endsWith('_cents') && /^\d+$/.test(fact.value) ? `${yuan(Number(fact.value))} 元` : displayValue(fact.key,fact.value)}</Text>
          {fact.status === 'proposed' && <View className="workflow-actions"><Text onClick={() => void act(() => workflowApi.decide(caseId,fact.id,'confirm'))}>确认此信息</Text><Text onClick={() => void act(() => workflowApi.decide(caseId,fact.id,'reject'))}>拒绝</Text></View>}
        </View>)}
        {workspace.conflicts.filter(conflict => conflict.status === 'open').map(conflict => <View key={conflict.id} className="workflow-conflict"><Text>请选择核实后的 {title(conflict.key)}：</Text>{conflict.factIds.map(factId => <Text key={factId} className="workflow-choice" onClick={() => void act(() => workflowApi.resolve(caseId,conflict.id,factId))}>{workspace.facts.find(f => f.id === factId)?.value}</Text>)}</View>)}
        {!workspace.facts.length && <Text className="workflow-muted">先在“处理”页描述事故，或上传并确认材料。</Text>}
      </View>
      <View className="workflow-card"><Text className="workflow-card-title">损失项目试算</Text><Text className="workflow-muted">请逐项注明是否主张。缺少标准或材料时不提供确定总额；不包含责任分摊和已付款扣减。</Text>
        {calculation && <><Text className="workflow-label">{statuses[calculation.status]}</Text>{calculation.items.map(item => <View key={item.code} className="workflow-row"><Text>{item.label}　{item.amountCents === undefined ? '待补充' : `${yuan(item.amountCents)} 元`}</Text>
          {!!item.missingInputs.length && <Text className="workflow-muted">待补：{item.missingInputs.map(title).join('、')}</Text>}</View>)}<Text className="workflow-total">{calculation.totalCents === undefined ? '输入未齐，不提供总额' : `所选项目合计 ¥${yuan(calculation.totalCents)}`}</Text></>}
        <View className="workflow-button secondary" onClick={() => void act(() => workflowApi.calculate(caseId))}><Text>核算已确认输入</Text></View>
      </View>
      <View className="workflow-card"><Text className="workflow-card-title">文书与审核</Text>
        {workspace.runs.slice(-1).map(run => <Text key={run.id} className="workflow-label">{statuses[run.status]}{run.safeErrorCode ? ' · 请核对信息后重试' : ''}</Text>)}
        {workspace.runs.slice(-1).filter(run => run.status === 'failed').map(run => <Text key={run.id} className="workflow-choice" onClick={() => void act(() => workflowApi.retry(caseId,run.id))}>核对信息后重新运行</Text>)}
        {reportNotification.enabled && <Button className="workflow-notification-button" loading={reportNotification.isSubscribing} disabled={reportNotification.isSubscribing || Boolean(reportNotification.subscriptionId)} onClick={() => void reportNotification.subscribe()}>
          {reportNotification.subscriptionId ? '已开启本次微信提醒' : '分析完成后微信提醒我'}
        </Button>}
        <View className="workflow-button" onClick={() => {
          const subscriptionId = reportNotification.subscriptionId
          void act(async () => {
            await workflowApi.generate(caseId, subscriptionId || undefined)
            if (subscriptionId) reportNotification.clearSubscription()
          })
        }}><Text>生成报告、证据目录与行动计划</Text></View>
        {activeDocuments.map(doc => <View key={doc.id} className="workflow-document"><Text className="workflow-document-title">{documentTitles[doc.type]} · v{doc.version}</Text><Text className="workflow-label">{statuses[doc.status]}</Text>
          {doc.sections.map((section,index) => <View key={index}><Text className="workflow-section-title">{section.title}</Text>{section.paragraphs.map((paragraph,n) => <Text key={n} className="workflow-body">{paragraph}</Text>)}</View>)}
          {doc.status === 'draft' && !workspace.reviews.some(task => task.documentId === doc.id && task.status === 'returned') && <View className="workflow-button secondary" onClick={() => void act(async () => {
            const userId = useAppStore.getState().user?.id
            if (!userId || !await ensureReviewConsent(userId)) throw new Error('尚未同意人工复核')
            if (useAppStore.getState().currentCase?.id !== caseId || useAppStore.getState().user?.id !== userId) throw new Error('案件或账号已切换，请重新操作')
            await workflowApi.confirm(caseId,doc.id)
          })}><Text>已核对草稿，确认并继续</Text></View>}
          {workspace.reviews.filter(task => task.documentId === doc.id).map(task => <View key={task.id} className="workflow-review"><Text>人工复核：{statuses[task.status]}</Text><Text className="workflow-muted">目标处理时间：{new Date(task.dueAt).toLocaleString('zh-CN')}；超时可联系服务支持，系统不会自动批准。</Text>{task.note && <Text className="workflow-body">审核意见：{task.note}</Text>}{task.returnItems?.map((item,n) => <Text key={n} className="workflow-body">待修改：{item}</Text>)}{task.status === 'returned' && <Text className="workflow-choice" onClick={() => void act(async () => { await workflowApi.revise(caseId,doc.id); await workflowApi.generate(caseId) })}>核对退回事项后生成新版本</Text>}</View>)}
        </View>)}
        {!!workspace.documents.filter(doc => doc.status === 'stale').length && <Text className="workflow-muted">输入或规则更新后，旧版本已失效。请生成当前版本。</Text>}
      </View>
      {!!workspace.legalReferences.length && <View className="workflow-card"><Text className="workflow-card-title">法律依据与来源</Text>{workspace.legalReferences.map(ref => <View key={ref.id} className="workflow-row"><Text className="workflow-section-title">{ref.title} · {ref.articleNumber}</Text><Text className="workflow-body">{ref.content}</Text><Text className="workflow-muted">适用日期：{ref.from} 至 {ref.to || '未设截止日期'}</Text><Text className="workflow-choice" onClick={() => void Taro.setClipboardData({data:ref.sourceUrl})}>复制官方来源链接</Text></View>)}</View>}
    </>}
  </View>
}
