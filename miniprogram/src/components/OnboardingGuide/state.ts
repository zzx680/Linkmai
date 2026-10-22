export const GUIDE_STORAGE_KEY = 'linkmai-onboarding-v1'
export type GuideId = 'login' | 'create-case' | 'describe' | 'upload'
export interface GuideProgress { skipped: boolean; seen: GuideId[] }
const guideIds: GuideId[] = ['login', 'create-case', 'describe', 'upload']

export function readGuideProgress(value: unknown): GuideProgress {
  const data = value && typeof value === 'object' ? value as Partial<GuideProgress> : {}
  return {
    skipped: data.skipped === true,
    seen: Array.isArray(data.seen) ? data.seen.filter((id): id is GuideId => guideIds.includes(id)) : []
  }
}

export interface TargetRect { left: number; top: number; width: number; height: number }

// Selector-query coordinates are viewport pixels, including after page scrolling.
export function placeGuide(target: TargetRect, viewport: { width: number; height: number }) {
  const { width, height } = viewport
  if (width < 280 || ![width, height, target.left, target.top, target.width, target.height].every(Number.isFinite)
    || target.width <= 0 || target.height <= 0 || target.top < 8 || target.top + target.height > height - 8) return null
  const left = Math.max(8, target.left - 6)
  const right = Math.min(width - 8, target.left + target.width + 6)
  if (right <= left) return null
  const hole = { left, top: target.top - 6, width: right - left, height: target.height + 12 }
  const before = hole.top - 16
  const after = height - hole.top - hole.height - 16
  const above = before >= after
  const available = above ? before : after
  // Do not block a landscape / split-screen viewport that cannot fit the guide.
  if (available < 236) return null
  const cardHeight = 220
  const gap = Math.min(76, available - cardHeight)
  const cardWidth = Math.min(344, width - 32)
  return {
    hole, above, showPointer: gap >= 54,
    card: { left: (width - cardWidth) / 2, top: above ? hole.top - gap - cardHeight : hole.top + hole.height + gap, width: cardWidth, height: cardHeight }
  }
}
