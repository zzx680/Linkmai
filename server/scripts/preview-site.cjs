// 本地整站预览：静态托管落地页（读取当前工作区 server/public/site），/api 转发到本地后端，/review 直接读当前工作区文件。
// 用法：先启动后端（server/scripts/preview-review-seed.ts），再 node server/scripts/preview-site.cjs
const express = require('express')
const http = require('node:http')
const path = require('node:path')

const port = Number(process.env.PORT || 18765)
const siteRoot = process.env.SITE_ROOT || path.resolve(__dirname, '../public/site')
const apiTarget = new URL(process.env.API_ORIGIN || 'http://127.0.0.1:8000')
const app = express()

app.use(express.static(siteRoot))
app.use('/review', express.static(path.resolve(__dirname, '../public/review'), { index: 'index.html' }))
app.use((request, response) => {
  const upstream = http.request({
    hostname: apiTarget.hostname,
    port: apiTarget.port || 80,
    path: request.originalUrl,
    method: request.method,
    headers: { ...request.headers, host: request.headers.host },
  }, result => {
    response.writeHead(result.statusCode || 502, result.headers)
    result.pipe(response)
  })
  upstream.on('error', () => {
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ error: 'BackendUnavailable', message: '本地后端未启动' }))
  })
  request.pipe(upstream)
})

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`本地网站预览：http://localhost:${port}/`)
  console.log(`律师登录：http://localhost:${port}/review/?entry=lawyer`)
  console.log(`管理员后台：http://localhost:${port}/review/?entry=admin`)
})

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用，可用 PORT=18766 更换端口。`
    : error.message)
  process.exitCode = 1
})
