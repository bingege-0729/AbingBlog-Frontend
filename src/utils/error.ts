// 把接口抛出的技术性错误（如 "API request failed: 500"）收敛成访客能看懂的话，
// 避免站点上直接出现裸状态码。后端返回的中文业务提示则原样透出。
export function friendlyError(error: unknown, fallback = '加载失败，请稍后重试'): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (!raw) return fallback
  if (/API request failed:\s*5\d\d|Internal Server Error/i.test(raw)) return '服务暂时不可用，请稍后重试'
  if (/API request failed:\s*404/i.test(raw)) return '内容不存在或已被删除'
  if (/Failed to fetch|NetworkError|ERR_NETWORK|ENOTFOUND|ECONNREFUSED/i.test(raw)) return '网络连接失败，请检查网络后重试'
  if (/timeout|ECONNABORTED/i.test(raw)) return '请求超时，请稍后重试'
  if (/[\u4e00-\u9fa5]/.test(raw)) return raw
  return fallback
}
