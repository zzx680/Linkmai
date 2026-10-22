import type { Case, ConversationState, Material } from '../../services/api'

export type HomeMode = 'loading' | 'logged_out' | 'empty' | 'load_error' | 'case'

export type HomeNextStep =
  | 'login'
  | 'retry_load'
  | 'create_case'
  | 'continue_materials'
  | 'confirm_materials'
  | 'view_processing'
  | 'view_payment_status'
  | 'view_refund_status'
  | 'unlock_full_plan'
  | 'continue_case'
  | 'view_report'
  | 'view_case'

interface HomeStateInput {
  isLoggedIn: boolean
  isLoadingCase: boolean
  caseLoadError: string | null
  currentCase: Case | null
}

export interface CaseNextStepInput {
  currentCase: Case
  materials: Material[]
  conversationState: ConversationState
}

export interface HomeStepDetail {
  action: HomeNextStep
  badge: string
  title: string
  description: string
  cta: string
  progress: number
}

export function getHomeMode({ isLoggedIn, isLoadingCase, caseLoadError, currentCase }: HomeStateInput): HomeMode {
  if (isLoadingCase && !currentCase) return 'loading'
  if (!isLoggedIn) return 'logged_out'
  if (caseLoadError) return 'load_error'
  if (!currentCase) return 'empty'
  return 'case'
}

export function getCaseNextStep({ currentCase, materials, conversationState }: CaseNextStepInput): HomeNextStep {
  const entitlement = currentCase.entitlement
  const isPaid = entitlement?.status === 'paid'
  const status = currentCase.status.toLowerCase()
  const serverAction = String(currentCase.nextAction || '')

  if (isPaid && currentCase.hasReport) return 'view_report'
  if (entitlement?.status === 'refunded') return 'view_refund_status'
  if (conversationState === 'analyzing' || /analy[sz]ing|processing/.test(status)) return 'view_processing'
  if (entitlement?.status === 'pending') return 'view_payment_status'
  if (serverAction === 'confirm_materials' || conversationState === 'confirming') return 'confirm_materials'
  if (serverAction === 'continue_materials') return 'continue_materials'
  if (serverAction === 'unlock_full_plan' || (!isPaid && conversationState === 'ready')) return 'unlock_full_plan'
  if (isPaid && serverAction === 'view_report' && currentCase.hasReport) return 'view_report'
  if (isPaid) return 'continue_case'
  if (materials.length === 0 && currentCase.materialCount === 0) return 'continue_materials'
  if (serverAction === 'continue_case') return 'continue_case'
  return 'view_case'
}

export function getHomeStepDetail(action: HomeNextStep, materialCount: number): HomeStepDetail {
  switch (action) {
    case 'continue_materials':
      return { action, badge: '补充材料', title: '先补齐关键材料', description: `已整理 ${materialCount} 份，上传材料继续分析`, cta: '继续上传材料', progress: 24 }
    case 'confirm_materials':
      return { action, badge: '待确认', title: '请确认已整理的信息', description: '核对材料识别结果后，灵迈才能据此整理责任和处理方案', cta: '检查并确认', progress: 52 }
    case 'view_processing':
      return { action, badge: '分析中', title: '正在整理案件', description: '材料和案件信息正在分析中，完成后会提示你下一步', cta: '查看处理进度', progress: 74 }
    case 'view_payment_status':
      return { action, badge: '支付确认中', title: '正在确认案件解锁状态', description: '付款结果确认后，完整处理方案会自动开放', cta: '核对支付结果', progress: 88 }
    case 'view_refund_status':
      return { action, badge: '已退款', title: '本案件的付费服务已退款', description: '查看付费记录，如有疑问可联系我们', cta: '查看付费记录', progress: 88 }
    case 'unlock_full_plan':
      return { action, badge: '可解锁', title: '案件已整理完成', description: '查看完整事故处理方案、赔偿估算和下一步行动建议', cta: '查看解锁内容', progress: 88 }
    case 'continue_case':
      return { action, badge: '已解锁', title: '继续完善完整处理方案', description: '补充案件细节或材料后，灵迈会继续更新当前案件的处理建议', cta: '继续处理案件', progress: 90 }
    case 'view_report':
      return { action, badge: '方案已就绪', title: '你的完整处理方案已准备好', description: '查看责任、赔偿与后续处理步骤，并随时回到案件继续补充信息', cta: '查看事故报告', progress: 100 }
    case 'view_case':
      return { action, badge: '案件处理中', title: '查看案件处理进度', description: '案件信息已保存，你可以继续补充材料或查看当前处理状态', cta: '查看案件', progress: 64 }
    default:
      return { action, badge: '账户登录', title: '登录后保存案件进度', description: '登录后可创建案件，并在不同设备上继续查看材料和处理进度', cta: '登录后开始', progress: 0 }
  }
}

export function getJourneyStep(action: HomeNextStep): number {
  switch (action) {
    case 'confirm_materials':
      return 1
    case 'view_processing':
    case 'view_payment_status':
    case 'view_refund_status':
    case 'unlock_full_plan':
    case 'continue_case':
      return 2
    case 'view_report':
      return 3
    default:
      return 0
  }
}
