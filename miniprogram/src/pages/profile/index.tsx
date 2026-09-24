import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

interface StatItem {
  label: string
  value: string
  key: string
  color?: 'default' | 'highlight' | 'success'
}

interface MenuItem {
  icon: string
  label: string
  key: string
  value?: string
  arrow?: boolean
  color?: string
}

interface MenuSection {
  title?: string
  items: MenuItem[]
}

export default function Profile() {
  const handleLogin = () => {
    Taro.showToast({ title: '登录功能开发中', icon: 'none' })
  }

  const handleMenuClick = (key: string) => {
    if (key === '我的案例') {
      Taro.switchTab({ url: '/pages/case/index' })
    } else {
      Taro.showToast({ title: `${key}功能开发中`, icon: 'none' })
    }
  }

  const user = {
    avatar: '👤',
    nickname: '用户_8520',
    phone: '138****8520',
    isLoggedIn: true
  }

  const statsData: StatItem[] = [
    { label: '案件数', value: '4', key: 'total', color: 'default' },
    { label: '进行中', value: '1', key: 'processing', color: 'highlight' },
    { label: '已完成', value: '3', key: 'completed', color: 'success' }
  ]

  const menuSections: MenuSection[] = [
    {
      items: [
        { icon: '📋', label: '我的案例', key: 'cases', arrow: true }
      ]
    },
    {
      title: '服务',
      items: [
        { icon: '⚖️', label: '法律知识库', key: 'knowledge', arrow: true },
        { icon: '📞', label: '联系客服', key: 'contact', arrow: true }
      ]
    },
    {
      title: '设置',
      items: [
        { icon: '🔔', label: '消息通知', key: 'notifications', value: '开启', arrow: true },
        { icon: '🔒', label: '隐私设置', key: 'privacy', arrow: true },
        { icon: '📖', label: '用户协议', key: 'terms', arrow: true },
        { icon: 'ℹ️', label: '关于灵迈', key: 'about', value: 'v1.0.0', arrow: true }
      ]
    }
  ]

  return (
    <View className="profile-page">
      {/* 用户卡片 */}
      <View className="user-section">
        <View className="user-card">
          <View className="user-info">
            <View className="avatar-wrapper">
              <Text className="avatar">{user.avatar}</Text>
            </View>
            <View className="user-details">
              <Text className="nickname">{user.nickname}</Text>
              <Text className="phone">{user.phone}</Text>
            </View>
          </View>
          <View className="edit-btn" onClick={() => handleMenuClick('编辑资料')}>
            <Text className="edit-text">编辑</Text>
          </View>
        </View>

        {/* 数据统计 */}
        <View className="stats-container">
          {statsData.map(stat => (
            <View
              key={stat.key}
              className="stat-item"
              onClick={() => handleMenuClick(stat.label)}
            >
              <Text className={`stat-value ${stat.color}`}>{stat.value}</Text>
              <Text className="stat-label">{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 菜单列表 */}
      <View className="menu-container">
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} className="menu-section">
            {section.title && <Text className="section-title">{section.title}</Text>}
            <View className="menu-group">
              {section.items.map(item => (
                <View
                  key={item.key}
                  className="menu-item"
                  onClick={() => handleMenuClick(item.label)}
                >
                  <View className="menu-left">
                    <View className="menu-icon-wrapper">
                      <Text className="menu-icon">{item.icon}</Text>
                    </View>
                    <Text className="menu-label">{item.label}</Text>
                  </View>
                  <View className="menu-right">
                    {item.value && <Text className="menu-value">{item.value}</Text>}
                    {item.arrow && <Text className="menu-arrow">›</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* 退出登录 */}
      <View className="logout-section">
        <View className="logout-btn" onClick={() => handleMenuClick('退出登录')}>
          <Text className="logout-text">退出登录</Text>
        </View>
      </View>

      {/* 页脚信息 */}
      <View className="footer-info">
        <Text className="footer-text">青岛灵迈科技有限公司</Text>
        <Text className="footer-text">support@lingmai.com</Text>
      </View>
    </View>
  )
}
