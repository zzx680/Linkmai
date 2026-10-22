declare const __API_BASE__: string
declare const __IS_H5__: boolean
declare const __VOICE_INPUT_ENABLED__: boolean

export const API_BASE = __API_BASE__
export const IS_H5 = __IS_H5__
export const VOICE_INPUT_ENABLED = __VOICE_INPUT_ENABLED__

export function getApiBase() {
  return API_BASE.replace(/\/$/, '')
}
