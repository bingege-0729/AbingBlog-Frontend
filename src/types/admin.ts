export type Status = 'draft' | 'published'

// —— 友链（与前台共用结构，从 content 类型再导出一次方便 admin 侧引用）——
export type { FriendLink, FriendLinkInput, FriendStatus } from './content'

export interface Paginated<T> {
  list: T[]
  total: number
  page: number
  page_size: number
}

export interface Category {
  id: number
  name: string
  slug: string
  sort: number
  article_count: number
}

export interface CategoryInput {
  name: string
  slug: string
  sort: number
}

export interface Tag {
  id: number
  name: string
  article_count: number
}

export interface TagInput {
  name: string
}

export interface Article {
  id: number
  title: string
  summary: string
  cover: string
  url: string
  content?: string
  category: { id: number; name: string; slug: string } | null
  tags: { id: number; name: string }[]
  status: Status
  view_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface ArticleInput {
  title: string
  content: string
  summary: string
  cover: string
  url: string
  category_id: number
  tag_ids: number[]
  status: Status
}

export interface Project {
  id: number
  slug: string
  name: string
  detail: string
  stack: string
  github_url: string
  demo_url: string
  sort: number
  status: Status
  created_at: string
  updated_at: string
}

export interface ProjectInput {
  slug: string
  name: string
  detail: string
  stack: string
  github_url: string
  demo_url: string
  sort: number
  status: Status
}

// —— 访客记录（对应后端 visit_logs / GET /admin/visits*）——

export interface VisitLog {
  id: number
  visitor_key: string
  nickname: string
  path: string
  // api = 接口调用（中间件自动记）；page = 前台页面浏览（路由切换主动上报）
  kind: string
  ip: string
  device: string
  user_agent: string
  created_at: string
}

export interface VisitorSummary {
  visitor_key: string
  nickname: string
  device: string
  user_agent: string
  ip: string
  visits: number
  last_seen_at: string
}

export interface TopPath {
  path: string
  visits: number
}

export interface VisitStats {
  total: number
  today: number
  distinct_users: number
  today_distinct: number
}

export interface VisitSummaryData {
  stats: VisitStats
  visitors: VisitorSummary[]
  top_paths: TopPath[]
}
