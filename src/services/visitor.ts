import { siteConfig } from '../config/site'

// 访客身份与设备识别。
// - 身份：localStorage 里的 UUID（清缓存才换人），对应后端 visit_logs.visitor_key
// - 设备：直接在浏览器端解析 navigator.userAgent，拼成 "iPhone / iOS 17 / Safari"
//   这样的短串，通过 X-Visitor-Device 头传给后端——Go 端不用引 UA 解析库
// - 传输：installVisitorHeaders() 包装 window.fetch，对 API 请求自动附加
//   X-Visitor-ID / X-Visitor-Device / X-Visitor-Name 三个头，调用处零改动

const VISITOR_ID_KEY = 'abing_visitor_id'
const VISITOR_NAME_KEY = 'abing_visitor_name'

// crypto.randomUUID 只在安全上下文（HTTPS 或 localhost）下可用，
// 纯 HTTP 环境下会是 undefined，这里加个降级兜底。
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY)
  if (!id) {
    id = generateUuid()
    localStorage.setItem(VISITOR_ID_KEY, id)
  }
  return id
}

// 访客填过昵称（比如留言用的名字）就带上，后台看到的是人名而不是一串哈希
export function getVisitorName(): string | null {
  return localStorage.getItem(VISITOR_NAME_KEY)
}

export function setVisitorName(name: string): void {
  const trimmed = name.trim()
  if (trimmed) localStorage.setItem(VISITOR_NAME_KEY, trimmed.slice(0, 32))
}

// describeDevice 从 UA 字符串里抠出 设备/系统/浏览器 三个短标签。
// 只覆盖常见组合，认不出来就降级显示原始 UA 的前一段，不追求 100% 精确。
export function describeDevice(): string {
  const ua = navigator.userAgent
  const parts: string[] = []

  // 设备 + 系统
  const ios = /iPhone|iPad|iPod/.exec(ua)
  const android = /Android\s([\d.]+)/.exec(ua)
  if (ios) {
    parts.push(ios[0])
    const os = /OS\s(\d+[_\d]*)/.exec(ua)
    if (os) parts.push(`iOS ${os[1].replace(/_/g, '.')}`)
  } else if (android) {
    // Android UA 里通常带真实机型： "...; Pixel 7; Android 13; ..."
    const model = /Android\s[\d.]+;\s([^;)]+?)(?:;\sBuild|\))/i.exec(ua)
    const modelText = model?.[1]?.trim()
    if (modelText && !/^(wv|K|Chrome|Mobile)/i.test(modelText)) parts.push(modelText)
    parts.push(`Android ${android[1]}`)
  } else if (/Windows NT 10/.test(ua)) {
    parts.push('Windows')
  } else if (/Macintosh/.test(ua)) {
    const os = /Mac OS X\s(\d+[_\d]*)/.exec(ua)
    parts.push(os ? `macOS ${os[1].replace(/_/g, '.')}` : 'macOS')
  } else if (/Linux/.test(ua)) {
    parts.push('Linux')
  }

  // 浏览器（按识别优先级，Edge/EdgeHTML 优先于 Chrome 内核）
  const browser =
    /Edg\/([\d.]+)/.exec(ua) ? 'Edge' :
    /Firefox\/([\d.]+)/.exec(ua) ? 'Firefox' :
    /Chrome\/([\d.]+)/.exec(ua) ? 'Chrome' :
    /Version\/([\d.]+).*Safari/.exec(ua) ? 'Safari' : ''
  if (browser) parts.push(browser)

  if (!parts.length) return ua.slice(0, 64)
  // 分隔符必须是纯 ASCII：HTTP 头是字节流，浏览器会把 "·"(U+00B7) 按 latin1
  // 发成单字节 0xB7，后端拿到的是非法 UTF-8，写 MySQL utf8mb4 列会报 1366。
  return parts.join(' / ').slice(0, 64)
}

// installVisitorHeaders 包装 window.fetch：凡是指向后端 API 的请求
// 自动附加访客身份头。放 main.ts 里装一次，全站生效。
// 注意：这三个是自定义头，跨域时浏览器会先发 OPTIONS 预检，
// 后端 CORS 中间件的 Allow-Headers 必须放行它们。
export function installVisitorHeaders(): void {
  const originalFetch = window.fetch.bind(window)
  // apiBaseUrl 可能是相对路径（/api/v1），也可能是绝对地址（https://api.example.com/api/v1）。
  // 取 path 部分做前缀比对；绝对地址时再比对 host，跨主机部署也不会漏带/误带访客头。
  const apiBase = new URL(siteConfig.apiBaseUrl, window.location.origin)
  const apiPath = apiBase.pathname.replace(/\/+$/, '')

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string
    if (typeof input === 'string') url = input
    else if (input instanceof URL) url = input.href
    else url = input.url

    const requestUrl = new URL(url, window.location.origin)
    const isApiRequest =
      requestUrl.origin === apiBase.origin &&
      (requestUrl.pathname === apiPath || requestUrl.pathname.startsWith(`${apiPath}/`))
    if (!isApiRequest) return originalFetch(input, init)

    const headers = new Headers(init?.headers)
    headers.set('X-Visitor-ID', getVisitorId())
    headers.set('X-Visitor-Device', describeDevice())
    const name = getVisitorName()
    // 中文昵称不能直接塞头：头的字符集只到 latin1，超出的码点会让 Headers.set 抛 TypeError，
    // 那一下整个 fetch 包装都会失败（等于全站接口都挂）。编码成 %XX，后端 decodeHeader 还原。
    if (name) headers.set('X-Visitor-Name', encodeURIComponent(name))

    // init 里只覆盖 headers：字符串入参时其余字段走 init（本来就有）；
    // Request 入参时 method/body 等字段按 spec 从 Request 继承
    const nextInit: RequestInit = { ...(init ?? {}), headers }
    return originalFetch(input, nextInit)
  }
}
