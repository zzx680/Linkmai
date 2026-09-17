import { View, Text } from '@tarojs/components'
import { ExtractedField } from '../../types/domain'
import './FieldConfirmationCard.scss'

interface FieldConfirmationCardProps {
  fields: ExtractedField[]
  onConfirm: () => void
  onEdit: () => void
}

export function FieldConfirmationCard({ fields, onConfirm, onEdit }: FieldConfirmationCardProps) {
  return (
    <View className="field-card">
      <View className="field-card__heading">
        <View>
          <Text className="field-card__eyebrow">DOCUMENT READ</Text>
          <Text className="field-card__title">请核对识别结果</Text>
        </View>
        <Text className="field-card__confidence">AI 识别</Text>
      </View>
      <View className="field-card__list">
        {fields.map((field) => (
          <View className="field-card__row" key={field.label}>
            <Text className="field-card__label">{field.label}</Text>
            <Text className="field-card__value">{field.value}</Text>
          </View>
        ))}
      </View>
      <Text className="field-card__hint">信息来自上传材料，确认后才会进入分析。</Text>
      <View className="field-card__actions">
        <View className="field-card__button field-card__button--ghost" onClick={onEdit} role="button">
          <Text>有误，修改</Text>
        </View>
        <View className="field-card__button field-card__button--solid" onClick={onConfirm} role="button">
          <Text>确认无误</Text>
          <Text>→</Text>
        </View>
      </View>
    </View>
  )
}
