import Taro from '@tarojs/taro'
import { GUIDE_STORAGE_KEY } from './state'
import { createGuideProgressStore } from './progress-store'

const store = createGuideProgressStore(
  () => Taro.getStorageSync(GUIDE_STORAGE_KEY),
  value => Taro.setStorageSync(GUIDE_STORAGE_KEY, value),
)
export const getGuideProgress = store.get
export const completeGuideSteps = store.complete
export const skipGuide = store.skip
export const subscribeGuideProgress = store.subscribe
export const restartGuide = store.restart
