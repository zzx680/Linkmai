import { View, Text } from '@tarojs/components'
import { Artifact } from '../../types/domain'
import './ArtifactCard.scss'

interface ArtifactCardProps {
  artifact: Artifact
  compact?: boolean
}

export function ArtifactCard({ artifact, compact = false }: ArtifactCardProps) {
  const statusText = {
    uploaded: '已上传',
    processing: '识别中',
    ready: '已核对',
    failed: '识别失败',
  }[artifact.status]

  return (
    <View className={`artifact-card ${compact ? 'artifact-card--compact' : ''}`}>
      <View className="artifact-card__icon">{artifact.type === 'image' ? 'IMG' : 'PDF'}</View>
      <View className="artifact-card__body">
        <Text className="artifact-card__label">{artifact.label}</Text>
        <Text className="artifact-card__name">{artifact.name}</Text>
        <Text className="artifact-card__meta">{artifact.sizeLabel} · {statusText}</Text>
      </View>
      <Text className={`artifact-card__status artifact-card__status--${artifact.status}`}>
        {artifact.status === 'ready' ? '✓' : '·'}
      </Text>
    </View>
  )
}
