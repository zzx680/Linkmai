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
    custom: true,
    color: '#8E8E93',
    selectedColor: '#C4612F',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/case/index',
        text: '案件'
      },
      {
        pagePath: 'pages/agent/index',
        text: 'Agent'
      },
      {
        pagePath: 'pages/consultation/index',
        text: '咨询'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的'
      }
    ]
  },
  sitemapLocation: 'sitemap.json'
})

function defineAppConfig(config) {
  return config
}
