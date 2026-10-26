import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Fact } from '../src/harness/types'

process.env.DB_TYPE = 'memory'
process.env.NODE_ENV = 'test'
const { memoryDB: db } = require('../src/db/memory') as typeof import('../src/db/memory')
const { WorkflowStore, id } = require('../src/harness/store') as typeof import('../src/harness/store')
const { HarnessService } = require('../src/harness/service') as typeof import('../src/harness/service')
const { calculate, yuanToCents, integerInput, expenseDefinitions, fingerprint } = require('../src/harness/calculator') as typeof import('../src/harness/calculator')
const { ContextBuilder, OutputValidator, RiskValidator, applicableParameters } = require('../src/harness/policy') as typeof import('../src/harness/policy')
const { coreTrafficLegalDocuments, coreTrafficLegalSections } = require('../src/legal/core-traffic-law') as typeof import('../src/legal/core-traffic-law')
const store = new WorkflowStore(false)
const service = new HarnessService(store)
const fact = (key: string, value: string, evidenceRefs: string[] = []): Fact => ({ id: id(), key, label: key, value, evidenceRefs, status: 'confirmed', source: 'user', sourceId: 'user', revision: 1 })
const scopes = () => expenseDefinitions.map(d => fact(`claim_${d.code}`, 'no'))
const version = { id: 'compensation-v1', status: 'approved' as const, legalRefs: ['cn-civil-code-2021-art-1179'], reviewedBy: 'lawyer' }
const calc = (facts: Fact[], parameters: any[] = []) => calculate({ id:'calc', revision:1, contextHash:'ctx', facts, parameters, jurisdiction:'CN-ZJ-HZ', accidentDate:'2026-10-20', version })

test('integer cents, explicit scope, missing inputs and formula boundaries', () => {
  assert.equal(yuanToCents('0.01'), 1); assert.equal(yuanToCents('100.10'), 10010)
  for (const bad of ['-1','0.001','1e3','1,000','NaN']) assert.throws(() => yuanToCents(bad))
  assert.throws(() => integerInput('1.5'))
  assert.equal(calc([]).totalCents, undefined)
  assert.equal(calc(scopes()).totalCents, 0)
  const facts = scopes().filter(f => f.key !== 'claim_nursing').concat(fact('claim_nursing','yes'),fact('nursing_daily_cents','12001'),fact('nursing_days','3'),fact('nursing_people','2'))
  const result = calc(facts)
  assert.equal(result.totalCents, 72006); assert.equal(result.status, 'requires_review')
  assert.throws(() => calc(facts.map(f => f.key === 'nursing_days' ? {...f,value:'3.2'} : f)), /INVALID_CALCULATION_INPUT/)
  assert.throws(() => calc(facts.map(f => f.key === 'nursing_daily_cents' ? {...f,value:'999999999999'} : f).map(f => f.key === 'nursing_days' ? {...f,value:'36500'} : f)), /CALCULATION_OVERFLOW/)
  const meals = scopes().filter(f => f.key !== 'claim_meals').concat(fact('claim_meals','yes'),fact('hospital_days','3'))
  assert.deepEqual(calc(meals).missingInputs, ['meals_daily_cents'])
  const p = {id:'p', code:'meals_daily_cents', status:'approved', jurisdiction:'CN-ZJ-HZ', from:'2026-01-01', value:5000}
  assert.equal(calc(meals,[p]).totalCents,15000)
  assert.equal(calc(meals,[{...p,from:'2026-11-01'}]).totalCents,undefined)
  assert.equal(calc(meals,[{...p,jurisdiction:'CN-JS'}]).totalCents,undefined)
  assert.equal(calc(meals,[p,{...p,id:'p2'}]).totalCents,undefined)
})

async function fixture() {
  await db.upsertLegalCorpus(coreTrafficLegalDocuments, coreTrafficLegalSections)
  const admin = id(), lawyer = id(), other = id()
  await store.control(c => {
    c.calculators = [version]; c.parameters = []
    c.reviewers.push(...[{id:admin,role:'review_admin' as const},{id:lawyer,role:'reviewer' as const},{id:other,role:'reviewer' as const}].map(r => ({...r,email:`${r.id}@example.test`,passwordHash:'not-a-real-password',active:true})))
  })
  const user = await db.createUser(`workflow-${id()}`)
  const item = await db.createCase(user.id, '测试案件')
  const entitlement = await db.getOrCreateCaseEntitlement(user.id,item.id); entitlement.status = 'paid'
  await db.persistConfirmedFacts(user.id,item.id,[
    ['accident_date','2026-10-20'],['jurisdiction','CN-ZJ-HZ'],['injury_severity','minor'],['risk_screened','yes'],['has_liability_document','yes'],
    ...expenseDefinitions.map(d => [`claim_${d.code}`,'no'])
  ].map(([key,value]) => ({key,label:key,value,source:'user_text'})))
  return {userId:user.id, caseId:item.id, admin,lawyer,other,entitlement}
}
async function generate(f: Awaited<ReturnType<typeof fixture>>) {
  const run = await service.enqueue(f.userId,f.caseId)
  const claim = await service.claim(f.userId,f.caseId,'test-worker'); assert.ok(claim)
  await service.complete(f.userId,f.caseId,run.runId,claim.run.leaseToken!)
  return (await service.get(f.userId,f.caseId)).documents.find(d => d.type === 'case_report' && d.status === 'draft')!
}

test('worker idempotency, concurrent claim, crash recovery and fencing', async () => {
  const f = await fixture(), now = Date.now()
  const one = await service.enqueue(f.userId,f.caseId,now), two = await service.enqueue(f.userId,f.caseId,now)
  assert.equal(one.runId,two.runId)
  const claims = await Promise.all(Array.from({length:8},(_,i) => service.claim(f.userId,f.caseId,`worker-${i}`,now)))
  assert.equal(claims.filter(Boolean).length,1)
  const original = claims.find(Boolean)!
  const recovered = await service.claim(f.userId,f.caseId,'recovery',now+31000); assert.ok(recovered)
  await assert.rejects(service.complete(f.userId,f.caseId,one.runId,original.run.leaseToken!,now+31001),/LEASE_LOST/)
  await service.complete(f.userId,f.caseId,one.runId,recovered.run.leaseToken!,now+31002)
  await assert.rejects(service.complete(f.userId,f.caseId,one.runId,recovered.run.leaseToken!,now+31003),/LEASE_LOST/)
  const state = await service.get(f.userId,f.caseId)
  assert.equal(state.documents.length,3); assert.equal(state.runs[0].attemptCount,2)
  assert.equal('leaseToken' in state.runs[0],false)
})

test('candidate facts stay excluded; conflicts need explicit resolution; ownership is checked', async () => {
  const f = await fixture()
  const candidate = await service.propose(f.userId,f.caseId,{key:'accident_date',label:'事故日期',value:'2026-10-21',evidenceRefs:[]})
  assert.equal((await service.calculate(f.userId,f.caseId)).accidentDate,'2026-10-20')
  await service.decideFact(f.userId,f.caseId,candidate.id,'confirm')
  await assert.rejects(service.enqueue(f.userId,f.caseId),/FACT_CONFLICT/)
  const conflict = (await service.get(f.userId,f.caseId)).conflicts.find(c => c.status === 'open')!
  await service.resolve(f.userId,f.caseId,conflict.id,candidate.id)
  assert.equal((await service.calculate(f.userId,f.caseId)).accidentDate,'2026-10-21')
  await assert.rejects(service.propose(f.userId,f.caseId,{key:'test',label:'测试',value:'x',evidenceRefs:['another-case-reference']}),/INVALID_REFERENCE/)
  await assert.rejects(service.get('another-user',f.caseId),/CASE_NOT_FOUND/)
  assert.ok((await store.casesForWork()).every(entry => entry.caseId !== f.caseId || entry.userId === f.userId))
})

test('review assignment, return, new version, approval and audit privacy', async () => {
  const f = await fixture(), document = await generate(f)
  await assert.rejects(service.confirm(f.userId,f.caseId,document.id),/REVIEW_CONSENT_REQUIRED/)
  const confirmed = await service.confirm(f.userId,f.caseId,document.id,'review-v1')
  assert.equal(confirmed.status,'lawyer_review')
  await assert.rejects(service.approved(f.userId,f.caseId,document.id),/DOCUMENT_NOT_APPROVED/)
  const taskId = confirmed.reviewTaskId!
  await service.reviewAction(f.admin,f.caseId,taskId,'assign',{reviewerId:f.lawyer})
  await assert.rejects(service.reviewAction(f.other,f.caseId,taskId,'open',{}),/REVIEWER_FORBIDDEN/)
  await assert.rejects(service.reviewAction(f.admin,f.caseId,taskId,'approve',{note:'不能代审'}),/REVIEWER_FORBIDDEN/)
  await service.reviewAction(f.lawyer,f.caseId,taskId,'open',{})
  await service.reviewAction(f.lawyer,f.caseId,taskId,'return',{note:'核对票据原件',returnItems:['核对所有费用']})
  await assert.rejects(service.confirm(f.userId,f.caseId,document.id,'review-v1'),/NEW_DOCUMENT_VERSION_REQUIRED/)
  await service.revise(f.userId,f.caseId,document.id)
  const next = await generate(f); assert.equal(next.version,2); assert.equal(next.supersedesId,document.id)
  const v2 = await service.confirm(f.userId,f.caseId,next.id,'review-v1')
  await service.reviewAction(f.admin,f.caseId,v2.reviewTaskId!,'assign',{reviewerId:f.lawyer})
  const opened = await service.reviewAction(f.lawyer,f.caseId,v2.reviewTaskId!,'open',{})
  assert.ok('previous' in opened && opened.previous?.id === document.id)
  await service.reviewAction(f.lawyer,f.caseId,v2.reviewTaskId!,'approve',{note:'人工核对通过'})
  assert.equal((await service.approved(f.userId,f.caseId,next.id)).status,'approved')
  await store.transaction(f.userId,f.caseId,state => {
    assert.ok(state.events.some(e => e.code === 'REVIEW_APPROVED'))
    assert.equal(JSON.stringify(state.events).includes('人工核对通过'),false)
  })
})

test('disabled reviewer, refund, changed input and retired policy cannot publish', async () => {
  const f = await fixture(), document = await generate(f)
  const confirmed = await service.confirm(f.userId,f.caseId,document.id,'review-v1'), task = confirmed.reviewTaskId!
  await service.reviewAction(f.admin,f.caseId,task,'assign',{reviewerId:f.lawyer})
  await service.reviewAction(f.lawyer,f.caseId,task,'open',{})
  await store.control(c => { c.reviewers.find(r => r.id === f.lawyer)!.active = false })
  await assert.rejects(service.reviewAction(f.lawyer,f.caseId,task,'approve',{note:'x'}),/REVIEWER_FORBIDDEN/)
  await store.control(c => { c.reviewers.find(r => r.id === f.lawyer)!.active = true })
  f.entitlement.status = 'refunded'
  await assert.rejects(service.reviewAction(f.lawyer,f.caseId,task,'open',{}),/PAYMENT_REQUIRED/)
  await assert.rejects(service.reviewAction(f.admin,f.caseId,task,'assign',{reviewerId:f.other}),/PAYMENT_REQUIRED/)
  await assert.rejects(service.reviewAction(f.lawyer,f.caseId,task,'approve',{note:'x'}),/PAYMENT_REQUIRED/)
  assert.equal((await service.get(f.userId,f.caseId)).documents.length,0)
  f.entitlement.status = 'paid'
  await db.persistConfirmedFacts(f.userId,f.caseId,[{key:'location',label:'地点',value:'新地点',source:'user_text'}])
  await assert.rejects(service.reviewAction(f.lawyer,f.caseId,task,'approve',{note:'x'}),/INPUT_STALE/)
  assert.ok((await service.get(f.userId,f.caseId)).documents.every(d => d.status === 'stale'))
  const next = await generate(f)
  await store.control(c => { c.calculators[0].status = 'retired' })
  await assert.rejects(service.confirm(f.userId,f.caseId,next.id,'review-v1'),/INPUT_STALE/)
  assert.ok((await service.get(f.userId,f.caseId)).documents.every(d => d.status === 'stale'))
})

test('user-editable material fields cannot waive human risk screening', () => {
  const materialFacts = [fact('injury_severity','minor'), ...['risk_screened','has_liability_document'].map(key => ({
    ...fact(key,'yes',['uploaded-field']), source: 'material' as const,
  }))]
  const calculation = calc(scopes())
  assert.equal(calculation.status,'complete')
  assert.ok(RiskValidator.check(materialFacts,calculation).includes('RISK_SCREENING_REQUIRED'))
})

test('validators detect tampering; context masks private data; parameters require effective legal refs', async () => {
  const f = await fixture(), document = await generate(f)
  await store.transaction(f.userId,f.caseId,(state,_sources,control) => {
    const calculation = state.calculations[0]
    assert.throws(() => OutputValidator.validate({...document, sections:[{title:'伪造金额',paragraphs:['赔偿999万元']}]},state,calculation),/DOCUMENT_TAMPERED/)
    assert.throws(() => OutputValidator.validate({...document,factRefs:['fabricated']},state,calculation),/INVALID_REFERENCE/)
    state.facts.push(fact('contact_phone','13812345678'),fact('name_note','证件110101199001011234'))
    const context = ContextBuilder.build(state)
    assert.ok(!JSON.stringify(context.displayFacts).includes('13812345678'))
    assert.ok(!JSON.stringify(context.displayFacts).includes('110101199001011234'))
    state.facts.find(f => f.key === 'accident_date')!.value = '2026-99-20'
    assert.throws(() => ContextBuilder.build(state),/ACCIDENT_DATE_REQUIRED/)
    control.parameters = [{id:'p',version:'v1',code:'meals_daily_cents',jurisdiction:'CN-ZJ-HZ',from:'2026-01-01',value:5000,legalRefs:['expired'],status:'approved',reviewedBy:f.admin}]
    assert.equal(applicableParameters(control,'2026-10-20','CN-ZJ-HZ').length,0)
  })
})

test('normal user tokens cannot enter the independent review domain', async () => {
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken')
  const { config } = require('../src/config') as typeof import('../src/config')
  const { reviewerAuth } = require('../src/harness/auth') as typeof import('../src/harness/auth')
  process.env.REVIEW_JWT_SECRET = 'review-domain-test-secret-with-32-characters'
  let status = 0, called = false
  await reviewerAuth({headers:{authorization:`Bearer ${jwt.sign({sub:'user'},config.jwtSecret)}`}} as any,
    {status(code: number) {status=code;return this},json() {return this}} as any, () => {called=true})
  assert.equal(status,401); assert.equal(called,false)
})

test('bounded retries need an explicit new revision after exhaustion', async () => {
  const f=await fixture(), now=Date.now(), run=await service.enqueue(f.userId,f.caseId,now)
  for(let attempt=0;attempt<3;attempt++){
    const claimed=await service.claim(f.userId,f.caseId,'failing-worker',now+attempt*10000);assert.ok(claimed)
    await service.fail(f.userId,f.caseId,run.runId,claimed.run.leaseToken!,now+attempt*10000+1)
  }
  assert.equal((await service.get(f.userId,f.caseId)).runs[0].status,'failed')
  assert.equal(await service.claim(f.userId,f.caseId,'worker',now+40000),null)
  const before=(await service.get(f.userId,f.caseId)).revision
  await service.retry(f.userId,f.caseId,run.runId)
  assert.equal((await service.get(f.userId,f.caseId)).revision,before+1)
  assert.notEqual((await service.enqueue(f.userId,f.caseId)).runId,run.runId)
})

test('seed loading cannot restore revoked legal sources', async () => {
  await db.upsertLegalCorpus(coreTrafficLegalDocuments.map(d=>({...d,status:'repealed' as const,reviewStatus:'rejected' as const})),coreTrafficLegalSections)
  await db.upsertLegalCorpus(coreTrafficLegalDocuments,coreTrafficLegalSections,{insertOnly:true})
  const reference=(await db.getLegalReferences([coreTrafficLegalSections[0].legalRefId]))[0]
  assert.equal(reference.status,'repealed');assert.equal(reference.reviewStatus,'rejected')
  // Restore the fixture registry for later cases in this isolated test process.
  await db.upsertLegalCorpus(coreTrafficLegalDocuments,coreTrafficLegalSections)
})

test('JSONB object key normalization preserves fingerprints and approved publication', async () => {
  assert.equal(fingerprint({a:1,b:{c:2,d:3}}),fingerprint({b:{d:3,c:2},a:1}))
  const f=await fixture(), document=await generate(f)
  await store.transaction(f.userId,f.caseId,state=>{
    const reverse=(value:any):any=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reverse(value[key])])):value
    Object.assign(state,reverse(JSON.parse(JSON.stringify(state))))
  })
  const confirmed=await service.confirm(f.userId,f.caseId,document.id,'review-v1')
  await service.reviewAction(f.admin,f.caseId,confirmed.reviewTaskId!,'assign',{reviewerId:f.lawyer})
  await service.reviewAction(f.lawyer,f.caseId,confirmed.reviewTaskId!,'open',{})
  await service.reviewAction(f.lawyer,f.caseId,confirmed.reviewTaskId!,'approve',{note:'序列化后复核'})
  assert.equal((await service.approved(f.userId,f.caseId,document.id)).status,'approved')
})

test('workflow HTTP contracts preserve pending confirmation and validate management inputs', async () => {
  const {caseWorkflowRouter,reviewRouter,harnessEnabled}=require('../src/harness/routes') as typeof import('../src/harness/routes')
  const reports=require('../src/routes/reports').default
  const f=await fixture()
  async function invoke(router:any,path:string,method:string,body:any={},params:any={},extra:any={}){
    const route=router.stack.find((item:any)=>item.route?.path===path&&item.route.methods[method]).route
    let status=200,payload:any
    const response={status(code:number){status=code;return this},json(value:any){payload=value;return this}}
    await route.stack[route.stack.length-1].handle({body,params,userId:f.userId,reviewerId:f.admin,...extra},response,()=>undefined)
    return {status,...payload}
  }
  let gateStatus=0
  const gateResponse={status(code:number){gateStatus=code;return this},json(){return this}}
  const previous=process.env.HARNESS_ENABLED
  try{
    delete process.env.HARNESS_ENABLED
    harnessEnabled({} as any,gateResponse as any,()=>assert.fail('disabled feature passed'))
    assert.equal(gateStatus,503)
    process.env.HARNESS_ENABLED='true'
    const generation=await invoke(reports,'/generate','post',{caseId:f.caseId})
    assert.equal(generation.status,202);assert.equal(generation.data.confirmationRequired,true)
    const latest=await invoke(reports,'/:caseId/runs/latest','get',{}, {caseId:f.caseId})
    assert.equal(latest.data.runId,generation.data.runId)
    const document=await generate(f)
    const blocked=await invoke(reports,'/:caseId','get',{}, {caseId:f.caseId})
    assert.equal(blocked.status,409)
    const consent=await invoke(caseWorkflowRouter,'/:caseId/documents/:documentId/confirm','post',{}, {caseId:f.caseId,documentId:document.id})
    assert.equal(consent.code,'REVIEW_CONSENT_REQUIRED')
    const imported=await invoke(reviewRouter,'/legal/import','post',{id:'bad-date',title:'x',authority:'x',documentType:'x',jurisdiction:'CN',sourceUrl:'https://www.gov.cn/',version:'v1',effectiveFrom:'2026-99-01',sourceText:'完整法条原文'.repeat(10),sections:[{articleNumber:'第一条',content:'完整法条原文',legalRefId:'bad-date-ref',keywords:[]}]})
    assert.equal(imported.status,400)
    const parameter={id:id(),version:'v1',code:'meals_daily_cents',jurisdiction:'CN-ZJ-HZ',from:'2026-01-01',value:5000,legalRefs:['cn-civil-code-2021-art-1179']}
    assert.equal((await invoke(reviewRouter,'/parameters','post',parameter)).status,200)
    const overlap=await invoke(reviewRouter,'/parameters','post',{...parameter,id:id()})
    assert.equal(overlap.code,'PARAMETER_OVERLAP')
  }finally{if(previous===undefined)delete process.env.HARNESS_ENABLED;else process.env.HARNESS_ENABLED=previous}
})
