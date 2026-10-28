export default definePageConfig({
  navigationBarTitleText: '',
  navigationBarBackgroundColor: '#FFFFFF',
  navigationBarTextStyle: 'black',
  backgroundColor: '#F5F7FA'
})

function definePageConfig<T>(config: T): T {
  return config
}
