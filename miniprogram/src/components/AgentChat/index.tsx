import { Button, Image, Text, View } from '@tarojs/components'
import { IS_H5 } from '../../config/env'
import type { Message } from '../../services/api'
import './index.scss'

interface ChatMessageProps {
  message?: Message
  pending?: boolean
}

// The mini program uses TDesign's native components; H5 keeps a lightweight
// preview with the same content and callbacks, without a second chat runtime.
export function AgentChatMessage({ message, pending = false }: ChatMessageProps) {
  const role = message?.role === 'user' ? 'user' : 'assistant'
  if (!IS_H5) {
    const content = [
      ...(role === 'user' && message?.images?.length ? [{
        type: 'attachment',
        data: message.images.map((url, index) => ({
          fileType: 'image', name: `材料 ${index + 1}`, url, size: 0,
        })),
      }] : []),
      { type: 'text', data: message?.content || '' },
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
        <Text selectable>{pending ? '正在整理案件信息…' : message?.content}</Text>
      </View>
    </View>
  )
}

interface ChatSenderProps {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onSend: (value: string) => void
  onKeyboardHeightChange: (height: number) => void
  onAttach: () => void
  uploading: boolean
}

export function AgentChatSender({ value, disabled, onChange, onSend, onKeyboardHeightChange, onAttach, uploading }: ChatSenderProps) {
  return (
    <View className="agent-chat-composer">
      <View className="composer-toolbar">
        <Button className="composer-upload" disabled={disabled || uploading} onClick={onAttach}>
          <Text>＋</Text><Text>{uploading ? '正在识别材料…' : '上传事故材料'}</Text>
        </Button>
        <Text className="composer-caption">{disabled ? '正在整理，请稍候' : '补充事故信息'}</Text>
      </View>
      {IS_H5 ? (
        <View className="chat-preview-sender">
          <textarea
            aria-label="事故信息"
            placeholder="把事故情况告诉灵迈…"
            value={value}
            disabled={disabled}
            rows={2}
            onChange={event => onChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                onSend(value)
              }
            }}
          />
          <Button className="chat-preview-send" disabled={disabled || !value.trim()} onClick={() => onSend(value)}>发送</Button>
        </View>
      ) : (
        <t-chat-sender
          value={value}
          disabled={disabled}
          placeholder="把事故情况告诉灵迈…"
          render-presets={[{ name: 'send', type: 'icon' }]}
          textarea-props={{ autosize: { minHeight: 48, maxHeight: 160 } }}
          adjust-position={false}
          auto-rise-with-keyboard={false}
          onChange={event => onChange(event.detail.value)}
          onSend={event => onSend(event.detail.value)}
          onKeyboardheightchange={event => onKeyboardHeightChange(event.detail.height)}
          onBlur={() => onKeyboardHeightChange(0)}
        />
      )}
      <Text className="composer-hint">AI 辅助整理，重要信息请结合原始材料核对</Text>
    </View>
  )
}
