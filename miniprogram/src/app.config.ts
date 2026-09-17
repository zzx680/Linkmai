export default defineAppConfig({
  pages: [
    'pages/case/index',
    'pages/agent/index',
    'pages/consultation/index',
    'pages/profile/index'
  ],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: '灵迈',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F7F4EF'
  },
  tabBar: {
    color: '#8E8E93',
    selectedColor: '#C4612F',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/case/index',
        text: '案件',
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
        pagePath: 'pages/consultation/index',
        text: '咨询',
        iconPath: 'assets/icons/consultation.png',
        selectedIconPath: 'assets/icons/consultation-active.png'
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
