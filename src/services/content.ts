import { siteConfig } from '../config/site'
import { mockPosts, mockPostContents, mockProjects } from '../data/mock'
import type { PostDetail, PostSummary, ProjectSummary, JuejinStats } from '../types/content'

export interface ContentService {
  listPosts(): Promise<PostSummary[]>
  getPost(id: string): Promise<PostDetail>
  listProjects(): Promise<ProjectSummary[]>
  // 批量查询掘金文章公开阅读数据：url -> { ok, views, ... }。前端卡片/阅读页展示用。
  batchJuejinStats(urls: string[]): Promise<Record<string, JuejinStats>>
}

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface ArticleListData {
  list: Array<{
    id: number
    title: string
    summary: string
    url?: string
    published_at: string
    category?: { name: string }
    tags?: Array<{ name: string }>
  }>
}

interface ArticleDetailData {
  id: number
  title: string
  summary: string
  cover?: string
  url?: string
  content?: string
}

interface ProjectListData {
  list: Array<{
    slug: string
    name: string
    detail: string
    stack: string
    github_url?: string
    demo_url?: string
  }>
}

export const mockContentService: ContentService = {
  async listPosts() { return mockPosts },
  async getPost(id: string) {
    const post = mockPosts.find((item) => item.slug === id)
    if (!post) throw new Error('文章不存在')
    return {
      title: post.title,
      summary: post.summary ?? '',
      content: mockPostContents[id] ?? '',
      cover: '',
      url: post.url ?? '',
    }
  },
  async listProjects() { return mockProjects },
  async batchJuejinStats(urls: string[]) {
    const map: Record<string, JuejinStats> = {}
    for (const u of urls) {
      if (u && u.includes('juejin.cn')) {
        // 假数据兜底：本地无后端时也能看到展示效果
        map[u] = { ok: true, views: 1280, likes: 36, comments: 4, collects: 12, fetched_at: new Date().toISOString() }
      } else {
        map[u] = { ok: false, views: 0, likes: 0, comments: 0, collects: 0, fetched_at: '' }
      }
    }
    return map
  },
}

export function createApiContentService(): ContentService {
  async function get<T>(path: string): Promise<T> {
    // 每次调用都取全局 fetch（main.ts 已装访客头包装）。若在模块加载期用默认参数捕获 fetch，
    // 拿到的是未包装的原始 fetch，内容请求会漏带 X-Visitor-ID，前后台访客身份不一致。
    const response = await fetch(`${siteConfig.apiBaseUrl}${path}`)
    if (!response.ok) throw new Error(`API request failed: ${response.status}`)
    const text = await response.text()
    if (!text) throw new Error('API returned an empty response')
    let payload: ApiEnvelope<T>
    try {
      payload = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      throw new Error('API returned invalid JSON')
    }
    if (payload.code !== 0) throw new Error(payload.message)
    return payload.data
  }

  // POST 封装：JSON 信封统一拆包，与 get 同款错误处理。
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${siteConfig.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`API request failed: ${response.status}`)
    const text = await response.text()
    if (!text) throw new Error('API returned an empty response')
    let payload: ApiEnvelope<T>
    try {
      payload = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      throw new Error('API returned invalid JSON')
    }
    if (payload.code !== 0) throw new Error(payload.message)
    return payload.data
  }

  return {
    async listPosts() {
      const data = await get<ArticleListData>('/articles?page=1&page_size=10')
      return (data.list ?? []).map((article) => ({
        slug: String(article.id),
        date: article.published_at?.slice(0, 10).replaceAll('-', '.') ?? '',
        title: article.title,
        tag: article.category?.name ?? article.tags?.[0]?.name ?? 'NOTE',
        summary: article.summary,
        url: article.url,
      }))
    },
    async getPost(id: string) {
      const data = await get<ArticleDetailData>(`/articles/${id}`)
      return {
        title: data.title,
        summary: data.summary,
        content: data.content ?? '',
        cover: data.cover ?? '',
        url: data.url ?? '',
      }
    },
    async listProjects() {
      const data = await get<ProjectListData>('/projects?page=1&page_size=10')
      return (data.list ?? []).map((project) => ({
        slug: project.slug,
        name: project.name,
        detail: project.detail,
        stack: project.stack,
        githubUrl: project.github_url,
        demoUrl: project.demo_url,
      }))
    },
    async batchJuejinStats(urls: string[]) {
      if (!urls.length) return {}
      const data = await post<Record<string, JuejinStats>>('/juejin/stats', { urls })
      return data ?? {}
    },
  }
}

// 根据 VITE_USE_MOCK 开关选择数据来源：true 用 mock，false 调后端。
export const contentService: ContentService = siteConfig.useMockData
  ? mockContentService
  : createApiContentService()
