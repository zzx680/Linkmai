import { View, Text } from '@tarojs/components'
import { QuickReplyOption } from '../../types/domain'
import './QuickReplies.scss'

interface QuickRepliesProps {
  options: QuickReplyOption[]
  disabled?: boolean
  onSelect: (option: QuickReplyOption) => void
}

export function QuickReplies({ options, disabled = false, onSelect }: QuickRepliesProps) {
  return (
    <View className="quick-replies">
      {options.map((option) => (
        <View
          key={option.value}
          className={`quick-reply ${disabled ? 'is-disabled' : ''}`}
          onClick={disabled ? undefined : () => onSelect(option)}
          role="button"
        >
          <Text>{option.label}</Text>
          <Text className="quick-reply__arrow">↗</Text>
        </View>
      ))}
    </View>
  )
}
