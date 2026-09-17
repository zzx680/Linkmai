import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArtifactCard } from '../../components/artifact/ArtifactCard'
import { FieldConfirmationCard } from '../../components/artifact/FieldConfirmationCard'
import { Composer } from '../../components/agent/Composer'
import { QuickReplies } from '../../components/agent/QuickReplies'
import { RippleLoading } from '../../components/agent/RippleLoading'
import { BottomNav } from '../../components/navigation/BottomNav'
import { ReportSummaryCard } from '../../components/report/ReportSummaryCard'
import { demoCase, demoReport, useCurrentCaseStore } from '../../stores/currentCase'
import { Artifact, ChatMessage, ExtractedField, QuickReplyOption } from '../../types/domain'
import { uploadImages } from '../../services/upload'
import './index.scss'

const initialOptions: QuickReplyOption[] = [
  { label: '上传交警认定书', value: 'police-report' },
  { label: '上传医院 / 费用材料', value: 'medical-documents' },
  { label: '上传车损 / 定损材料', value: 'damage-documents' },
  { label: '我没有材料', value: 'no-materials' },
]

const guidedOptions: QuickReplyOption[] = [
  { label: '有交警认定书', value: 'has-police-report' },
  { label: '只有现场照片', value: 'has-photos' },
  { label: '没有书面材料', value: 'no-written-materials' },
]

const materialFields: ExtractedField[] = [
  { label: '事故类型', value: '机动车追尾', source: '交警认定书', confidence: 'high' },
  { label: '事故时间', value: '2026 年 9 月 12 日 15:30', source: '交警认定书', confidence: 'high' },
  { label: '责任情况', value: '对方承担主要责任', source: '交警认定书', confidence: 'high' },
  { label: '人伤情况', value: '尚未识别，请补充确认', source: '待确认', confidence: 'low' },
]

const createMessage = (message: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage => ({
  ...message,
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  createdAt: Date.now(),
})

const welcomeMessages = (): ChatMessage[] => [
  createMessage({
    role: 'assistant',
    kind: 'text',
    text: '你好，我是灵迈 Agent。\n我会先看材料，再和你一起核对关键事实，最后生成定责与赔偿参考报告。',
  }),
  createMessage({
    role: 'assistant',
    kind: 'quick-replies',
    text: '为了让分析更准确，建议先上传你手上的材料。',
    options: initialOptions,
  }),
]

export default function AgentPage() {
  const currentCase = useCurrentCaseStore((state) => state.currentCase)
  const setCurrentCase = useCurrentCaseStore((state) => state.setCurrentCase)
  const setReport = useCurrentCaseStore((state) => state.setReport)
  const [messages, setMessages] = useState<ChatMessage[]>(welcomeMessages)
  const [draft, setDraft] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const scrollAnchor = useMemo(() => `message-${messages[messages.length - 1]?.id || 'start'}`, [messages])
  const recorderRef = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null)

  useEffect(() => {
    if (currentCase?.hasReport && messages.length <= 2) {
      setMessages([
        ...welcomeMessages(),
        createMessage({
          role: 'assistant',
          kind: 'report',
          text: '上次分析已经完成。你可以继续追问，也可以打开完整报告。',
        }),
      ])
    }
  }, [currentCase?.hasReport])

  useEffect(() => {
    recorderRef.current = Taro.getRecorderManager()
    const recorder = recorderRef.current
    recorder.onStop(() => {
      setIsRecording(false)
      addAssistantMessage('我已把语音转成文字。请确认：这段描述是否准确？')
      addQuickReplyMessage([
        { label: '准确，继续', value: 'voice-confirmed' },
        { label: '我重新说一遍', value: 'voice-retry' },
      ])
    })
    recorder.onError(() => {
      setIsRecording(false)
      Taro.showToast({ title: '录音没有成功，请重试', icon: 'none' })
    })
    return () => {
      recorder.stop()
    }
  }, [])

  const appendMessages = (...next: ChatMessage[]) => {
    setMessages((current) => [...current, ...next])
  }

  const addAssistantMessage = (text: string) => {
    appendMessages(createMessage({ role: 'assistant', kind: 'text', text }))
  }

  const addQuickReplyMessage = (options: QuickReplyOption[], text = '请选择最符合实际情况的一项，也可以直接描述。') => {
    appendMessages(createMessage({ role: 'assistant', kind: 'quick-replies', text, options }))
  }

  const addLoadingMessage = (loadingText: string) => {
    const message = createMessage({ role: 'assistant', kind: 'loading', loadingText, text: loadingText })
    appendMessages(message)
    return message.id
  }

  const replaceMessage = (id: string, message: Partial<ChatMessage>) => {
    setMessages((current) => current.map((item) => (item.id === id ? { ...item, ...message } : item)))
  }

  const simulateMaterialProcessing = (artifact: Artifact) => {
    appendMessages(createMessage({ role: 'user', kind: 'artifact', artifact }))
    const loadingId = addLoadingMessage('正在识别材料')
    setTimeout(() => {
      replaceMessage(loadingId, {
        kind: 'fields',
        text: '识别完成。请先核对这些信息，确认后才会进入分析。',
        fields: materialFields,
      })
    }, 1100)
    setHasStarted(true)
    setCurrentCase({
      ...(currentCase || demoCase),
      ...demoCase,
      id: currentCase?.id || demoCase.id,
      title: currentCase?.title === '新的事故分析' ? '新的事故分析' : demoCase.title,
      status: 'processing',
      statusLabel: '材料识别中',
      materialCount: 1,
      materialProgress: '1 份材料待核对',
      hasReport: false,
    })
  }

  const uploadByType = async (type: 'document' | 'image') => {
    try {
      if (type === 'image') {
        const result = await Taro.chooseImage({ count: 9, sizeType: ['compressed', 'original'], sourceType: ['album', 'camera'] })

        // 显示上传中提示
        Taro.showLoading({ title: '上传中...', mask: true })

        try {
          // 上传到 OSS
          const uploadResults = await uploadImages(result.tempFilePaths)
          Taro.hideLoading()

          if (uploadResults.length === 0) {
            Taro.showToast({ title: '上传失败，请重试', icon: 'none' })
            return
          }

          const artifact: Artifact = {
            id: `artifact-${Date.now()}`,
            name: uploadResults.length > 1 ? `事故现场照片（${uploadResults.length} 张）` : '事故现场照片',
            type: 'image',
            sizeLabel: `${uploadResults.length} 张图片`,
            label: '现场照片',
            status: 'uploaded',
            urls: uploadResults.map(r => r.url),
          }
          simulateMaterialProcessing(artifact)
        } catch (error) {
          Taro.hideLoading()
          Taro.showToast({ title: '上传失败，请检查网络', icon: 'none' })
          console.error('上传失败:', error)
        }
        return
      }

      const result = await Taro.chooseMessageFile({ count: 1, type: 'all' })
      const file = result.tempFiles[0]
      if (!file) return
      const isImage = file.type === 'image'
      const artifact: Artifact = {
        id: `artifact-${Date.now()}`,
        name: file.name,
        type: isImage ? 'image' : 'document',
        sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        label: isImage ? '图片材料' : '事故相关文件',
        status: 'uploaded',
      }
      simulateMaterialProcessing(artifact)
    } catch {
      Taro.showToast({ title: '没有选择文件', icon: 'none' })
    }
  }

  const openAttachmentMenu = () => {
    Taro.showActionSheet({ itemList: ['上传文件', '上传图片 / 拍照'] })
      .then(({ tapIndex }) => uploadByType(tapIndex === 1 ? 'image' : 'document'))
      .catch(() => undefined)
  }

  const startRecording = () => {
    if (!recorderRef.current) return
    if (isRecording) {
      recorderRef.current.stop()
      return
    }
    try {
      recorderRef.current.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 96000, format: 'mp3' })
      setIsRecording(true)
    } catch {
      Taro.showToast({ title: '暂时无法录音，请检查权限', icon: 'none' })
    }
  }

  const sendText = (value = draft) => {
    const text = value.trim()
    if (!text) return
    appendMessages(createMessage({ role: 'user', kind: 'text', text }))
    setDraft('')
    setHasStarted(true)
    setTimeout(() => {
      addAssistantMessage('收到。我会把你的描述作为待核对事实，不会直接当作最终结论。请继续补充客观材料，或者选择最符合情况的选项。')
      addQuickReplyMessage(guidedOptions)
    }, 450)
  }

  const handleQuickReply = (option: QuickReplyOption) => {
    appendMessages(createMessage({ role: 'user', kind: 'text', text: option.label }))
    if (option.value === 'police-report') {
      addAssistantMessage('交警认定书通常是最重要的责任材料，请上传照片或 PDF。')
      uploadByType('document')
      return
    }
    if (option.value === 'medical-documents') {
      addAssistantMessage('请上传病历、诊断证明、费用票据或出院记录，我会按人伤项目整理。')
      uploadByType('document')
      return
    }
    if (option.value === 'damage-documents') {
      addAssistantMessage('请上传维修报价、定损单或车辆损伤照片，我会先区分已发生费用与待定损项目。')
      uploadByType('document')
      return
    }
    if (option.value === 'no-materials' || option.value === 'no-written-materials') {
      addAssistantMessage('没关系，我们用几个简单问题还原经过。先确认：交警是否到场并出具了认定结果？')
      addQuickReplyMessage(guidedOptions, '请选择最接近的情况：')
      return
    }
    if (option.value === 'has-photos') {
      addAssistantMessage('现场照片可以作为辅助证据。请再告诉我：事故中是否有人受伤？')
      addQuickReplyMessage([
        { label: '没有人员受伤', value: 'no-injury' },
        { label: '有人受伤，已就医', value: 'injury-treated' },
        { label: '有人受伤，尚在治疗', value: 'injury-ongoing' },
      ])
      return
    }
    if (option.value === 'voice-confirmed' || option.value === 'no-injury') {
      addAssistantMessage('已记录。接下来请补充车辆损失或相关费用材料。')
      addQuickReplyMessage([
        { label: '上传车损材料', value: 'damage-documents' },
        { label: '暂时没有，先生成参考', value: 'generate-report' },
      ])
      return
    }
    if (option.value === 'injury-treated' || option.value === 'injury-ongoing') {
      addAssistantMessage('已记录人伤情况。请上传病历、诊断证明和费用票据；伤残、长期治疗等事项会建议律师复核。')
      return
    }
    if (option.value === 'voice-retry') {
      addAssistantMessage('好的，点击输入区的“声”再说一遍即可。')
      return
    }
    if (option.value === 'generate-report') {
      generateReport()
    }
  }

  const confirmFields = () => {
    appendMessages(createMessage({ role: 'user', kind: 'text', text: '确认无误' }))
    addAssistantMessage('好的，材料信息已确认。还需要核对一个关键问题：这起事故是否涉及人员受伤？')
    addQuickReplyMessage([
      { label: '没有人员受伤', value: 'no-injury' },
      { label: '有人受伤，已就医', value: 'injury-treated' },
      { label: '有人受伤，尚在治疗', value: 'injury-ongoing' },
    ])
  }

  const editFields = () => {
    appendMessages(createMessage({ role: 'user', kind: 'text', text: '需要修改识别结果' }))
    addAssistantMessage('请直接告诉我需要修改哪一项，例如：“责任情况改为双方同等责任”。我会先记录，再请你确认。')
  }

  const generateReport = () => {
    appendMessages(createMessage({ role: 'user', kind: 'text', text: '先生成一份参考报告' }))
    const loadingId = addLoadingMessage('正在整理定责与赔偿参考')
    setTimeout(() => {
      replaceMessage(loadingId, {
        kind: 'report',
        text: '分析完成。以下结论只基于你确认过的材料和信息。',
      })
      setCurrentCase({ ...demoCase, status: 'ready', statusLabel: '报告已完成' })
      setReport(demoReport)
    }, 1500)
  }

  const openReport = () => Taro.navigateTo({ url: '/pages/report/index' })
  const openConsultation = () => Taro.reLaunch({ url: '/pages/consultation/index' })

  return (
    <View className="agent-page lm-page">
      <View className="agent-page__topbar">
        <View className="agent-page__topbar-left">
          <Text className="agent-page__logo-mark">AI</Text>
          <View>
            <Text className="agent-page__title">灵迈 Agent</Text>
            <Text className="agent-page__subtitle">{hasStarted ? '正在一起核对事实' : '材料优先 · 逐步分析'}</Text>
          </View>
        </View>
        <View className="agent-page__topbar-action" onClick={() => Taro.showToast({ title: '已自动保存当前对话', icon: 'none' })} role="button">
          <Text>保存</Text>
        </View>
      </View>

      <ScrollView className="agent-page__messages" scrollY scrollIntoView={scrollAnchor} scrollWithAnimation>
        <View className="agent-page__message-list">
          <View className="agent-page__date-line"><Text>今天 · 你的事故分析</Text></View>
          {messages.map((message) => (
            <View className={`agent-message agent-message--${message.role}`} key={message.id} id={`message-${message.id}`}>
              {message.role === 'assistant' ? <Text className="agent-message__avatar">LM</Text> : null}
              <View className="agent-message__content">
                {message.text && message.kind !== 'loading' && message.kind !== 'report' ? (
                  <Text className="agent-message__text">{message.text}</Text>
                ) : null}
                {message.kind === 'artifact' && message.artifact ? <ArtifactCard artifact={message.artifact} /> : null}
                {message.kind === 'loading' ? <RippleLoading text={message.loadingText} size="small" /> : null}
                {message.kind === 'fields' && message.fields ? (
                  <FieldConfirmationCard fields={message.fields} onConfirm={confirmFields} onEdit={editFields} />
                ) : null}
                {message.kind === 'quick-replies' && message.options ? (
                  <>
                    {message.text ? <Text className="agent-message__text">{message.text}</Text> : null}
                    <QuickReplies options={message.options} onSelect={handleQuickReply} />
                  </>
                ) : null}
                {message.kind === 'report' ? (
                  <>
                    {message.text ? <Text className="agent-message__text">{message.text}</Text> : null}
                    <ReportSummaryCard report={demoReport} onOpen={openReport} onConsult={openConsultation} />
                  </>
                ) : null}
              </View>
            </View>
          ))}
          <View className="agent-page__bottom-space" />
        </View>
      </ScrollView>

      <View className="agent-page__composer-wrap">
        <Composer
          value={draft}
          disabled={false}
          isRecording={isRecording}
          onChange={setDraft}
          onSend={() => sendText()}
          onAttach={openAttachmentMenu}
          onVoice={startRecording}
        />
      </View>
      <BottomNav active="agent" />
    </View>
  )
}
