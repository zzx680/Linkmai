import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { entitlementLabel } from '../../utils/payment'
import { IS_H5 } from '../../config/env'
import { useAppStore } from '../../store'
import { Avatar, Icon } from '../../components'
import { syncTabRoute } from '../../custom-tab-bar/navigation'
import './index.scss'

interface MenuItem {
  icon: string
  label: string
  key: string
  value?: string
}

interface MenuSection {
  title: string
  items: MenuItem[]
}

export default function Profile() {
  const { user, currentCase, isLoggedIn, authRetryable, authError, isAuthenticating, logout, retryAuth, updateProfile, uploadProfileAvatar } = useAppStore()
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [draftNickname, setDraftNickname] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const nickname = user?.nickname || (isLoggedIn ? 'momo' : '未登录')
  const caseCount = currentCase ? 1 : 0
  const materialCount = currentCase?.materialCount || 0
  const reportCount = currentCase?.hasReport ? 1 : 0

  useDidShow(() => {
    syncTabRoute('/pages/profile/index')
    if (!IS_H5 && useAppStore.getState().isLoggedIn) useAppStore.getState().loadCurrentCase()
  })

  const openTask = (key: string) => {
    if (key === 'payments') {
      Taro.navigateTo({ url: '/pages/payments/index' })
      return
    }
    if (key === 'case') {
      Taro.switchTab({ url: '/pages/case/index' })
      return
    }
    if (key === 'materials') {
      if (!currentCase) {
        Taro.switchTab({ url: '/pages/case/index' })
        return
      }
      Taro.navigateTo({ url: `/pages/materials/index?caseId=${currentCase.id}` })
      return
    }
    if (key === 'report') {
      if (!currentCase) {
        Taro.switchTab({ url: '/pages/case/index' })
        return
      }
      Taro.navigateTo({ url: `/pages/report/index?caseId=${currentCase.id}` })
      return
    }
    if (key === 'help') {
      Taro.navigateTo({ url: '/pages/help/index' })
      return
    }
    if (key === 'privacy') {
      Taro.navigateTo({ url: '/pages/privacy/index' })
      return
    }
    if (key === 'about') {
      Taro.navigateTo({ url: '/pages/about/index' })
      return
    }
    if (key === 'login') {
      if (isAuthenticating) return
      retryAuth().then(ok => {
        if (ok) Taro.showToast({ title: '登录成功', icon: 'success' })
      })
      return
    }
    if (key === 'logout') {
      Taro.showModal({ title: '退出当前账户？', content: '已保存的案件不会删除。下次登录后可以继续处理。', confirmText: '退出登录', confirmColor: '#C53434' }).then(result => {
        if (!result.confirm) return
        logout()
        Taro.switchTab({ url: '/pages/case/index' })
      })
    }
  }

  useEffect(() => {
    if (!isEditingProfile) setDraftNickname(user?.nickname || '')
  }, [isEditingProfile, user?.nickname])

  const openProfileEditor = () => {
    if (!isLoggedIn) {
      openTask('login')
      return
    }
    setDraftNickname(user?.nickname || '')
    setIsEditingProfile(true)
  }

  const handleChooseAvatar = async (event: any) => {
    const filePath = event?.detail?.avatarUrl
    if (!filePath || isUploadingAvatar) return
    setIsUploadingAvatar(true)
    try {
      await uploadProfileAvatar(filePath)
      Taro.showToast({ title: '头像已更新', icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || '头像上传失败，请重试', icon: 'none' })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const saveProfile = async () => {
    if (isSavingProfile || isUploadingAvatar) return
    const value = draftNickname.trim()
    if (!value) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    setIsSavingProfile(true)
    try {
      await updateProfile(value)
      setIsEditingProfile(false)
      Taro.showToast({ title: '资料已保存', icon: 'success' })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || '资料保存失败，请重试', icon: 'none' })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const sections: MenuSection[] = [
    {
      title: '案件管理',
      items: [
        { icon: 'file-text', label: '当前案件', key: 'case', value: currentCase ? '处理中' : '尚未创建' },
        { icon: 'folder-open', label: '材料与证据', key: 'materials', value: `${materialCount} 份` },
        { icon: 'chart-no-axes-combined', label: '事故报告', key: 'report', value: reportCount ? '可查看' : '未生成' }
      ]
    },
    {
      title: '付费服务',
      items: [
        { icon: 'credit-card', label: '订阅与付费', key: 'payments', value: !isLoggedIn ? '登录后查看' : currentCase ? entitlementLabel(currentCase.entitlement?.status) : '暂无案件' }
      ]
    },
    {
      title: '帮助与设置',
      items: [
        { icon: 'circle-help', label: '帮助与反馈', key: 'help' },
        { icon: 'shield-check', label: '隐私与安全', key: 'privacy' },
        { icon: 'info', label: '关于灵迈', key: 'about' }
      ]
    }
  ]

  return (
    <View className="profile-page">
      <View className="profile-header">
        <View>
          <Text className="profile-title">账户与案件</Text>
        </View>
        <View className="profile-header-icon" onClick={() => openTask('help')}>
          <Icon name="settings" size={22} color="#000000" />
        </View>
      </View>

      <View className="user-card" onClick={openProfileEditor}>
        <View className="user-card-main">
          <Avatar name={nickname} src={user?.avatar} size={96} />
          <View className="user-copy">
            <Text className="user-name">{nickname}</Text>
            {user?.openid
              ? (user.nickname || user.avatar) && <Text className="user-caption">微信资料已连接 · 点击编辑</Text>
              : <Text className="user-caption">完成登录后可保存案件进度</Text>}
          </View>
        </View>
        <Icon name="chevron-right" size={24} color="#FFFFFF" />
      </View>

      {isEditingProfile && (
        <View className="profile-editor">
          <View className="profile-editor-heading">
            <View>
              <Text className="profile-editor-title">完善个人资料</Text>
              <Text className="profile-editor-description">头像和昵称仅用于你的灵迈账户展示</Text>
            </View>
            <View className="profile-editor-close" onClick={() => setIsEditingProfile(false)}>
              <Icon name="x" size={20} color="#000000" />
            </View>
          </View>

          <View className="profile-editor-body">
            {IS_H5 ? (
              <View className="avatar-picker avatar-picker-disabled" onClick={() => Taro.showToast({ title: '请在微信小程序中选择头像', icon: 'none' })}>
                <Avatar name={nickname} src={user?.avatar} size={76} />
                <Text>请在微信小程序中更换头像</Text>
              </View>
            ) : (
              <Button
                className="avatar-picker"
                openType="chooseAvatar"
                onChooseAvatar={handleChooseAvatar}
                disabled={isUploadingAvatar || isSavingProfile}
              >
                <Avatar name={nickname} src={user?.avatar} size={76} />
                <Text>{isUploadingAvatar ? '正在上传头像...' : '选择微信头像'}</Text>
                <Icon name="camera" size={18} color="#000000" />
              </Button>
            )}

            <View className="nickname-field">
              <Text className="field-label">昵称</Text>
              <Input
                className="nickname-input"
                type={IS_H5 ? 'text' : 'nickname'}
                value={draftNickname}
                maxlength={30}
                placeholder="输入你的昵称"
                onInput={event => setDraftNickname(event.detail.value)}
              />
            </View>
          </View>

          <View className="profile-editor-actions">
            <View className="profile-action-secondary" onClick={() => setIsEditingProfile(false)}><Text>暂不设置</Text></View>
            <View className={`profile-action-primary${isSavingProfile || isUploadingAvatar ? ' profile-action-disabled' : ''}`} onClick={saveProfile}>
              <Text>{isSavingProfile ? '正在保存...' : '保存资料'}</Text>
            </View>
          </View>
        </View>
      )}

      {authError && <View className="auth-error-panel"><Text className="auth-error-title">暂未连接到你的账户</Text><Button className="auth-retry" loading={isAuthenticating} disabled={isAuthenticating} onClick={() => openTask('login')}>重新连接</Button></View>}
      <View className="stats-grid">
        <View className="stat-card" onClick={() => openTask('case')}>
          <Text className="stat-value">{caseCount}</Text>
          <Text className="stat-label">进行中案件</Text>
        </View>
        <View className="stat-card" onClick={() => openTask('materials')}>
          <Text className="stat-value">{materialCount}</Text>
          <Text className="stat-label">已整理材料</Text>
        </View>
      </View>

      {sections.map(section => (
        <View className="menu-section" key={section.title}>
          <Text className="section-title">{section.title}</Text>
          <View className="menu-card">
            {section.items.map((item, index) => (
              <View
                className={`menu-item ${index === section.items.length - 1 ? 'menu-item-last' : ''}`}
                key={item.label}
                onClick={() => openTask(item.key)}
              >
                <View className="menu-icon">
                  <Icon name={item.icon} size={20} color="#000000" />
                </View>
                <Text className="menu-label">{item.label}</Text>
                <View className="menu-right">
                  {item.value && <Text className="menu-value">{item.value}</Text>}
                  <Icon name="chevron-right" size={22} color="#000000" />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      {!isLoggedIn && (
        <View className="logout-button" onClick={() => openTask('login')}>
          <Text>{isAuthenticating ? '正在连接微信账户' : authRetryable ? '重新登录' : '登录'}</Text>
        </View>
      )}

      {isLoggedIn && (
        <View className="logout-button" onClick={() => openTask('logout')}>
          <Text>退出登录</Text>
        </View>
      )}
    </View>
  )
}
