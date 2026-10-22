import { Canvas, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { IS_H5 } from '../../config/env'
import { ORB_SIZE, paintWorkingOrb, startOrbAnimation } from './engine'
import './index.scss'

let nextId = 0
interface CanvasNode {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  requestAnimationFrame(callback: (time: number) => void): number
  cancelAnimationFrame(id: number): void
}

export default function ThinkingOrb() {
  const [canvasId] = useState(() => `thinking-orb-${++nextId}`)
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(true)
  const webCanvas = useRef<HTMLCanvasElement | null>(null)
  useDidShow(() => setVisible(true))
  useDidHide(() => setVisible(false))

  useEffect(() => {
    if (!visible) return
    let disposed = false, stop = () => {}, retry: ReturnType<typeof setTimeout> | undefined
    setReady(false)
    const attach = (canvas: CanvasNode, ratio: number, reduced = false) => {
      if (disposed) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = Math.max(1, Math.min(2, ratio || 1))
      canvas.width = ORB_SIZE * dpr
      canvas.height = ORB_SIZE * dpr
      stop = startOrbAnimation(time => paintWorkingOrb(ctx, time, dpr), callback => canvas.requestAnimationFrame(callback), id => canvas.cancelAnimationFrame(id), reduced)
      setReady(true)
    }
    if (IS_H5) {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)')
      const start = () => {
        stop()
        if (document.visibilityState === 'hidden') return
        if (webCanvas.current) attach({
          getContext: () => webCanvas.current!.getContext('2d'),
          get width() { return webCanvas.current!.width }, set width(value) { webCanvas.current!.width = value },
          get height() { return webCanvas.current!.height }, set height(value) { webCanvas.current!.height = value },
          requestAnimationFrame: callback => window.requestAnimationFrame(callback),
          cancelAnimationFrame: id => window.cancelAnimationFrame(id)
        }, window.devicePixelRatio, media.matches)
      }
      start()
      document.addEventListener('visibilitychange', start)
      media.addEventListener('change', start)
      return () => { disposed = true; stop(); document.removeEventListener('visibilitychange', start); media.removeEventListener('change', start) }
    }
    const query = (attempt = 0) => {
      if (disposed) return
      Taro.createSelectorQuery().select(`#${canvasId}`).fields({ node: true, size: true }).exec(result => {
        if (disposed) return
        const canvas = result?.[0]?.node as CanvasNode | undefined
        if (canvas?.requestAnimationFrame) attach(canvas, Taro.getWindowInfo().pixelRatio)
        else if (attempt < 3) retry = setTimeout(() => query(attempt + 1), 50)
      })
    }
    Taro.nextTick(() => query())
    return () => { disposed = true; stop(); clearTimeout(retry) }
  }, [canvasId, visible])

  return <View className="thinking-indicator" role="status" aria-live="polite" aria-label="灵迈助手正在整理案件信息">
    <Text className="thinking-name">灵迈助手</Text>
    <View className="thinking-row">
      <View className="thinking-orb" aria-hidden="true">
        {IS_H5 ? <canvas className="thinking-canvas" ref={webCanvas} /> : <Canvas id={canvasId} type="2d" className="thinking-canvas" />}
        {!ready && <View className="thinking-fallback"><View /><View /><View /></View>}
      </View>
      <Text className="thinking-label">正在整理案件信息</Text>
    </View>
  </View>
}
