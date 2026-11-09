const express = require('express')
const path = require('node:path')

const app = express()
const port = Number(process.env.PORT || 18764)

app.get('/', (_request, response) => response.redirect('/review/?entry=admin'))
app.use('/review', express.static(path.resolve(__dirname, '../public/review')))

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`审核页预览：http://localhost:${port}/review/?entry=admin`)
  console.log('静态预览不提供登录和审核接口；修改页面后刷新即可查看。')
})

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用。可使用 PORT=18765 npm run preview:review 更换端口。`
    : error.message)
  process.exitCode = 1
})
