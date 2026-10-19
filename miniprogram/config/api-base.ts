export function resolveApiBase(value: string | undefined, production: boolean) {
  const apiBase = (value || 'http://localhost:8000/api').trim().replace(/\/$/, '')
  let url: URL
  try {
    url = new URL(apiBase)
  } catch {
    throw new Error('TARO_APP_API_BASE 必须是有效的 API 地址')
  }
  if (['linkmai.com', 'www.linkmai.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('linkmai.com 和 www.linkmai.com 是网站域名，API 请使用 https://api.linkmai.com/api')
  }
  if (!['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) {
    throw new Error('生产构建必须提供 HTTPS TARO_APP_API_BASE；本地开发仅支持 HTTP/HTTPS')
  }
  return apiBase
}
