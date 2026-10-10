import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAppStore } from '../../store'
import { Avatar, Icon } from '../../components'
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
  const { user, currentCase, isLoggedIn, logout } = useAppStore()
  const nickname = user?.nickname || (isLoggedIn ? '灵迈用户' : '未登录')
  const caseCount = currentCase ? 1 : 0
  const materialCount = currentCase?.materialCount || 0
  const reportCount = currentCase?.hasReport ? 1 : 0

  const openTask = (key: string) => {
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
      Taro.showToast({ title: '请在处理页面描述你的问题', icon: 'none' })
      return
    }
    if (key === 'logout') {
      logout()
      Taro.switchTab({ url: '/pages/case/index' })
    }
  }

  const sections: MenuSection[] = [
    {
      title: '案件管理',
      items: [
        { icon: 'file-list-3-line', label: '当前案件', key: 'case', value: currentCase ? '处理中' : '尚未创建' },
        { icon: 'folder-3-line', label: '材料与证据', key: 'materials', value: `${materialCount} 份` },
        { icon: 'file-chart-line', label: '事故报告', key: 'report', value: reportCount ? '可查看' : '未生成' }
      ]
    },
    {
      title: '帮助与设置',
      items: [
        { icon: 'question-line', label: '帮助与反馈', key: 'help' },
        { icon: 'shield-check-line', label: '隐私与安全', key: 'help' },
        { icon: 'information-line', label: '关于灵迈', key: 'help' }
      ]
    }
  ]

  return (
    <View className="profile-page">
      <View className="profile-header">
        <View>
          <Text className="profile-eyebrow">我的</Text>
          <Text className="profile-title">账户与案件</Text>
        </View>
        <View className="profile-header-icon" onClick={() => openTask('help')}>
          <Icon name="settings-3-line" size={22} color="#353F4C" />
        </View>
      </View>

      <View className="user-card">
        <View className="user-card-main">
          <Avatar name={nickname} size={96} />
          <View className="user-copy">
            <Text className="user-name">{nickname}</Text>
            <Text className="user-caption">{user?.openid ? '已连接灵迈账户' : '完成登录后可保存案件进度'}</Text>
          </View>
        </View>
        <Icon name="arrow-right-s-line" size={24} color="#8A94A3" />
      </View>

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
                  <Icon name={item.icon} size={20} color="#1E43A8" />
                </View>
                <Text className="menu-label">{item.label}</Text>
                <View className="menu-right">
                  {item.value && <Text className="menu-value">{item.value}</Text>}
                  <Icon name="arrow-right-s-line" size={22} color="#A3ACB8" />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      {isLoggedIn && (
        <View className="logout-button" onClick={() => openTask('logout')}>
          <Text>退出登录</Text>
        </View>
      )}

      <Text className="profile-footer">灵迈 · 让事故处理更清楚</Text>
    </View>
  )
}
