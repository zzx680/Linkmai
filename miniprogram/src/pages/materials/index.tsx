import { View, Text, Image, ScrollView, Input } from '@tarojs/components'
import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { useAppStore } from '../../store'
import { MaterialField, MaterialType } from '../../services/api'
import './index.scss'

const materialTypes: Array<{ type: MaterialType; icon: string; label: string; description: string }> = [
  { type: 'accident_report', icon: '📄', label: '交警认定书', description: '责任认定与事故经过' },
  { type: 'id_card', icon: '🪪', label: '身份证', description: '当事人身份信息' },
  { type: 'vehicle_license', icon: '🚗', label: '行驶证', description: '车辆与车主信息' },
  { type: 'driver_license', icon: '📋', label: '驾驶证', description: '驾驶资格信息' },
  { type: 'medical_record', icon: '🏥', label: '医疗记录', description: '诊断与治疗费用' },
  { type: 'scene_photo', icon: '📸', label: '现场照片', description: '车辆与现场损失' },
  { type: 'other', icon: '🗂️', label: '其他材料', description: '补充证明材料' }
]

function getTypeInfo(type: string) {
  return materialTypes.find(item => item.type === type) || materialTypes[materialTypes.length - 1]
}

export default function Materials() {
  const { materials, currentCase, uploadingFiles, processMaterial, confirmMaterial } = useAppStore()
  const [selectedType, setSelectedType] = useState<MaterialType>('accident_report')
  const [isProcessing, setIsProcessing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draftFields, setDraftFields] = useState<Record<string, MaterialField[]>>({})
  const [confirmedIds, setConfirmedIds] = useState<string[]>([])

  useEffect(() => {
    if (materials.length > 0) {
      setDraftFields(current => {
        const next = { ...current }
        materials.forEach(material => {
          if (!next[material.id]) next[material.id] = material.fields
        })
        return next
      })
    }
  }, [materials])

  const uploadingProgress = useMemo(() => Array.from(uploadingFiles.values()), [uploadingFiles])

  const chooseAndProcess = async () => {
    try {
      const result = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      setIsProcessing(true)
      Taro.showLoading({ title: '上传并识别中' })
      const imageUrl = await useAppStore.getState().uploadImage(result.tempFilePaths[0])
      const material = await processMaterial(selectedType, imageUrl)
      setExpandedId(material.id)
      Taro.hideLoading()
      Taro.showToast({ title: '识别完成，请核对', icon: 'success' })
    } catch (error: any) {
      Taro.hideLoading()
      if (!error.errMsg?.includes('cancel')) {
        Taro.showToast({ title: error.message || '材料处理失败', icon: 'none' })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const updateField = (materialId: string, fieldIndex: number, value: string) => {
    setDraftFields(current => ({
      ...current,
      [materialId]: (current[materialId] || []).map((field, index) =>
        index === fieldIndex ? { ...field, value } : field
      )
    }))
  }

  const confirmMaterialFields = (materialId: string) => {
    const fields = draftFields[materialId] || []
    confirmMaterial(materialId, fields)
    setConfirmedIds(current => current.includes(materialId) ? current : [...current, materialId])
    setExpandedId(null)
    Taro.showToast({ title: '信息已确认', icon: 'success' })
  }

  const viewRawText = (materialId: string) => {
    const material = materials.find(item => item.id === materialId)
    if (!material?.rawText) {
      Taro.showToast({ title: '暂无原始识别文本', icon: 'none' })
      return
    }
    Taro.showModal({ title: '原始识别文本', content: material.rawText, showCancel: false })
  }

  return (
    <View className="materials-page">
      <View className="page-header">
        <View>
          <Text className="eyebrow">{currentCase ? `案件 #${currentCase.id.slice(0, 8)}` : '材料工作区'}</Text>
          <Text className="page-title">案件材料</Text>
          <Text className="page-description">上传、核对并确认 AI 将用于分析的事实材料。</Text>
        </View>
        <View className="count-badge"><Text>{materials.length} 份</Text></View>
      </View>

      <View className="notice-card">
        <Text className="notice-icon">✓</Text>
        <View className="notice-content">
          <Text className="notice-title">先确认，再进入分析</Text>
          <Text className="notice-text">识别结果来自图片内容，低置信度字段请结合原件核对。确认信息不会自动构成法律结论。</Text>
        </View>
      </View>

      <View className="section-heading">
        <Text className="section-title">添加材料</Text>
        <Text className="section-caption">选择类型后拍照或从相册上传</Text>
      </View>

      <ScrollView className="type-scroller" scrollX showScrollbar={false}>
        <View className="type-list">
          {materialTypes.map(item => (
            <View
              key={item.type}
              className={`type-card ${selectedType === item.type ? 'selected' : ''}`}
              onClick={() => setSelectedType(item.type)}
            >
              <Text className="type-icon">{item.icon}</Text>
              <Text className="type-label">{item.label}</Text>
              <Text className="type-description">{item.description}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="upload-panel" onClick={chooseAndProcess}>
        <View className="upload-icon">＋</View>
        <View className="upload-copy">
          <Text className="upload-title">上传{getTypeInfo(selectedType).label}</Text>
          <Text className="upload-subtitle">支持拍照或从相册选择 JPG、PNG 图片</Text>
        </View>
        <Text className="upload-arrow">→</Text>
      </View>

      {uploadingProgress.length > 0 && (
        <View className="upload-progress">
          <View className="progress-line">
            <Text>正在上传材料</Text>
            <Text>{uploadingProgress[0]}%</Text>
          </View>
          <View className="progress-track"><View className="progress-fill" style={{ width: `${uploadingProgress[0]}%` }} /></View>
        </View>
      )}

      <View className="section-heading materials-heading">
        <Text className="section-title">已添加材料</Text>
        <Text className="section-caption">{isProcessing ? 'AI 正在识别，请稍候' : '点击卡片核对识别结果'}</Text>
      </View>

      {materials.length === 0 ? (
        <View className="empty-card">
          <Text className="empty-icon">🗃️</Text>
          <Text className="empty-title">还没有材料</Text>
          <Text className="empty-text">建议先上传交警认定书，它通常包含责任分析最关键的信息。</Text>
        </View>
      ) : (
        <View className="materials-list">
          {materials.map(material => {
            const typeInfo = getTypeInfo(material.type)
            const fields = draftFields[material.id] || material.fields
            const isExpanded = expandedId === material.id
            const isConfirmed = Boolean(material.confirmed || confirmedIds.includes(material.id))
            return (
              <View key={material.id} className={`material-card ${isExpanded ? 'expanded' : ''}`}>
                <View className="material-summary" onClick={() => setExpandedId(isExpanded ? null : material.id)}>
                  <Image src={material.imageUrl} className="material-thumbnail" mode="aspectFill" />
                  <View className="material-info">
                    <View className="material-title-row">
                      <Text className="material-icon">{typeInfo.icon}</Text>
                      <Text className="material-title">{typeInfo.label}</Text>
                    </View>
                    <Text className="material-meta">{fields.length} 个可识别字段 · {new Date(material.createdAt).toLocaleDateString('zh-CN')}</Text>
                  </View>
                  <View className={`material-status ${isConfirmed ? 'confirmed' : 'pending'}`}>
                    <Text>{isConfirmed ? '已确认' : '待核对'}</Text>
                  </View>
                </View>

                {isExpanded && (
                  <View className="material-detail">
                    <View className="detail-heading">
                      <Text>识别字段</Text>
                      <Text className="detail-hint">点击字段可修改</Text>
                    </View>
                    {fields.length === 0 ? (
                      <Text className="no-fields">未识别到结构化字段，请查看原始文本。</Text>
                    ) : fields.map((field, index) => (
                      <View key={`${field.key}-${index}`} className="field-row">
                        <View className="field-copy">
                          <Text className="field-label">{field.label}</Text>
                          <Input
                            className={`field-input ${field.confidence === 'low' ? 'low-confidence' : ''}`}
                            value={field.value}
                            placeholder="未识别"
                            onInput={event => updateField(material.id, index, event.detail.value)}
                          />
                        </View>
                        <Text className={`confidence ${field.confidence || 'medium'}`}>{field.confidence === 'high' ? '高置信度' : field.confidence === 'low' ? '请核对' : '需核对'}</Text>
                      </View>
                    ))}
                    <View className="detail-actions">
                      <View className="text-action" onClick={() => viewRawText(material.id)}><Text>查看原文</Text></View>
                      <View className="confirm-action" onClick={() => confirmMaterialFields(material.id)}><Text>{isConfirmed ? '已确认' : '确认这些信息'}</Text></View>
                    </View>
                  </View>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
