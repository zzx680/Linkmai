import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { getWechatSpeechSession, prepareSpeechInput } from '../services/speech/wechat'
import { appendDictation, type SpeechSession, type SpeechState } from '../services/speech/session'

export function useSpeechInput({ userId, caseId, value, onChange }: { userId?: string; caseId?: string; value: string; onChange(value: string): void }) {
  const [state, setState] = useState<SpeechState>('idle')
  const [partial, setPartial] = useState('')
  const [seconds, setSeconds] = useState(0)
  const scope = `${userId || ''}:${caseId || ''}`
  const latest = useRef({ scope, value, onChange })
  latest.current = { scope, value, onChange }
  const session = useRef<SpeechSession>()
  const active = useRef(false)
  const pageVisible = useRef(true)
  const mounted = useRef(true)
  const revision = useRef(0)

  const cancel = () => {
    revision.current += 1
    active.current = false
    session.current?.cancel()
    if (mounted.current) { setState('idle'); setPartial(''); setSeconds(0) }
  }
  useDidHide(() => { pageVisible.current = false; cancel() })
  useDidShow(() => { pageVisible.current = true })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; cancel() }
  }, [])
  useEffect(() => { cancel(); session.current = undefined }, [scope])
  useEffect(() => {
    if (state !== 'listening') return
    setSeconds(0)
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - started) / 1000))), 250)
    return () => clearInterval(timer)
  }, [state])

  const start = () => {
    if (active.current || !userId || !caseId || !pageVisible.current) return
    void Taro.hideKeyboard().catch(() => undefined)
    active.current = true
    setPartial('')
    const operation = ++revision.current
    const isCurrent = () => mounted.current && pageVisible.current && revision.current === operation && latest.current.scope === scope
    session.current ||= getWechatSpeechSession()
    void session.current.start({
      onState: next => { if (isCurrent()) { setState(next); if (next === 'idle') active.current = false } },
      onPartial: text => { if (isCurrent()) setPartial(text) },
      onResult: text => {
        if (!isCurrent()) return
        latest.current.onChange(appendDictation(latest.current.value, text))
        setPartial('')
      },
      onError: message => { if (isCurrent()) { active.current = false; setState('idle'); setPartial(''); Taro.showToast({ title: message, icon: 'none' }) } }
    }, () => prepareSpeechInput(userId, () => !isCurrent()))
  }
  return { state, partial, seconds, start, stop: () => session.current?.stop(), cancel }
}
