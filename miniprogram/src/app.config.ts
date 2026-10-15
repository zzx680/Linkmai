export default defineAppConfig({
  pages: [
    'pages/case/index',
    'pages/agent/index',
    'pages/profile/index',
    'pages/materials/index',
    'pages/report/index',
    'pages/payments/index',
    'pages/help/index',
    'pages/privacy/index',
    'pages/about/index'
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: '灵迈',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F5F7FA'
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
        text: '处理',
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

function defineAppConfig<T>(config: T): T {
  return config
}
