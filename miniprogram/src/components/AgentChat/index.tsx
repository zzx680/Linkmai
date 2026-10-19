import { Button, Image, Slot, Text, View } from '@tarojs/components'
import { IS_H5 } from '../../config/env'
import Icon from '../Icon'
import type { Message } from '../../services/api'
import { getChatMessageText } from './labels'
import './index.scss'

interface ChatMessageProps {
  message?: Message
  pending?: boolean
}

// The mini program uses TDesign's native components; H5 keeps a lightweight
// preview with the same content and callbacks, without a second chat runtime.
export function AgentChatMessage({ message, pending = false }: ChatMessageProps) {
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
        name={role === 'assistant' ? '灵迈助手' : ''}
        variant="base"
        status={pending ? 'pending' : 'complete'}
        animation="dots"
        content={content}
      />
    )
  }
  return (
    <View className={`chat-preview-message chat-preview-message-${role}`}>
      {role === 'assistant' && <Text className="chat-preview-name">灵迈助手</Text>}
      <View className="chat-preview-content">
        {message?.images?.map(url => <Image key={url} src={url} mode="aspectFill" className="chat-preview-image" />)}
        <Text selectable>{pending ? '正在整理案件信息…' : text}</Text>
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
}

export function AgentChatSender({ value, sending, onChange, onSend, onKeyboardHeightChange, onAttach, uploading }: ChatSenderProps) {
  const send = (text: string) => {
    if (!sending && !uploading && text.trim()) onSend(text.trim())
  }
  const tools = (
    <View className="composer-tools">
      <Button className="composer-prompt" disabled={sending || uploading} onClick={() => onChange(value.trim() || '我想描述一下事故经过')}>
        <Icon name="messages-square" size={16} color="#000000" /><Text>描述经过</Text>
      </Button>
      <Button className="composer-upload" disabled={sending || uploading} onClick={onAttach}>
        <Icon name="plus" size={17} color="#4D6BFE" /><Text>{uploading ? '识别中…' : '上传材料'}</Text>
      </Button>
    </View>
  )
  return (
    <View className={`agent-chat-composer${sending ? ' is-sending' : ''}`}>
      {IS_H5 ? (
        <View className="chat-preview-sender">
          <textarea
            aria-label="事故信息"
            placeholder="把事故情况告诉灵迈"
            value={value}
            disabled={uploading}
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
            <Button className="chat-preview-send" aria-label="发送消息" disabled={sending || uploading || !value.trim()} onClick={() => send(value)}>
              <Icon name="arrow-up" size={20} color="#FFFFFF" />
            </Button>
          </View>
        </View>
      ) : (
        <t-chat-sender
          value={value}
          disabled={uploading}
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
