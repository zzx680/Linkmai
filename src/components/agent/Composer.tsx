import { View, Text, Textarea } from '@tarojs/components'
import './Composer.scss'

interface ComposerProps {
  value: string
  disabled?: boolean
  isRecording?: boolean
  onChange: (value: string) => void
  onSend: () => void
  onAttach: () => void
  onVoice: () => void
}

export function Composer({
  value,
  disabled = false,
  isRecording = false,
  onChange,
  onSend,
  onAttach,
  onVoice,
}: ComposerProps) {
  const canSend = value.trim().length > 0 && !disabled

  return (
    <View className="composer-shell">
      {isRecording ? (
        <View className="composer-recording" onClick={onVoice} role="button">
          <View className="composer-recording__pulse" />
          <View>
            <Text className="composer-recording__title">正在录音</Text>
            <Text className="composer-recording__hint">再次点击结束并识别</Text>
          </View>
          <Text className="composer-recording__stop">结束</Text>
        </View>
      ) : (
        <View className="composer">
          <View className="composer__toolbar">
            <View className="composer__tool" onClick={onAttach} role="button" aria-label="上传材料">
              <Text>＋</Text>
            </View>
            <Textarea
              className="composer__input"
              value={value}
              maxlength={1000}
              autoHeight
              cursorSpacing={12}
              disabled={disabled}
              placeholder="继续描述，或询问报告中的问题"
              placeholderClass="composer__placeholder"
              onInput={(event) => onChange(event.detail.value)}
              onConfirm={onSend}
            />
            <View
              className={`composer__tool composer__voice ${disabled ? 'is-disabled' : ''}`}
              onClick={disabled ? undefined : onVoice}
              role="button"
              aria-label="语音输入"
            >
              <Text>声</Text>
            </View>
          </View>
          <View className={`composer__send ${canSend ? 'is-ready' : ''}`} onClick={canSend ? onSend : undefined} role="button">
            <Text>↑</Text>
          </View>
        </View>
      )}
      <Text className="composer-shell__notice">灵迈会基于你确认的材料提供参考，不替代专业法律意见</Text>
    </View>
  )
}
