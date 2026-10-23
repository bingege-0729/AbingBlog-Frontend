// 极简、XSS 安全的 Markdown 渲染器：先把所有文本做 HTML 转义，再做少量结构化规则。
// 刻意保持小巧——只覆盖博客正文常用的标题/强调/行内代码/代码块/链接/列表/引用。

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 只允许 http/https/mailto 链接，阻止 javascript: 等危险协议
function safeHref(raw: string): string {
  const url = raw.trim()
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : '#'
}

// 表格：分隔行（由 - 与 : 组成，至少一个 -）
function isTableDivider(line: string): boolean {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()))
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

function renderTableRow(cells: string[], head: boolean): string {
  const tag = head ? 'th' : 'td'
  return `<tr>${cells.map((c) => `<${tag}>${renderInline(c)}</${tag}>`).join('')}</tr>`
}

function renderInline(text: string): string {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) =>
      `<a href="${safeHref(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let i = 0

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
      paragraph = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // 围栏代码块（mermaid 渲染成 .mermaid 节点，由 renderMermaid 绘制）
    if (/^\s*```/.test(line)) {
      flushParagraph()
      const lang = line.trim().slice(3).trim().toLowerCase()
      const code: string[] = []
      i += 1
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i])
        i += 1
      }
      i += 1 // 跳过结束围栏
      const body = code.join('\n')
      // mermaid 源码同样要转义：正文是 v-html 注入的，直接拼会留下 XSS 口子，
      // 而且 <<interface>> 这类写法会被浏览器当成未知标签吃掉。转义后
      // textContent 仍是原文，mermaid 读到的就是标准语法。
      out.push(lang === 'mermaid' ? `<div class="mermaid">${escapeHtml(body)}</div>` : `<pre><code>${escapeHtml(body)}</code></pre>`)
      continue
    }

    // 标题
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      i += 1
      continue
    }

    // 引用
    if (/^\s{0,3}>/.test(line)) {
      flushParagraph()
      const quote: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s{0,3}>\s?/, ''))
        i += 1
      }
      out.push(`<blockquote>${quote.map(renderInline).join('<br/>')}</blockquote>`)
      continue
    }

    // 无序列表
    if (/^\s{0,3}[-*+]\s+/.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^\s{0,3}[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}[-*+]\s+/, ''))
        i += 1
      }
      out.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
      continue
    }

    // 有序列表
    if (/^\s{0,3}\d+[.)]\s+/.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^\s{0,3}\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}\d+[.)]\s+/, ''))
        i += 1
      }
      out.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`)
      continue
    }

    // 分隔线
    if (/^\s{0,3}(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph()
      out.push('<hr/>')
      i += 1
      continue
    }

    // 表格（表头行 + 分隔行 + 若干数据行）
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushParagraph()
      out.push(`<table><thead>${renderTableRow(splitTableRow(line), true)}</thead><tbody>`)
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        out.push(renderTableRow(splitTableRow(lines[i]), false))
        i += 1
      }
      out.push('</tbody></table>')
      continue
    }

    // 空行 → 段落分隔
    if (/^\s*$/.test(line)) {
      flushParagraph()
      i += 1
      continue
    }

    paragraph.push(line.trim())
    i += 1
  }
  flushParagraph()

  return out.join('\n')
}

// —— Mermaid ——
// 走本地依赖而不是 CDN：jsdelivr 在国内经常几秒起步、偶发被墙，图没画出来后
// 用户只能看见一段源码，还查不出原因。改成 npm 依赖后由 Vite 切成独立 chunk，
// 只有正文真的出现图表才按需加载，首屏体积不受影响。
type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<unknown>
}

let mermaidLoader: Promise<MermaidApi> | null = null
let appliedTheme = ''
let renderSeq = 0
// 同一批节点可能被连续触发两次（展开正文 + 切换主题），用串行队列避免重复渲染打架
let renderQueue: Promise<void> = Promise.resolve()

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((mod) => (mod as unknown as { default: MermaidApi }).default)
  }
  return mermaidLoader
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function currentTheme(): string {
  return document.documentElement.dataset.theme === 'ink' ? 'ink' : 'sand'
}

// 配色全部取自主题令牌：同一张图在暖纸/石墨两套皮肤下都不突兀，
// 切换主题时强制重绘（initialize 只影响之后的渲染，已画好的 svg 颜色不会自己变）。
function mermaidConfig(): Record<string, unknown> {
  const ink = currentTheme() === 'ink'
  const text = cssVar('--text', ink ? '#e6e9e3' : '#1b1916')
  const text2 = cssVar('--text-2', ink ? '#b9c1c9' : '#5c554a')
  const line = cssVar('--line-2', ink ? '#303945' : '#d0c6b1')
  const surface = cssVar('--surface-2', ink ? '#1a1f26' : '#f3eee3')
  const surface3 = cssVar('--surface-3', ink ? '#212832' : '#e8e1d2')
  const canvas = cssVar('--surface', ink ? '#14181d' : '#fdfbf6')
  const accent = cssVar('--accent', ink ? '#5fbfae' : '#ac3b26')

  return {
    startOnLoad: false,
    securityLevel: 'strict',
    fontFamily: '"Space Grotesk", "Noto Sans SC", system-ui, sans-serif',
    theme: 'base',
    themeVariables: {
      background: canvas,
      mainBkg: surface,
      primaryColor: surface,
      primaryBorderColor: line,
      primaryTextColor: text,
      secondaryColor: surface3,
      secondaryBorderColor: line,
      secondaryTextColor: text,
      tertiaryColor: surface3,
      tertiaryBorderColor: line,
      tertiaryTextColor: text,
      lineColor: text2,
      textColor: text,
      nodeBorder: line,
      clusterBkg: surface3,
      clusterBorder: line,
      edgeLabelBackground: canvas,
      titleColor: text,
      // 时序图
      actorBkg: surface,
      actorBorder: line,
      actorTextColor: text,
      actorLineColor: line,
      signalColor: text2,
      signalTextColor: text2,
      labelBoxBkgColor: surface,
      labelBoxBorderColor: line,
      labelTextColor: text,
      loopTextColor: text,
      noteBkgColor: cssVar('--accent-wash', ink ? '#1b2a2c' : '#f7e7df'),
      noteBorderColor: cssVar('--accent-soft', ink ? '#2f4a48' : '#d9a291'),
      noteTextColor: text,
      // 状态图 / 类图
      labelColor: text,
      altBackground: surface3,
      classText: text,
      // 饼图
      pie1: accent,
      pie2: surface3,
      pie3: line,
      pieTitleTextColor: text,
      pieSectionTextColor: text,
      pieLegendTextColor: text2,
    },
  }
}

function markFailed(el: HTMLElement, source: string): void {
  el.dataset.rendered = 'failed'
  el.classList.add('mermaid-fallback')
  el.innerHTML =
    `<p class="mermaid-note">图表未能渲染，以下为原始定义</p>` +
    `<pre><code>${escapeHtml(source)}</code></pre>`
}

async function runMermaid(scope: ParentNode | undefined): Promise<void> {
  const root = scope ?? document
  const theme = currentTheme()
  const themeChanged = appliedTheme !== theme
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.mermaid')).filter(
    (el) => themeChanged || !el.dataset.rendered,
  )
  if (!nodes.length) return

  // 先把源码落到 data-src：首次取 textContent，之后 svg 已经盖掉文本节点，
  // 切主题重绘只能靠这份备份还原。
  const jobs = nodes.map((el) => {
    const source = el.dataset.src ?? el.textContent ?? ''
    el.dataset.src = source
    return { el, source }
  })

  let mermaid: MermaidApi
  try {
    mermaid = await loadMermaid()
  } catch {
    jobs.forEach((job) => markFailed(job.el, job.source))
    return
  }

  if (themeChanged) {
    mermaid.initialize(mermaidConfig())
    appliedTheme = theme
  }

  for (const { el, source } of jobs) {
    if (!source.trim()) continue
    try {
      const result = await mermaid.render(`mermaid-${(renderSeq += 1)}`, source)
      const svg = typeof result === 'string' ? result : (result as { svg?: string } | null)?.svg
      if (!svg) throw new Error('empty svg')
      el.innerHTML = svg
      el.dataset.rendered = '1'
      el.classList.remove('mermaid-fallback')
    } catch {
      markFailed(el, source)
    }
  }
}

/** 渲染 scope 内（默认整个文档）尚未处理的 .mermaid 节点。必须等节点真的进了 DOM 再调用。 */
export function renderMermaid(scope?: ParentNode): Promise<void> {
  renderQueue = renderQueue.then(
    () => runMermaid(scope),
    () => runMermaid(scope),
  )
  return renderQueue
}
