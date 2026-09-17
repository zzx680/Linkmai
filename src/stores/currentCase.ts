import Taro from '@tarojs/taro'
import { create } from 'zustand'
import { CurrentCase, ReportSummary } from '../types/domain'

const CASE_STORAGE_KEY = 'lingmai.current-case'
const REPORT_STORAGE_KEY = 'lingmai.current-report'

function readStorage<T>(key: string): T | null {
  try {
    return Taro.getStorageSync(key) || null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    Taro.setStorageSync(key, value)
  } catch {
    // Storage can be unavailable before the mini program runtime is ready.
  }
}

function removeStorage(key: string) {
  try {
    Taro.removeStorageSync(key)
  } catch {
    // Keep the in-memory state usable if storage is unavailable.
  }
}

interface CurrentCaseState {
  currentCase: CurrentCase | null
  report: ReportSummary | null
  setCurrentCase: (currentCase: CurrentCase) => void
  setReport: (report: ReportSummary) => void
  clearCurrentCase: () => void
}

export const useCurrentCaseStore = create<CurrentCaseState>((set) => ({
  currentCase: readStorage<CurrentCase>(CASE_STORAGE_KEY),
  report: readStorage<ReportSummary>(REPORT_STORAGE_KEY),
  setCurrentCase: (currentCase) => {
    writeStorage(CASE_STORAGE_KEY, currentCase)
    set({ currentCase })
  },
  setReport: (report) => {
    writeStorage(REPORT_STORAGE_KEY, report)
    set({ report })
  },
  clearCurrentCase: () => {
    removeStorage(CASE_STORAGE_KEY)
    removeStorage(REPORT_STORAGE_KEY)
    set({ currentCase: null, report: null })
  },
}))

export const demoCase: CurrentCase = {
  id: 'LM-DEMO-001',
  title: '城区路口 · 追尾事故',
  accidentType: '机动车追尾',
  updatedAt: '刚刚更新',
  status: 'ready',
  statusLabel: '报告已完成',
  materialCount: 4,
  materialProgress: '4 份材料已核对',
  liability: '对方主要责任',
  compensation: '¥8,500 — ¥11,800',
  hasReport: true,
}

export const demoReport: ReportSummary = {
  liability: {
    conclusion: '基于现有材料，对方承担主要责任的可能性较高。',
    confidence: '参考置信度：较高',
    basis: '交警认定书 + 碰撞位置照片 + 维修报价',
  },
  compensation: {
    range: '¥8,500 — ¥11,800',
    items: [
      { label: '车辆维修费', amount: '¥7,200 — ¥10,000', note: '以最终定损单为准' },
      { label: '交通替代费', amount: '¥500 — ¥1,000', note: '需保留实际凭证' },
      { label: '误工损失', amount: '待补充', note: '需要收入与误工证明' },
    ],
  },
  missingMaterials: ['维修发票或最终定损单', '误工证明（如主张误工损失）'],
  nextSteps: ['确认维修项目与金额', '向对方保险公司提交材料', '协商不成时咨询合作律所'],
  needsReview: false,
}
