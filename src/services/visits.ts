import { siteConfig } from '../config/site'

// 站点级访问指标。字段与后端 repository.VisitStats 一一对应：
// total/today 是 PV（累计/今日访问次数），distinct_users/today_distinct 是 UV（独立访客）。
export interface VisitStats {
  total: number
  today: number
  distinct_users: number
  today_distinct: number
}

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

// 页面浏览上报：后端记 kind='page' 的一条访问记录。
// 为什么要单独上报：访问日志默认只在 API 请求上落一条，纯前端切页（数据命中缓存、
// 不发请求）就会漏记，站点的「访问数」会明显偏少。
// 埋点失败绝不能影响页面，所以异常全部吞掉，也不抛给调用方。
export async function reportPageView(path: string): Promise<void> {
  try {
    await fetch(`${siteConfig.apiBaseUrl}/visits/page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      // 页面切走时也要发出去，避免请求被浏览器中断
      keepalive: true,
    })
  } catch {
    // 静默失败：访问统计不该给用户带来任何感知
  }
}

// 只读接口：不产生副作用，失败让调用方自己决定怎么降级（侧栏是直接不渲染）。
export async function fetchVisitStats(): Promise<VisitStats> {
  // 每次调用都取全局 fetch，确保拿到 main.ts 里装过访客头的包装版本
  const response = await fetch(`${siteConfig.apiBaseUrl}/visits/stats`)
  if (!response.ok) throw new Error(`visits/stats failed: ${response.status}`)

  const text = await response.text()
  if (!text) throw new Error('visits/stats returned an empty response')

  let payload: ApiEnvelope<VisitStats>
  try {
    payload = JSON.parse(text) as ApiEnvelope<VisitStats>
  } catch {
    throw new Error('visits/stats returned invalid JSON')
  }
  if (payload.code !== 0) throw new Error(payload.message)

  return payload.data
}
