import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { completeGuideSteps, getGuideProgress, skipGuide, subscribeGuideProgress } from './progress'
import { placeGuide, type GuideId, type TargetRect } from './state'
import hand from './tap-hand.png'
import arrow from './guide-arrow.png'
import './index.scss'

export interface GuideStep {
  id: GuideId
  target: string
  number: string
  title: string
  description: string
  nextLabel: string
  targetLabel: string
  onTarget?: () => void
}
interface Props { steps: GuideStep[]; enabled?: boolean; scrollPage?: boolean }

export default function OnboardingGuide({ steps, enabled = true, scrollPage = false }: Props) {
  const [progress, setProgress] = useState(getGuideProgress)
  const [visible, setVisible] = useState(true)
  const [geometry, setGeometry] = useState<{ id: GuideId; layout: NonNullable<ReturnType<typeof placeGuide>> } | null>(null)
  const [revision, setRevision] = useState(0)
  const displayed = useRef<GuideId | null>(null)
  const step = !progress.skipped ? steps.find(item => !progress.seen.includes(item.id)) : undefined

  useDidShow(() => { setProgress(getGuideProgress()); setVisible(true); setRevision(value => value + 1) })
  useDidHide(() => {
    setVisible(false)
    setGeometry(null)
    if (displayed.current) completeGuideSteps([displayed.current])
    displayed.current = null
  })

  useEffect(() => {
    const unsubscribe = subscribeGuideProgress(setProgress)
    setProgress(getGuideProgress())
    return () => {
      unsubscribe()
      if (displayed.current) completeGuideSteps([displayed.current])
      displayed.current = null
    }
  }, [])

  useEffect(() => {
    const resize = () => setRevision(value => value + 1)
    Taro.onWindowResize(resize)
    return () => Taro.offWindowResize(resize)
  }, [])

  useEffect(() => {
    setGeometry(null)
    if (!enabled || !visible || !step) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    let scrolled = false
    const measure = () => {
      if (cancelled) return
      const { windowWidth: width, windowHeight: height } = Taro.getWindowInfo()
      const query = Taro.createSelectorQuery()
      query.select(`#${step.target}`).boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec(results => {
        if (cancelled) return
        const rect = results?.[0] as TargetRect | null
        if (rect?.width && rect.height) {
          if (scrollPage && !scrolled && (rect.top < 24 || rect.top + rect.height > height - 110)) {
            scrolled = true
            const scrollTop = Number(results?.[1]?.scrollTop) || 0
            Taro.pageScrollTo({ scrollTop: Math.max(0, scrollTop + rect.top - height * .62), duration: 240 })
              .catch(() => undefined).finally(() => { if (!cancelled) timer = setTimeout(measure, 300) })
            return
          }
          const layout = placeGuide(rect, { width, height })
          if (layout) { displayed.current = step.id; setGeometry({ id: step.id, layout }); return }
        }
        // Native slots and page transitions may not have finished rendering yet.
        if (++attempts < 8) timer = setTimeout(measure, 180)
      })
    }
    Taro.nextTick(() => { if (!cancelled) timer = setTimeout(measure, 180) })
    return () => { cancelled = true; clearTimeout(timer) }
  }, [step?.id, step?.target, enabled, visible, revision, scrollPage])

  if (!enabled || !visible || !step || !geometry || geometry.id !== step.id) return null
  const { hole, card, above, showPointer } = geometry.layout
  const pixels = (rect: TargetRect) => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
  const advance = (activateTarget = false) => {
    // Read current progress so a previously mounted tab cannot overwrite newer choices.
    const current = getGuideProgress()
    if (current.skipped || current.seen.includes(step.id)) return
    // Starting an action closes the remaining tips so they do not interrupt it.
    const ids: GuideId[] = activateTarget && (step.id === 'describe' || step.id === 'upload')
      ? ['describe', 'upload'] : [step.id]
    displayed.current = null
    setProgress(completeGuideSteps(ids))
    setGeometry(null)
    if (activateTarget) step.onTarget?.()
  }
  const skip = () => {
    displayed.current = null
    setProgress(skipGuide())
  }

  return (
    <View className="onboarding-guide" catchMove role="dialog" aria-label="新人指引">
      <View className="guide-touch-shield" />
      <Button className="guide-spotlight" style={pixels(hole)} aria-label={step.targetLabel} onClick={() => advance(true)} />
      {showPointer && <View className={`guide-pointer${above ? ' guide-pointer-above' : ''}`} style={{ left: `${hole.left + hole.width / 2 - 26}px`, top: `${above ? hole.top - 58 : hole.top + hole.height - 2}px` }}>
        <View className="guide-tap-ring" />
        <Image className="guide-hand" src={hand} mode="aspectFit" />
        <Image className="guide-arrow" src={arrow} mode="aspectFit" />
      </View>}
      <View className="guide-card" style={pixels(card)}>
        <View className="guide-card-header"><Text className="guide-eyebrow">新人指引</Text><Text className="guide-step">{step.number}</Text></View>
        <Text className="guide-title">{step.title}</Text>
        <Text className="guide-description">{step.description}</Text>
        <View className="guide-card-footer">
          <Button className="guide-skip" onClick={skip}>跳过指引</Button>
          <Button className="guide-next" onClick={() => advance()}>{step.nextLabel}<Text className="guide-next-arrow">→</Text></Button>
        </View>
      </View>
    </View>
  )
}
