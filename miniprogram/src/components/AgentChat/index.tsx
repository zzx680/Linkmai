import { Button, Image, Slot, Text, View } from '@tarojs/components'
import { IS_H5 } from '../../config/env'
import Icon from '../Icon'
import ThinkingOrb from '../ThinkingOrb'
import type { Message } from '../../services/api'
import { getChatMessageText } from './labels'
import type { SpeechState } from '../../services/speech/session'
import './index.scss'

interface ChatMessageProps {
  message?: Message
  pending?: boolean
}

// The mini program uses TDesign's native components; H5 keeps a lightweight
// preview with the same content and callbacks, without a second chat runtime.
export function AgentChatMessage({ message, pending = false }: ChatMessageProps) {
  if (pending) return <ThinkingOrb />
  const role = message?.role === 'user' ? 'user' : 'assistant'
  const text = getChatMessageText(message?.content || '', message?.role || 'assistant')
  if (!IS_H5) {
    const content = [
      ...(role === 'user' && message?.images?.length ? [{
        type: 'attachment',
        data: message.images.map((url, index) => ({
          fileType: 'image', name: `材料 ${index + 1}`, url, size: 0,
        })),
      }] : []),
      { type: 'text', data: text },
    ]
    return (
      <t-chat-message
        chat-id={message?.id || 'pending'}
        role={role}
        placement={role === 'user' ? 'right' : 'left'}
        name=""
        variant="base"
        status="complete"
        animation="dots"
        content={content}
      />
    )
  }
  return (
    <View className={`chat-preview-message chat-preview-message-${role}`}>
      <View className="chat-preview-content">
        {message?.images?.map(url => <Image key={url} src={url} mode="aspectFill" className="chat-preview-image" />)}
        <Text selectable>{text}</Text>
      </View>
    </View>
  )
}

interface ChatSenderProps {
  value: string
  sending: boolean
  uploading: boolean
  onChange: (value: string) => void
  onSend: (value: string) => void
  onKeyboardHeightChange: (height: number) => void
  onAttach: () => void
  onDictate?: () => void
  speechState?: SpeechState
  speechText?: string
  speechSeconds?: number
  onSpeechStop?: () => void
  onSpeechCancel?: () => void
}

export function AgentChatSender({ value, sending, onChange, onSend, onKeyboardHeightChange, onAttach, uploading, onDictate, speechState = 'idle', speechText = '', speechSeconds = 0, onSpeechStop, onSpeechCancel }: ChatSenderProps) {
  const speaking = speechState !== 'idle'
  const send = (text: string) => {
    if (!sending && !uploading && !speaking && text.trim()) onSend(text.trim())
  }
  const tools = (
    <View className="composer-tools">
      <Button id="guide-describe" className="composer-prompt" aria-label="口述经过" disabled={sending || uploading || speaking || !onDictate} onClick={onDictate}>
        <Icon name="mic" size={16} color="#000000" /><Text>口述经过</Text>
      </Button>
      <Button id="guide-upload" className="composer-upload" disabled={sending || uploading || speaking} onClick={onAttach}>
        <Icon name="plus" size={17} color="#2A64F0" /><Text>{uploading ? '识别中…' : '上传材料'}</Text>
      </Button>
    </View>
  )
  return (
    <View className={`agent-chat-composer${sending ? ' is-sending' : ''}`}>
      {speaking && <View className="speech-panel" role="status" aria-live="polite">
        <View className="speech-panel-heading">
          <View className={`speech-wave${speechState === 'listening' ? ' is-listening' : ''}`}><View /><View /><View /><View /><View /></View>
          <Text className="speech-status">{speechState === 'authorizing' ? '准备语音输入' : speechState === 'listening' ? '正在听，你可以开始说了' : '正在转成文字'}</Text>
          {speechState === 'listening' && <Text className="speech-time">{speechSeconds}s / 60s</Text>}
        </View>
        <Text className="speech-transcript">{speechText || (speechState === 'listening' ? '请清晰说出事故经过' : '请稍候')}</Text>
        <View className="speech-actions">
          <Button className="speech-cancel" onClick={onSpeechCancel}>取消</Button>
          <Button className="speech-finish" disabled={speechState !== 'listening'} onClick={onSpeechStop}>{speechState === 'transcribing' ? '转文字中…' : '说完了'}</Button>
        </View>
      </View>}
      {IS_H5 ? (
        <View className="chat-preview-sender">
          <textarea
            aria-label="事故信息"
            placeholder="把事故情况告诉灵迈"
            value={value}
            disabled={uploading || speaking}
            rows={2}
            onChange={event => onChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send(value)
              }
            }}
          />
          <View className="composer-footer">
            {tools}
            <Button className="chat-preview-send" aria-label="发送消息" disabled={sending || uploading || speaking || !value.trim()} onClick={() => send(value)}>
              <Icon name="arrow-up" size={20} color="#FFFFFF" />
            </Button>
          </View>
        </View>
      ) : (
        <t-chat-sender
          value={value}
          disabled={uploading || speaking}
          placeholder="把事故情况告诉灵迈"
          render-presets={[{ name: 'send', type: 'icon' }]}
          textarea-props={{ autosize: { minHeight: 48, maxHeight: 120 } }}
          adjust-position={false}
          auto-rise-with-keyboard={false}
          onChange={event => onChange(event.detail.value)}
          onSend={event => send(event.detail.value)}
          onKeyboardheightchange={event => onKeyboardHeightChange(event.detail.height)}
          onBlur={() => onKeyboardHeightChange(0)}
        ><Slot name="footer-prefix">{tools}</Slot></t-chat-sender>
      )}
    </View>
  )
}
