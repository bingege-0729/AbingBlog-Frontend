/**
 * 主题（配色）控制
 * ------------------------------------------------------------
 * 两套主题定义在 src/styles/tokens.css：sand（暖纸·朱砂）/ ink（石墨·青）。
 * 优先级从高到低：
 *   1. URL 上的 ?theme=ink —— 方便临时预览、发给别人看某套配色
 *   2. localStorage —— 访客自己在设置里选过
 *   3. 管理端设定的站点默认主题（来自 GET /profile 的 theme 字段）
 *   4. 'sand' —— 兜底
 *
 * 应用方式是在 <html> 上挂 data-theme，CSS 只认这个属性，
 * 所以组件里不需要知道当前是哪套配色。
 */

export type ThemeName = 'sand' | 'ink'

export const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  { id: 'sand', label: '暖纸 · 朱砂', hint: '浅色，阅读与打印友好' },
  { id: 'ink', label: '石墨 · 青', hint: '深色，夜间与展陈' },
]

const STORAGE_KEY = 'abing:theme'

export function isThemeName(value: unknown): value is ThemeName {
  return value === 'sand' || value === 'ink'
}

function fromQuery(): ThemeName | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('theme')
  return isThemeName(v) ? v : null
}

function fromStorage(): ThemeName | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return isThemeName(v) ? v : null
  } catch {
    // 隐私模式下 localStorage 可能抛异常，忽略即可
    return null
  }
}

/** 解析当前应该用哪套主题。siteDefault 是管理端设的站点默认值。 */
export function resolveTheme(siteDefault?: unknown): ThemeName {
  const q = fromQuery()
  if (q) return q
  const stored = fromStorage()
  if (stored) return stored
  if (isThemeName(siteDefault)) return siteDefault
  return 'sand'
}

/** 把主题挂到 <html data-theme>，同时切换 color-scheme。 */
export function applyTheme(theme: ThemeName, animate = true): void {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-animating')
    window.setTimeout(() => root.classList.remove('theme-animating'), 260)
  }
  root.dataset.theme = theme
}

/** 访客手动切换：写 localStorage 并立刻应用。 */
export function persistTheme(theme: ThemeName): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // 存不下就只影响本次会话，不影响渲染
  }
  applyTheme(theme)
}

/** 清掉访客选择，回到管理端设定的站点默认主题。 */
export function clearThemeChoice(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 同上
  }
}
