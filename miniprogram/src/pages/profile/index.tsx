import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Avatar, Card, Badge, Icon } from '../../components'
import './index.scss'

export default function Profile() {
  const handleLogin = () => {
    Taro.showToast({ title: '登录功能开发中', icon: 'none' })
  }

  const handleMenuClick = (key: string) => {
    Taro.showToast({ title: `${key}功能开发中`, icon: 'none' })
  }

  // Mock 用户数据
  const user = {
    avatar: 'user-line',
    nickname: '用户_8520',
    phone: '138****8520',
    isLoggedIn: true
  }

  const statsData = [
    { label: '已处理', value: '3', key: 'completed' },
    { label: '处理中', value: '1', key: 'processing' },
    { label: '已整理材料', value: '6', key: 'materials' }
  ]

  const menuSections = [
    {
      title: '',
      items: [
        { icon: 'file-list-3-line', label: '我的案例', key: 'cases', arrow: true }
      ]
    },
    {
      title: '服务',
      items: [
        { icon: 'scales-3-line', label: '法律知识库', key: 'knowledge', arrow: true },
        { icon: 'customer-service-line', label: '联系客服', key: 'contact', arrow: true }
      ]
    },
    {
      title: '设置',
      items: [
        { icon: 'notification-3-line', label: '消息通知', key: 'notifications', value: '开启', arrow: true },
        { icon: 'lock-line', label: '隐私设置', key: 'privacy', arrow: true },
        { icon: 'file-text-line', label: '用户协议', key: 'terms', arrow: true },
        { icon: 'information-line', label: '关于灵迈', key: 'about', value: 'v1.0.0', arrow: true }
      ]
    }
  ]

  return (
    <View className="profile-page">
      <View className="header-section">
        <Card className="user-card" padding="large" shadow="medium">
          <View className="user-info">
            <Avatar name={user.nickname} size={120} />
            <View className="user-details">
              <Text className="nickname">{user.nickname}</Text>
              <Text className="phone">{user.phone}</Text>
              <Badge variant="success" size="small">已认证</Badge>
            </View>
          </View>
          <View className="edit-btn" onClick={() => handleMenuClick('编辑资料')}>
            <Text className="edit-text">编辑资料</Text>
          </View>
        </Card>

        <View className="stats-row">
          {statsData.map(stat => (
            <View key={stat.key} className="stat-item" onClick={() => handleMenuClick(stat.label)}>
              <Text className="stat-value">{stat.value}</Text>
              <Text className="stat-label">{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="menu-sections">
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} className="menu-section">
            {section.title && <Text className="section-title">{section.title}</Text>}
            <Card className="menu-group" padding="none" shadow="small">
              {section.items.map((item, index) => (
                <View key={item.key}>
                  <View
                    className="menu-item"
                    onClick={() => handleMenuClick(item.label)}
                  >
                    <View className="menu-left">
                      <Icon name={item.icon} size={20} color="#6B7280" />
                      <Text className="menu-label">{item.label}</Text>
                    </View>
                    <View className="menu-right">
                      {item.value && <Text className="menu-value">{item.value}</Text>}
                      {item.arrow && <Icon name="arrow-right-s-line" size={20} color="#9CA3AF" />}
                    </View>
                  </View>
                  {index < section.items.length - 1 && <View className="menu-divider" />}
                </View>
              ))}
            </Card>
          </View>
        ))}
      </View>

      <View className="logout-section">
        <View className="logout-btn" onClick={() => handleMenuClick('退出登录')}>
          <Text className="logout-text">退出登录</Text>
        </View>
      </View>

      <View className="footer-info">
        <Text className="footer-text">青岛灵迈科技有限公司</Text>
        <Text className="footer-text">support@lingmai.com</Text>
      </View>
    </View>
  )
}
