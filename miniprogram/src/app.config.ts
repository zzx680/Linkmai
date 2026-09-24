export default defineAppConfig({
  pages: [
    'pages/case/index',
    'pages/agent/index',
    'pages/profile/index',
    'pages/case-detail/index',
    'pages/materials/index',
    'pages/report/index'
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: '灵迈',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F7F4EF'
  },
  tabBar: {
    custom: true,
    color: '#8E8E93',
    selectedColor: '#1E43A8',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/case/index',
        text: '首页',
        iconPath: 'assets/icons/case.png',
        selectedIconPath: 'assets/icons/case-active.png'
      },
      {
        pagePath: 'pages/agent/index',
        text: 'Agent',
        iconPath: 'assets/icons/agent.png',
        selectedIconPath: 'assets/icons/agent-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/icons/profile.png',
        selectedIconPath: 'assets/icons/profile-active.png'
      }
    ]
  },
  sitemapLocation: 'sitemap.json'
})

function defineAppConfig(config) {
  return config
}
