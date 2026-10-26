/* Session token stays in memory and is cleared on logout. All business text is inserted as textContent. */
let token = '', role = '', members = []
const el = id => document.getElementById(id)
const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e }
const labels = { pending:'待分配/待查看', in_review:'审核中', returned:'已退回', approved:'已批准', stale:'已失效', cancelled:'已取消' }
const fieldLabels = { accident_date:'事故日期',jurisdiction:'事故地区',injury_severity:'伤情',has_liability_document:'是否已有事故认定书',risk_screened:'用户填写的风险核对结果',medical_expense_cents:'医疗费',lost_income_daily_cents:'误工日收入',lost_work_days:'误工天数',nursing_daily_cents:'每日护理标准',nursing_days:'护理天数',nursing_people:'护理人数',transportation_expense_cents:'交通费',hospital_days:'住院天数',nutrition_days:'营养期天数',vehicle_damage_cents:'车辆损失',meals_daily_cents:'住院伙食日标准',nutrition_daily_cents:'营养费日标准',claim_medical:'主张医疗费',claim_lost_income:'主张误工费',claim_nursing:'主张护理费',claim_transportation:'主张交通费',claim_meals:'主张住院伙食费',claim_nutrition:'主张营养费',claim_vehicle:'主张车辆损失' }
const riskLabels = { SERIOUS_INJURY:'严重伤情',CRIMINAL_RISK:'涉嫌刑事风险',SPECIAL_OR_DEADLINE_RISK:'特殊主体或期限风险',INJURY_SEVERITY_UNCONFIRMED:'伤情需复核',RISK_SCREENING_REQUIRED:'需人工风险筛查',OFFICIAL_FINDING_MISSING:'需核对事故认定书',CALCULATION_INCOMPLETE:'计算输入不完整',AMOUNT_EVIDENCE_REQUIRED:'费用依据需复核',LARGE_AMOUNT:'较大金额' }
const fieldLabel = key => fieldLabels[key] || key
const money = cents => `${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')} 元`
const factValue = fact => fact.key.endsWith('_cents') && /^\d+$/.test(fact.value) ? money(Number(fact.value)) : ({yes:'是',no:'否',none:'无人受伤',minor:'轻微伤情',serious:'严重伤情',unknown:'尚未确定'}[fact.value] || fact.value)
async function api(path, data) {
  const response = await fetch(`/api/review${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) }, ...(data === undefined ? {} : { body:JSON.stringify(data) }) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || '请求未完成')
  return body.data
}
async function run(fn) { el('error').textContent=''; try { await fn() } catch(e) { el('error').textContent=e.message || '操作失败' } }
function button(text, action, secondary = false) { const b=node('button',text,secondary ? 'secondary':''); b.onclick=()=>run(async()=>{ b.disabled=true; try { await action() } finally { b.disabled=false } }); return b }
el('loginForm').onsubmit=e=>{ e.preventDefault(); run(async()=>{ const result=await api('/login',{email:el('email').value,password:el('password').value}); token=result.token; role=result.reviewer.role; el('password').value=''; el('login').hidden=true; el('app').hidden=false; el('logout').hidden=false; el('admin').hidden=role!=='review_admin'; await refresh() }) }
el('logout').onclick=()=>{ token=''; location.reload() }
el('refresh').onclick=()=>run(refresh)
async function refresh() {
  if (role==='review_admin') {
    members=await api('/members'); el('members').replaceChildren()
    members.forEach(member=>{ const row=node('div',undefined,'row'); row.append(node('span',`${member.email} · ${member.role} · ${member.active?'有效':'停用'}　`)); if(member.role==='reviewer') row.append(button(member.active?'停用':'启用',async()=>{await api(`/members/${member.id}/status`,{active:!member.active});await refresh()},true)); el('members').append(row) })
    const policies=await api('/policies'); el('legal').replaceChildren()
    policies.legal.forEach(ref=>{ const label=node('label',undefined,'law'), check=node('input'); check.type='checkbox';check.value=ref.id;check.disabled=!ref.approved||!ref.active; label.append(check,node('span',`${ref.id} · ${ref.from} · ${ref.approved?'已审核':'待审核'}`));el('legal').append(label) })
    el('legalDocuments').replaceChildren();const documents=new Map(policies.legal.map(ref=>[ref.documentId,ref]));documents.forEach(ref=>{const row=node('div',undefined,'row');row.append(node('span',`${ref.documentId} · ${ref.approved?'已审核':'待审核/已拒绝'}　`),button('查看原文与审核',()=>openLegal(ref.documentId),true));el('legalDocuments').append(row)})
    el('parameters').replaceChildren(); policies.parameters.forEach(p=>{const row=node('div',`${p.id} · ${p.jurisdiction} · ${p.value} 分/日 · ${p.status}　`,'row');if(p.status==='approved')row.append(button('撤销参数',async()=>{await api(`/parameters/${p.id}/retire`,{});await refresh()},true));el('parameters').append(row)})
  }
  const tasks=await api('/queue'); el('queue').replaceChildren()
  if(!tasks.length)el('queue').append(node('p','暂无分配给你的审核任务。'))
  tasks.forEach(task=>{const row=node('div',undefined,'row');row.append(node('span',labels[task.status]||task.status,'badge'),node('div',`案件 ${task.caseId}`,'muted'),node('div',`输入版本 ${task.inputRevision} · ${task.overdue?'已超目标时间，请人工跟进':new Date(task.dueAt).toLocaleString()}`,'muted'))
    if(role==='review_admin'&&['pending','in_review'].includes(task.status)){const select=node('select'); members.filter(m=>m.role==='reviewer'&&m.active).forEach(m=>{const option=node('option',m.email);option.value=m.id;select.append(option)});row.append(select,button('分配/改派',async()=>{await api(`/tasks/${task.caseId}/${task.id}/assign`,{reviewerId:select.value});await refresh()}))}
    if(role==='reviewer'&&['pending','in_review'].includes(task.status)) row.append(button('查看审核资料',()=>openTask(task),true));el('queue').append(row)})
}
async function openTask(task) {
  const result=await api(`/tasks/${task.caseId}/${task.id}/open`,{})
  const detail=el('detail');detail.replaceChildren(node('h2',`案件草稿 v${result.document.version}`),node('p',`复核事项：${task.reasonCodes.map(code=>riskLabels[code]||code).join('、')}`))
  result.document.sections.forEach(section=>{detail.append(node('h3',section.title));section.paragraphs.forEach(p=>detail.append(node('p',p)))})
  detail.append(node('h3','事实与证明来源'))
  result.facts.forEach(fact=>{const row=node('div',undefined,'row');row.append(node('strong',fieldLabels[fact.key]||fact.label),node('div',factValue(fact)),node('div',`${fact.source==='material'?'已确认材料':'用户陈述'} · ${fact.evidenceRefs.length?`${fact.evidenceRefs.length} 项材料引用`:'待凭证复核'}`,'muted'));detail.append(row)})
  if(result.calculation){const calculation=result.calculation;detail.append(node('h3','计算明细'),node('p',`损失项目合计：${calculation.totalCents===undefined?'输入不全，未计算':money(calculation.totalCents)}；${calculation.status==='complete'?'字段齐备，仍需核对原始凭证':calculation.status==='incomplete'?'需补齐输入':'费用依据需复核'}`));calculation.items.forEach(item=>{const row=node('div',undefined,'row');row.append(node('strong',item.label),node('div',item.amountCents===undefined?'输入不全，未计算':money(item.amountCents)),node('div',`计算项：${item.formula.split(' × ').map(fieldLabel).join(' × ')}`,'muted'));if(item.missingInputs.length)row.append(node('div',`待补充：${item.missingInputs.map(fieldLabel).join('、')}`,'muted'));detail.append(row)})}
  const references=node('details'),summary=node('summary','查看引用标识与规则版本');references.append(summary,node('pre',JSON.stringify({facts:result.facts.map(f=>({id:f.id,evidenceRefs:f.evidenceRefs})),evidence:result.evidence,calculatorVersion:result.calculation?.calculatorVersion,inputRevision:result.document.inputRevision},null,2)));detail.append(references)
  const sourceIds=new Set()
  result.evidence.forEach(evidence=>{if(sourceIds.has(evidence.sourceId))return;sourceIds.add(evidence.sourceId);const row=node('div',undefined,'row');row.append(button('获取原始材料（5分钟有效）',async()=>{const access=await api(`/tasks/${task.caseId}/${task.id}/evidence/${evidence.id}`);const link=node('a','打开原始材料');link.href=access.url;link.target='_blank';link.rel='noopener noreferrer';row.replaceChildren(link)},true));detail.append(row)})
  detail.append(node('h3','适用法律来源'))
  result.legal.forEach(ref=>{const section=node('div',undefined,'row'),link=node('a',`${ref.title} · ${ref.articleNumber}`);link.href=ref.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';section.append(link,node('p',ref.content),node('div',`生效区间 ${ref.effectiveFrom} 至 ${ref.effectiveTo||'未设截止'} · 来源校验 ${ref.sourceHash}`,'muted'));detail.append(section)})
  if(result.previous){detail.append(node('h3','版本变化'));if(!result.changes.length)detail.append(node('p','本次文书正文未变化，仍需核对当前输入及资料。'));result.changes.forEach(change=>{detail.append(node('h3',change.title),node('pre',`上版：\n${change.before.join('\n')}\n\n本版：\n${change.after.join('\n')}`))});detail.append(node('h3',`上一版本 v${result.previous.version}`),node('pre',JSON.stringify(result.previous.sections,null,2)))}
  const note=node('textarea');note.placeholder='审核意见（必填）';const returns=node('textarea');returns.placeholder='退回修改项，每行一项';detail.append(note,returns)
  detail.append(button('批准此版本',async()=>{if(!confirm('确认已核对事实、依据、计算和风险，批准当前版本？'))return;await api(`/tasks/${task.caseId}/${task.id}/approve`,{note:note.value});detail.replaceChildren(node('p','该版本已批准'));await refresh()}),button('退回修改',async()=>{await api(`/tasks/${task.caseId}/${task.id}/return`,{note:note.value,returnItems:returns.value.split('\n').map(v=>v.trim()).filter(Boolean)});detail.replaceChildren(node('p','已退回，用户修改后生成新版本重新审核'));await refresh()},true))
}
el('memberForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/members',{email:el('memberEmail').value,password:el('memberPassword').value});el('memberPassword').value='';await refresh()})}
const legalRefs=()=>Array.from(document.querySelectorAll('#legal input:checked')).map(input=>input.value)
el('publish').onclick=()=>run(async()=>{await api('/calculator/publish',{version:'compensation-v1',legalRefs:legalRefs()});await refresh()})
el('parameterForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api('/parameters',{id:el('parameterId').value,version:el('parameterVersion').value,code:el('parameterCode').value,jurisdiction:el('jurisdiction').value,from:el('from').value,...(el('to').value?{to:el('to').value}:{}),value:Number(el('parameterValue').value),legalRefs:legalRefs()});await refresh()})}

el('legalImportForm').onsubmit=e=>{e.preventDefault();run(async()=>{let input;try{input=JSON.parse(el('legalImport').value)}catch{throw new Error('法规 JSON 格式无效')}await api('/legal/import',input);el('legalImport').value='';await refresh()})}
async function openLegal(documentId){const data=await api(`/legal/${encodeURIComponent(documentId)}/source`),section=el('legalSource');section.replaceChildren(node('h3',documentId),node('pre',data.sourceText||'此资料来自原有法规库，未存档完整原文；请核验下列官方来源和条文。'));data.sections.forEach(ref=>{const link=node('a',`${ref.title} · ${ref.articleNumber}`);link.href=ref.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';section.append(link,node('p',ref.content),node('p',`版本 ${ref.version} · ${ref.effectiveFrom} 至 ${ref.effectiveTo||'未设截止'} · ${ref.sourceHash}`,'muted'))});section.append(button('核实后批准启用',async()=>{await api(`/legal/${encodeURIComponent(documentId)}/review`,{approved:true,active:true});section.replaceChildren(node('p','已审核启用'));await refresh()}),button('撤销使用',async()=>{await api(`/legal/${encodeURIComponent(documentId)}/review`,{approved:false,active:false});section.replaceChildren(node('p','已撤销使用，相关产物将失效'));await refresh()},true))}
