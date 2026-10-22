export type SpeechState = 'idle' | 'authorizing' | 'listening' | 'transcribing'
export interface RecognitionResult { result?: string; tempFilePath?: string }
export interface RecognitionManager {
  start(options: { lang: 'zh_CN'; duration: number }): void
  stop(): void
  onStart?: () => void
  onRecognize?: (result: RecognitionResult) => void
  onStop?: (result: RecognitionResult) => void
  onError?: (error: unknown) => void
}
export interface SpeechCallbacks {
  onState(state: SpeechState): void
  onPartial(text: string): void
  onResult(text: string): void
  onError(message: string): void
}
interface Session { callbacks: SpeechCallbacks; manager?: RecognitionManager; cancelled: boolean; stopping: boolean; started: boolean }
type TimerHandle = ReturnType<typeof setTimeout>
interface TimerApi {
  setTimeout(handler: () => void, delay: number): TimerHandle
  clearTimeout(handle: TimerHandle | undefined): void
}

export function appendDictation(draft: string, text: string) {
  const result = text.trim()
  if (!result) return draft
  return draft ? `${draft}${/\s$/.test(draft) ? '' : '\n'}${result}` : result
}

export class SpeechCancelled extends Error {}

/** One plugin manager owns the microphone. Cancelled sessions drain before reuse. */
export class SpeechSession {
  private active?: Session
  private timer?: TimerHandle
  private quarantinedManager?: RecognitionManager

  constructor(
    private readonly prepare: () => Promise<RecognitionManager>,
    private readonly removeTemp: (path: string) => void = () => {},
    private readonly clock: TimerApi = { setTimeout, clearTimeout },
  ) {}

  async start(callbacks: SpeechCallbacks, prepare = this.prepare) {
    if (this.active) { callbacks.onError('上一次口述还在结束，请稍后重试'); return }
    const session: Session = { callbacks, cancelled: false, stopping: false, started: false }
    this.active = session
    callbacks.onState('authorizing')
    try {
      const manager = await prepare()
      if (this.active !== session || session.cancelled) return
      if (manager === this.quarantinedManager) {
        this.active = undefined
        callbacks.onState('idle')
        callbacks.onError('语音插件未完成重置，请退出微信小程序后重新进入再使用')
        return
      }
      this.quarantinedManager = undefined
      session.manager = manager
      manager.onStart = () => {
        if (this.active !== session) return
        session.started = true
        this.clock.clearTimeout(this.timer)
        if (session.cancelled) {
          session.stopping = true
          try { manager.stop() } catch { /* Keep draining. */ }
          return
        }
        callbacks.onState('listening')
      this.timer = this.clock.setTimeout(() => this.stop(), 60000)
      }
      manager.onRecognize = result => {
        if (this.active === session && !session.cancelled) callbacks.onPartial(typeof result.result === 'string' ? result.result : '')
      }
      manager.onStop = result => {
        if (result.tempFilePath) { try { this.removeTemp(result.tempFilePath) } catch { /* Cleanup must not discard the recognized text. */ } }
        if (this.active !== session) return
        this.finish(session)
        if (session.cancelled) return
        const text = typeof result.result === 'string' ? result.result.trim() : ''
        if (text) callbacks.onResult(text)
        else callbacks.onError('没有识别到文字，请靠近麦克风再试一次')
      }
      manager.onError = error => {
        if (this.active !== session) return
        const code = (error as { retcode?: number } | null)?.retcode
        if (code === -30011 || code === -30012 && session.stopping) return
        this.finish(session)
        if (!session.cancelled) callbacks.onError('语音识别未完成，请检查网络后重试')
      }
      this.timer = this.clock.setTimeout(() => {
        if (this.active !== session || session.cancelled) return
        session.cancelled = true
        callbacks.onState('idle')
        callbacks.onError('麦克风启动超时，请稍后重试')
        try { manager.stop() } catch { /* Await a late start/stop without applying its result. */ }
      }, 10000)
      manager.start({ lang: 'zh_CN', duration: 60000 })
    } catch (error) {
      if (this.active !== session) return
      this.finish(session)
      if (!session.cancelled && !(error instanceof SpeechCancelled)) callbacks.onError(error instanceof Error ? error.message : '口述输入暂不可用，请稍后重试')
    }
  }

  stop() {
    const session = this.active
    if (!session?.manager || !session.started || session.stopping || session.cancelled) return
    session.stopping = true
    this.clock.clearTimeout(this.timer)
    session.callbacks.onState('transcribing')
    try { session.manager.stop() } catch { this.failStop(session) }
    if (this.active === session && !session.cancelled) this.timer = this.clock.setTimeout(() => {
      if (this.active !== session || session.cancelled) return
      // Do not reuse a manager that never acknowledged stop. A later start is
      // allowed only when the plugin gives us a different manager instance.
      session.cancelled = true
      this.quarantinedManager = session.manager
      this.detach(session.manager)
      this.active = undefined
      session.callbacks.onState('idle')
      session.callbacks.onError('转文字未能结束，请退出微信小程序后重新进入再使用')
    }, 12000)
  }

  cancel() {
    const session = this.active
    if (!session) return
    session.cancelled = true
    this.clock.clearTimeout(this.timer)
    session.callbacks.onState('idle')
    if (!session.manager) { this.active = undefined; return }
    if (session.started && !session.stopping) {
      session.stopping = true
      try { session.manager.stop() } catch { /* Keep the cancelled session isolated until the plugin finishes. */ }
    }
  }

  private finish(session: Session) {
    if (this.active !== session) return
    this.clock.clearTimeout(this.timer)
    this.active = undefined
    if (!session.cancelled) session.callbacks.onState('idle')
  }
  private failStop(session: Session) {
    session.cancelled = true
    this.quarantinedManager = session.manager
    this.detach(session.manager)
    this.active = undefined
    session.callbacks.onState('idle')
    session.callbacks.onError('口述未能结束，请退出微信小程序后重新进入再使用')
  }

  private detach(manager?: RecognitionManager) {
    if (!manager) return
    manager.onStart = undefined
    manager.onRecognize = undefined
    manager.onStop = undefined
    manager.onError = undefined
  }
}
