<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { siteConfig } from './config/site'
import { contentService } from './services/content'
import { friendLinkService } from './services/friendLink'
import { clearSession } from './services/admin'
import AdminView from './admin/AdminView.vue'
import ArcadeScene from './components/ArcadeScene.vue'
import SideRail from './components/SideRail.vue'
import PostView from './PostView.vue'
import type { PostSummary, ProjectSummary, FriendLink, Profile } from './types/content'
import { renderMermaid } from './utils/markdown'
import { friendlyError } from './utils/error'
import { fetchProfile, defaultProfile } from './services/profile'
import { THEMES, applyTheme, persistTheme, resolveTheme, type ThemeName } from './utils/theme'
import { fetchResumeMeta, resumeFileUrl, type ResumeMeta } from './services/resume'
import { reportPageView } from './services/visits'
import { shots as galleryShots, type Shot as GalleryShot } from './data/gallery'
import { moments as lifeMoments } from './data/moments'

type Section = 'home' | 'posts' | 'projects' | 'gallery' | 'moments' | 'links' | 'settings'

const isAdminMode = ref(false)
const current = ref<Section>('home')
const scanlines = ref(false)
const motion = ref(true)
const fontSize = ref(15)
const adminLoginOpen = ref(false)
const adminUsername = ref('')
const adminPassword = ref('')
const loginError = ref('')
const loggingIn = ref(false)

// 安全解析响应 JSON：空响应或非 JSON 内容返回 null，避免 response.json() 抛 "Unexpected end of JSON input"。
async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

const posts = ref<PostSummary[]>([])
const projects = ref<ProjectSummary[]>([])
const contentError = ref('')
const postsError = ref('')
const projectsError = ref('')
const profile = ref<Profile>({ ...defaultProfile })

// 当前配色。真实值由 resolveTheme() 决定（URL > localStorage > 管理端默认），
// 这里只是给设置面板做高亮用。
const theme = ref<ThemeName>(resolveTheme())

function chooseTheme(id: ThemeName) {
  theme.value = id
  persistTheme(id)
  // 图表颜色是渲染时写进 svg 的，换皮肤后要重画一遍才跟得上
  nextTick(() => renderMermaid())
}

// —— 友链 ——
const friendLinks = ref<FriendLink[]>([])      // 前台已上架
const myLinks = ref<FriendLink[]>([])          // 我的提交（含待审核/已驳回）
const linksError = ref('')                     // 我的友链区错误（前台列表失败并入 contentError）
const linksLoaded = ref(false)                 // 只在首次进入友链页时拉一次我的提交
const linkSaving = ref(false)
const editingLinkId = ref<number | null>(null)
const linkForm = ref({ name: '', url: '', avatar: '', description: '' })

const FRIEND_STATUS_TEXT: Record<number, string> = { 0: '待审核', 1: '已上架', 2: '已驳回' }

function friendStatusText(link: FriendLink): string {
  return FRIEND_STATUS_TEXT[link.status] ?? '未知'
}

function openLink(url: string) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

// 头像缺省：用站点名称首字符当徽标，避免空图位
function linkBadge(link: FriendLink): string {
  return (link.name.trim()[0] ?? '?').toUpperCase()
}

let lastContentLoadedAt = 0

async function loadContent() {
  contentError.value = ''
  const results = await Promise.allSettled([
    contentService.listPosts(),
    contentService.listProjects(),
    friendLinkService.listApproved(),
  ])
  const [postResult, projectResult, linkResult] = results
  if (postResult.status === 'fulfilled') posts.value = postResult.value
  if (projectResult.status === 'fulfilled') projects.value = projectResult.value
  if (linkResult.status === 'fulfilled') friendLinks.value = linkResult.value
  postsError.value = postResult.status === 'fulfilled' ? '' : friendlyError(postResult.reason, '文章加载失败')
  projectsError.value = projectResult.status === 'fulfilled' ? '' : friendlyError(projectResult.reason, '项目加载失败')
  lastContentLoadedAt = Date.now()
  const failed = results.find((result) => result.status === 'rejected')
  if (failed && failed.status === 'rejected') {
    contentError.value = friendlyError(failed.reason, '内容加载失败')
    scheduleContentRetry()
  }
}

// 首次加载失败时自动重试一次，避免接口抖动后页面一直空白。
let contentRetryTimer: number | null = null
function scheduleContentRetry() {
  if (contentRetryTimer !== null) return
  contentRetryTimer = window.setTimeout(() => {
    contentRetryTimer = null
    if (!posts.value.length && !projects.value.length) refreshContent(true)
  }, 3000)
}

// 栏目切换时按需刷新，5s 内重复进入不重复请求；force 用于页面重新可见时强制更新。
function refreshContent(force = false) {
  if (!force && Date.now() - lastContentLoadedAt < 5000) return
  loadContent()
}

// 切回标签页/窗口重新可见时刷新，避免挂着旧数据或首次失败后的空白。
function onVisibilityChange() {
  if (document.visibilityState === 'visible') refreshContent(true)
}

async function loadMyLinks() {
  linksError.value = ''
  try {
    myLinks.value = await friendLinkService.listMine()
  } catch (error) {
    linksError.value = friendlyError(error, '我的友链加载失败')
  }
}

function resetLinkForm() {
  editingLinkId.value = null
  linkForm.value = { name: '', url: '', avatar: '', description: '' }
}

function editMyLink(link: FriendLink) {
  editingLinkId.value = link.id
  linkForm.value = {
    name: link.name,
    url: link.url,
    avatar: link.avatar,
    description: link.description,
  }
}

async function submitLink() {
  if (linkSaving.value) return
  const name = linkForm.value.name.trim()
  const url = linkForm.value.url.trim()
  if (!name || !url) {
    linksError.value = '站点名称和地址为必填项'
    return
  }
  linkSaving.value = true
  linksError.value = ''
  const input = {
    name,
    url,
    avatar: linkForm.value.avatar.trim(),
    description: linkForm.value.description.trim(),
    sort: 0,
    status: 0 as const, // 后端忽略该值，提交一律待审核
  }
  try {
    if (editingLinkId.value === null) await friendLinkService.create(input)
    else await friendLinkService.update(editingLinkId.value, input)
    resetLinkForm()
    await loadMyLinks()
  } catch (error) {
    linksError.value = friendlyError(error, '提交失败，请稍后重试')
  } finally {
    linkSaving.value = false
  }
}

const confirmDeleteLinkId = ref<number | null>(null)

async function deleteMyLink() {
  const id = confirmDeleteLinkId.value
  if (id === null || linkSaving.value) return
  linkSaving.value = true
  linksError.value = ''
  try {
    await friendLinkService.remove(id)
    confirmDeleteLinkId.value = null
    if (editingLinkId.value === id) resetLinkForm()
    await loadMyLinks()
  } catch (error) {
    linksError.value = friendlyError(error, '删除失败')
    confirmDeleteLinkId.value = null
  } finally {
    linkSaving.value = false
  }
}

// 项目列表：点击左侧展开主要内容，点击箭头跳转到项目链接（github 优先，其次 demo）。
const expandedProject = ref<string | null>(null)

function toggleProject(slug: string) {
  expandedProject.value = expandedProject.value === slug ? null : slug
}

function projectUrl(project: ProjectSummary) {
  return project.githubUrl ?? project.demoUrl ?? ''
}

function openProject(project: ProjectSummary) {
  const url = projectUrl(project)
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

// 文章列表：点开跳到独立阅读页（PostView），点箭头跳原文外链。
const openPostSlug = ref<string | null>(null)

// 列表/卡片点进来：有外链直达，否则进阅读页。URL 保持 /posts/:slug。
function openPostItem(post: PostSummary) {
  if (post.url) {
    window.open(post.url, '_blank', 'noopener,noreferrer')
    return
  }
  current.value = 'posts'
  openPostSlug.value = post.slug
  syncPath(`/posts/${post.slug}`)
  trackPageView(`/posts/${post.slug}`)
  window.scrollTo(0, 0)
}

// 阅读页「返回列表」
function closePost() {
  openPostSlug.value = null
  syncPath('/posts')
  trackPageView('/posts')
}

// 阅读页「上一篇 / 下一篇」：只换 slug，PostView 自己 watch 重拉
function openSlug(slug: string) {
  openPostSlug.value = slug
  syncPath(`/posts/${slug}`)
  trackPageView(`/posts/${slug}`)
  window.scrollTo(0, 0)
}

// 首页的「最新」和「精选」都基于这份按日期倒序的列表：
// 不依赖接口返回顺序（后端按 published_at 倒序，但接口一改就会错位），
// 也保证「精选」跳过的那篇正好是「最新」显示的那篇，不会重复。
const sortedPosts = computed(() =>
  [...posts.value].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
)
const latestPost = computed(() => sortedPosts.value[0] ?? null)

// 经历时间线：每条存成 "时间段 | 标题 | 说明"，这里拆成三段渲染。
// 说明可省略；标题为空的行直接丢掉，避免后台留空行在页面上出现空条目。
const experiences = computed(() =>
  profile.value.experiences
    .map((raw) => {
      const [time = '', title = '', detail = ''] = raw.split('|').map((part) => part.trim())
      return { raw, time, title, detail }
    })
    .filter((item) => item.title),
)

function openPost(post: PostSummary) {
  if (post.url) window.open(post.url, '_blank', 'noopener,noreferrer')
}

// 首页「最新」卡片
function openLatestPost() {
  const post = latestPost.value
  if (!post) {
    navigate('posts')
    return
  }
  openPostItem(post)
}

// 首页项目卡片：有仓库/演示则直达，没有则进项目页
function openProjectItem(project: ProjectSummary) {
  if (projectUrl(project)) openProject(project)
  else navigate('projects')
}

// 项目列表：有链接直接跳转；没有链接才展开，且展开区只放链接，避免和列表里的描述重复
function toggleOrOpenProject(project: ProjectSummary) {
  if (projectUrl(project)) openProject(project)
  else toggleProject(project.slug)
}


// —— 影像 / 生活：静态数据栏目，不走接口，内容维护见 src/data/ 下两个文件 ——
const latestMoment = lifeMoments[0] ?? null
const lightbox = ref<{ src: string; isVideo: boolean; caption: string } | null>(null)

function isVideo(src: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(src)
}

// 点开大图：传 shot 时拼出「标题 —— 说明 · 地点 · 时间」的说明行
function openLightbox(src: string, shot?: GalleryShot) {
  const caption = shot
    ? [shot.title, shot.desc, [shot.location, shot.takenAt].filter(Boolean).join(' · ')].filter(Boolean).join(' —— ')
    : ''
  lightbox.value = { src, isVideo: isVideo(src), caption }
}

function closeLightbox() {
  lightbox.value = null
}

const sections: { id: Section; label: string; command: string }[] = [
  { id: 'home', label: '首页', command: 'cd ~' },
  { id: 'posts', label: '文章', command: 'cd posts' },
  { id: 'projects', label: '项目', command: 'cd projects' },
  { id: 'links', label: '友链', command: 'cd links' },
]

// 左侧栏只列主内容栏目；影像 / 动态 / 友链 / 设置收进左下角一个入口，不占导航位。
const primarySections = sections.filter((section) => section.id !== 'links')

// 顶部导航：编辑式布局下导航回到顶栏，全部栏目平铺（简历另有独立按钮）。
const navSections: { id: Section; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'posts', label: '文章' },
  { id: 'projects', label: '项目' },
  { id: 'gallery', label: '影像' },
  { id: 'moments', label: '动态' },
  { id: 'links', label: '友链' },
  { id: 'settings', label: '设置' },
]

// 顶栏的快捷配色开关：只做 sand / ink 互换
function toggleTheme() {
  chooseTheme(theme.value === 'ink' ? 'sand' : 'ink')
}

// 项目 stack 字段是 "GO · VUE · MYSQL" 这种串，拆成 chips 用
function stackChips(stack: string | undefined): string[] {
  if (!stack) return []
  return stack
    .split(/[·/|,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
}

// 左下角工具菜单：默认只有一个圆形按钮，悬停（或点击）才展开条目，点条目才切页。
// 图标用路径串存，避免同一条 d 在菜单里重复抄两遍。
const cornerItems: {
  id: Section
  label: string
  paths: string[]
  circle?: { cx: number; cy: number; r: number }
}[] = [
  {
    id: 'gallery',
    label: '影像',
    paths: ['M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
    circle: { cx: 12, cy: 13, r: 3.5 },
  },
  {
    id: 'moments',
    label: '生活动态',
    paths: ['M17 8h1.5a2.5 2.5 0 0 1 0 5H17', 'M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z', 'M6 2v3M10 2v3M14 2v3'],
  },
  {
    id: 'links',
    label: '友链',
    paths: [
      'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1 1',
      'M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1-1',
    ],
  },
  {
    id: 'settings',
    label: '显示设置',
    paths: [
      'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    ],
    circle: { cx: 12, cy: 12, r: 3 },
  },
]

// 触屏没有 hover：点按钮切换展开态；鼠标端靠 CSS :hover，两者共存不冲突。
const dockOpen = ref(false)
const dockActive = computed(() => cornerItems.some((item) => item.id === current.value))

function openDockItem(id: Section) {
  dockOpen.value = false
  navigate(id)
}

const promptPath = computed(() => current.value === 'home' ? '~' : `~/${current.value}`)

// 简历不做页面：点一下就下载 PDF。
// 站点是给 HR 30 秒扫的，多一个页面就多一次「要不要点进去」的决策；
// 而 PDF 才是他们真正要存档、转发、丢进招聘系统的东西。
// 文件由后台「简历」面板上传，前台先问一次元信息才知道有没有东西可下；
// siteConfig.resumeUrl 保留作手动兜底（比如临时放一个静态文件在 public 下）。
const resumeMeta = ref<ResumeMeta>({ available: false, filename: '', size: 0, updated_at: '' })
const resumeDownloadUrl = computed(() => (resumeMeta.value.available ? resumeFileUrl : siteConfig.resumeUrl))
const resumeFileName = computed(() => resumeMeta.value.filename || `${siteConfig.name}-简历.pdf`)

async function loadResumeMeta() {
  resumeMeta.value = await fetchResumeMeta()
}

// 老的 /resume 链接可能已经发出去了（邮件签名、微信里都留着）：
// 落到这个地址就直接触发下载，再把地址还原成首页，不留一个空白页。
async function handleLegacyResumePath() {
  if (window.location.pathname.replace(/\/+$/, '') !== '/resume') return
  window.history.replaceState({ path: '/' }, '', '/')
  await loadResumeMeta()
  if (!resumeDownloadUrl.value) return
  // 用临时 <a download> 触发，而不是 location.assign：
  // 后者会把标签页导航到 PDF 预览器，等于把站点"顶掉"了。
  const link = document.createElement('a')
  link.href = resumeDownloadUrl.value
  link.download = resumeFileName.value
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// —— 地址栏同步：栏目和单篇文章各自有独立 URL，便于分享、收藏、刷新后恢复现场 ——
const sectionPaths: Record<Section, string> = {
  home: '/',
  posts: '/posts',
  projects: '/projects',
  gallery: '/gallery',
  moments: '/moments',
  links: '/links',
  settings: '/',
}

let pendingPostSlug: string | null = null

function pathFor(section: Section): string {
  return sectionPaths[section]
}

// 解析地址：/posts/3 → 文章页并展开第 3 篇；/projects → 项目页；其余按栏目匹配
function readLocation(): { section: Section; postSlug: string | null } {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const postMatch = path.match(/^\/posts\/([\w-]+)$/)
  if (postMatch) return { section: 'posts', postSlug: postMatch[1] }
  const matched = (Object.keys(sectionPaths) as Section[]).find((key) => sectionPaths[key] === path)
  return { section: matched ?? 'home', postSlug: null }
}

// 只在地址真的变化时入栈，避免同一地址被重复压栈
function syncPath(path: string) {
  if (window.location.pathname !== path) window.history.pushState({ path }, '', path)
}

// 浏览器前进/后退：按地址回放栏目与展开状态
function handlePopState() {
  const { section, postSlug } = readLocation()
  current.value = section
  // 进文章页则展开阅读页，回到 /posts 或别的栏目则清掉，列表自然显示
  openPostSlug.value = section === 'posts' ? postSlug : null
  // 浏览器前进/后退 = 一次新的页面浏览（地址已经是目标地址了，直接读 pathname）
  trackPageView()
  if (section === 'links' && !linksLoaded.value) {
    linksLoaded.value = true
    loadMyLinks()
  }
}

// 后台入口：设置页底部一颗按钮（街机入口去掉后，这里是唯一入口）
function openAdminLogin() {
  adminLoginOpen.value = true
  loginError.value = ''
}


async function loginAdmin() {
  if (!adminUsername.value || !adminPassword.value || loggingIn.value) return
  loggingIn.value = true
  loginError.value = ''
  try {
    const response = await fetch(`${siteConfig.apiBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername.value, password: adminPassword.value }),
    })
    // 后端只返回 token（无 expires_in），过期靠 admin 请求的 401 兜底
    const payload = await readJson<{ code: number; message: string; data?: { token: string } }>(response)
    if (!response.ok || !payload || payload.code !== 0 || !payload.data?.token) throw new Error(payload?.message || `登录失败 (${response.status})`)
    localStorage.setItem('abing_access_token', payload.data.token)
    adminLoginOpen.value = false
    isAdminMode.value = true
  } catch (error) {
    loginError.value = friendlyError(error, '登录失败，请稍后重试')
  } finally {
    loggingIn.value = false
  }
}

// 退出后台：清 token，回公开站点首页
function logoutAdmin() {
  clearSession()
  isAdminMode.value = false
  current.value = 'home'
  syncPath('/')
}

// 返回公开站点：token 保留，之后想再进后台需重新走登录
function backToSite() {
  isAdminMode.value = false
  current.value = 'home'
  syncPath('/')
  // 后台编辑后回到前台，强制刷新一次，避免继续展示旧列表
  refreshContent(true)
  fetchProfile().then((data) => {
    profile.value = data
    // 管理端设定的站点默认配色在这里生效；访客自己选过的会被 localStorage 压过一层
    theme.value = resolveTheme(data.theme)
    applyTheme(theme.value, false)
  })
  loadResumeMeta()
}

// 页面浏览上报：访问日志只在 API 请求上落一条，纯前端切页（命中缓存不发请求）会漏记。
// 这里在每次"路由"真正变化时补一次，同一路径不重复记；后台管理页不算前台访问。
let lastTrackedPath = ''
function trackPageView(path?: string) {
  if (isAdminMode.value) return
  const target = path ?? (window.location.pathname || '/')
  if (target === lastTrackedPath) return
  lastTrackedPath = target
  void reportPageView(target)
}

function navigate(section: Section) {
  current.value = section
  // 切栏目时退出文章阅读页，保证点「文章」一定回到列表（openPostItem 不走 navigate，不会误清）
  openPostSlug.value = null
  if (section === 'posts' || section === 'projects' || section === 'links') refreshContent()
  if (section === 'links' && !linksLoaded.value) {
    linksLoaded.value = true
    loadMyLinks()
  }
  if (section !== 'settings') syncPath(pathFor(section))
  // settings 不改地址，但仍算一次页面浏览，所以统一用 pathFor 而不是读 pathname
  trackPageView(pathFor(section))
}


onMounted(async () => {
  // 先按地址落位：深链直接进目标栏目，不用先过一遍街机入口
  const { section, postSlug } = readLocation()
  current.value = section
  pendingPostSlug = postSlug
  // 首屏也算一次页面浏览（深链 /posts/3 直接进文章，同样要记）
  trackPageView()
  if (section === 'links' && !linksLoaded.value) {
    linksLoaded.value = true
    loadMyLinks()
  }
  fetchProfile().then((data) => {
    profile.value = data
    // 管理端设定的站点默认配色在这里生效；访客自己选过的会被 localStorage 压过一层
    theme.value = resolveTheme(data.theme)
    applyTheme(theme.value, false)
  })
  void handleLegacyResumePath()
  loadResumeMeta()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) motion.value = false

  // —— 全站 3D 视差 ——
  // 唯一一处指针监听，只写两个 CSS 变量（--px / --py，取值 -1~1），
  // 具体怎么用由 src/styles/depth.css 决定，组件不各自绑事件。
  // 触屏、减少动效、或设置里关掉动画时不启用。
  const canParallax = motion.value && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  if (canParallax) {
    const root = document.documentElement
    let ticking = false
    const onPointerMove = (event: MouseEvent) => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        ticking = false
        const px = (event.clientX / window.innerWidth - 0.5) * 2
        const py = (event.clientY / window.innerHeight - 0.5) * 2
        root.style.setProperty('--px', px.toFixed(3))
        root.style.setProperty('--py', py.toFixed(3))
      })
    }
    window.addEventListener('mousemove', onPointerMove, { passive: true })
    onBeforeUnmount(() => window.removeEventListener('mousemove', onPointerMove))
  }
  window.addEventListener('popstate', handlePopState)
  document.addEventListener('visibilitychange', onVisibilityChange)

  // 内容到位后再展开深链指向的文章，保证列表行已经渲染出来
  await loadContent()
  if (pendingPostSlug) {
    const slug = pendingPostSlug
    pendingPostSlug = null
    current.value = 'posts'
    openPostSlug.value = slug
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (contentRetryTimer !== null) window.clearTimeout(contentRetryTimer)
})
</script>

<template>
  <AdminView v-if="isAdminMode" @logout="logoutAdmin" @back="backToSite" />
  <main v-else class="site-shell" :class="{ 'no-motion': !motion }" :style="{ '--terminal-size': `${fontSize}px` }">
    <div v-if="adminLoginOpen" class="admin-login" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
      <button class="admin-login-close" type="button" aria-label="Close administrator login" @click="adminLoginOpen = false">×</button>
      <p class="eyebrow">SERVICE ACCESS / NODE 01</p>
      <h2 id="admin-login-title">ADMIN LOGIN</h2>
      <form @submit.prevent="loginAdmin">
        <label>USERNAME<input v-model="adminUsername" name="username" autocomplete="username" required /></label>
        <label>PASSWORD<input v-model="adminPassword" name="password" type="password" autocomplete="current-password" required /></label>
        <p v-if="loginError" class="login-error" role="alert">{{ loginError }}</p>
        <button class="admin-submit" type="submit" :disabled="loggingIn">{{ loggingIn ? 'AUTHENTICATING...' : 'CONNECT' }}</button>
      </form>
    </div>

    <section class="site-frame">
      <header class="site-header">
        <button class="site-logo" type="button" title="返回首页" @click="navigate('home')">A<i>/</i></button>
        <nav class="site-nav" aria-label="主导航">
          <button v-for="item in navSections" :key="item.id" type="button" :aria-current="current === item.id ? 'page' : undefined" @click="navigate(item.id)">{{ item.label }}</button>
        </nav>
        <div class="header-actions">
          <button class="icon-btn" type="button" :title="theme === 'ink' ? '换成暖纸·朱砂' : '换成石墨·青'" :aria-label="theme === 'ink' ? '换成暖纸·朱砂' : '换成石墨·青'" @click="toggleTheme"><i></i></button>
          <!-- 简历只有下载这一个动作；后台没上传文件时这颗按钮不出现，不留点了没反应的入口 -->
          <a v-if="resumeDownloadUrl" class="header-resume" :href="resumeDownloadUrl" :download="resumeFileName">简历<span class="resume-pdf-word"> PDF</span> ↓</a>
        </div>
        <div class="header-progress" aria-hidden="true"></div>
      </header>

      <div class="layout">
        <div class="page">

            <section v-if="current === 'home'" class="home-view">
              <section class="hero" aria-labelledby="hero-title">
                <h1 id="hero-title" class="hero-title" :data-name="siteConfig.name">{{ siteConfig.name }}</h1>
                <p class="hero-meta">
                  <b>{{ profile.headline }}</b>
                  <template v-if="profile.location"><span class="dot">/</span><span>{{ profile.location }}</span></template>
                  <template v-if="profile.stacks.length"><span class="dot">/</span><span>{{ profile.stacks.slice(0, 3).join(' / ') }}</span></template>
                </p>
                <div class="hero-actions">
                  <a v-if="resumeDownloadUrl" class="btn-primary" :href="resumeDownloadUrl" :download="resumeFileName">下载简历 PDF <span aria-hidden="true">↓</span></a>
                  <a v-if="siteConfig.email" class="btn-ghost" :href="`mailto:${siteConfig.email}`">{{ siteConfig.email }}</a>
                  <div class="hero-icons">
                    <a v-if="siteConfig.github" :href="siteConfig.github" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub">
                      <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/></svg>
                    </a>
                    <a v-if="siteConfig.juejin" :href="siteConfig.juejin" target="_blank" rel="noopener noreferrer" title="掘金" aria-label="掘金">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <defs><linearGradient id="heroJuejinGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4e9bff"/><stop offset="1" stop-color="#1e80ff"/></linearGradient></defs>
                        <path d="M12 1.6 2.4 9l4 12.4h11.2L21.6 9 12 1.6Z" fill="url(#heroJuejinGrad)"/>
                        <path d="M12 6.5 7.2 10.1l2.1 5.8h5.4l2.1-5.8L12 6.5Z" fill="#ffffff" opacity=".92"/>
                      </svg>
                    </a>
                    <a v-if="siteConfig.csdn" :href="siteConfig.csdn" target="_blank" rel="noopener noreferrer" title="CSDN" aria-label="CSDN">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="2" y="3" width="20" height="18" rx="4" fill="#fc5531"/>
                        <text x="12" y="16.4" text-anchor="middle" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" fill="#ffffff">C</text>
                      </svg>
                    </a>
                    <a v-if="siteConfig.email" :href="`mailto:${siteConfig.email}`" title="邮箱" aria-label="邮箱">
                      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.6 6.6 8.4 5.9 8.4-5.9"/></svg>
                    </a>
                  </div>
                </div>
              </section>

              <section id="sec-room" class="sec" aria-labelledby="home-room-title">
                <div class="sec-head">
                  <span class="sec-tag">webgl / interactive</span>
                </div>
                <ArcadeScene :name="siteConfig.name" @admin="openAdminLogin" />
              </section>

              <section id="sec-projects" class="sec" aria-labelledby="home-projects-title">
                <div class="sec-head">
                  <h2 id="home-projects-title">项目</h2>
                  <p>自己从零写完、并且还在维护的东西。点开能看实现思路和踩过的坑。</p>
                  <button class="sec-more" type="button" @click="navigate('projects')">全部 {{ projects.length }} 个 ↗</button>
                </div>
                <div v-if="projects.length" class="proj-grid">
                  <button v-for="project in projects.slice(0, 3)" :key="project.slug" class="proj-card" type="button" @click="openProjectItem(project)">
                    <span class="proj-art" aria-hidden="true"></span>
                    <span class="proj-body">
                      <h3>{{ project.name }}</h3>
                      <p>{{ project.detail }}</p>
                      <span class="chips">
                        <span v-for="tag in stackChips(project.stack)" :key="tag" class="chip">{{ tag }}</span>
                      </span>
                    </span>
                  </button>
                </div>
                <p v-else class="eyebrow">暂无项目</p>
              </section>

              <section id="sec-posts" class="sec" aria-labelledby="home-posts-title">
                <div class="sec-head">
                  <h2 id="home-posts-title">文章</h2>
                  <p>踩过的坑、想明白的事，按时间倒序。</p>
                  <button class="sec-more" type="button" @click="navigate('posts')">全部 {{ posts.length }} 篇 ↗</button>
                </div>
                <div v-if="sortedPosts.length" class="post-list">
                  <button v-for="post in sortedPosts.slice(0, 4)" :key="post.slug" class="post-item" type="button" @click="openPostItem(post)">
                    <time>{{ post.date }}</time>
                    <span>
                      <h3>{{ post.title }}</h3>
                      <p v-if="post.summary">{{ post.summary }}</p>
                    </span>
                    <span class="arrow" aria-hidden="true">↗</span>
                  </button>
                </div>
                <p v-else class="eyebrow">暂无文章</p>
              </section>


              <section id="sec-about" class="sec" aria-labelledby="home-about-title">
                <div class="sec-head">
                  <h2 id="home-about-title">关于</h2>
                  <p>写代码之外的补充信息，一段话说明我在做什么。</p>
                  <span class="sec-tag">profile / stack / now</span>
                </div>
                <div class="about-grid">
                  <p class="about-intro">{{ profile.summary }}</p>
                  <dl class="about-meta">
                    <div v-if="profile.stacks.length"><dt>技术栈</dt><dd><span class="chips"><span v-for="tag in profile.stacks" :key="tag" class="chip">{{ tag }}</span></span></dd></div>
                    <div v-if="profile.awards.length"><dt>奖项</dt><dd>{{ profile.awards.join('，') }}</dd></div>
                    <div v-if="profile.doing"><dt>最近在做</dt><dd>{{ profile.doing }}</dd></div>
                    <div v-if="profile.interests.length"><dt>兴趣</dt><dd>{{ profile.interests.join(' · ') }}</dd></div>
                    <div v-if="latestMoment"><dt>最近动态</dt><dd>{{ latestMoment.text }}</dd></div>
                  </dl>
                </div>
              </section>
            </section>


            <section v-else-if="current === 'posts'" class="list-view">
              <PostView v-if="openPostSlug" :slug="openPostSlug" :posts="posts" @close="closePost" @open="openSlug" />
              <template v-else>
                <div class="view-title"><p class="eyebrow">目录 / 文章</p><h2>文章</h2><span>共 {{ posts.length }} 篇</span></div>
                <p v-if="postsError" class="login-error" role="alert">{{ postsError }}</p>
                <p v-else-if="!posts.length" class="eyebrow">暂无文章</p>
                <article v-for="post in posts" :key="post.slug" class="post-row">
                  <div class="post-main" role="button" tabindex="0" @click="openPostItem(post)" @keydown.enter.prevent="openPostItem(post)" @keydown.space.prevent="openPostItem(post)">
                    <h3>{{ post.title }}</h3>
                    <p v-if="post.summary" class="post-summary">{{ post.summary }}</p>
                  </div>
                  <time class="post-date">{{ post.date }}</time>
                  <span class="post-tag">{{ post.tag }}</span>
                  <button class="post-link" type="button" :title="post.url ? '打开原文链接' : '暂无外链'" :aria-label="post.url ? '打开原文链接' : '暂无外链'" :disabled="!post.url" @click="openPost(post)">↗</button>
                </article>
              </template>
            </section>

            <section v-else-if="current === 'projects'" class="list-view"><div class="view-title"><p class="eyebrow">目录 / 项目</p><h2>项目</h2><span>共 {{ projects.length }} 个</span></div><p v-if="projectsError" class="login-error" role="alert">{{ projectsError }}</p><article v-for="project in projects" :key="project.slug" class="project-row" :class="{ expanded: expandedProject === project.slug }"><div class="project-main" role="button" tabindex="0" :aria-expanded="expandedProject === project.slug" @click="toggleOrOpenProject(project)" @keydown.enter.prevent="toggleOrOpenProject(project)" @keydown.space.prevent="toggleOrOpenProject(project)"><h3>{{ project.name }}</h3><p>{{ project.detail }}</p></div><span>{{ project.stack }}</span><button class="project-link" type="button" :title="projectUrl(project) ? '打开项目链接' : '暂无链接'" aria-label="打开项目链接" :disabled="!projectUrl(project)" @click="openProject(project)">↗</button><div v-if="expandedProject === project.slug" class="project-detail"><div class="project-detail-links"><a v-if="project.githubUrl" :href="project.githubUrl" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a v-if="project.demoUrl" :href="project.demoUrl" target="_blank" rel="noopener noreferrer">演示 ↗</a><span v-if="!project.githubUrl && !project.demoUrl" class="project-detail-empty">暂无链接</span></div></div></article></section>

            <section v-else-if="current === 'gallery'" class="gallery-view">
              <div class="view-title"><p class="eyebrow">目录 / 影像</p><h2>影像</h2><span>共 {{ galleryShots.length }} 张</span></div>
              <p v-if="!galleryShots.length" class="eyebrow">相机还在充电，照片整理中…（内容维护见 src/data/gallery.ts）</p>
              <template v-else>
                <p class="gallery-lead">随手拍的碎片，按季节和路程攒起来。点击任意一张看大图。</p>
                <div class="portfolio">
                  <figure
                    v-for="(shot, index) in galleryShots"
                    :key="shot.src"
                    class="shot"
                    :class="`shot-span-${shot.span ?? 12}`"
                    @click="openLightbox(shot.src, shot)"
                  >
                    <div class="shot-frame" :style="shot.aspect ? { aspectRatio: shot.aspect } : undefined">
                      <video v-if="isVideo(shot.src)" :src="shot.src" muted playsinline preload="metadata"></video>
                      <img v-else :src="shot.src" :alt="shot.title || 'photograph'" :loading="index < 2 ? 'eager' : 'lazy'" />
                      <span class="shot-open" aria-hidden="true">↗</span>
                    </div>
                    <figcaption>
                      <span class="shot-index">{{ String(index + 1).padStart(2, '0') }}</span>
                      <span class="shot-text">
                        <b v-if="shot.title">{{ shot.title }}</b>
                        <small v-if="shot.location || shot.takenAt">{{ [shot.location, shot.takenAt].filter(Boolean).join(' · ') }}</small>
                      </span>
                    </figcaption>
                  </figure>
                </div>
              </template>
            </section>

            <section v-else-if="current === 'moments'" class="moments-view">
              <div class="view-title"><p class="eyebrow">目录 / 生活</p><h2>动态</h2><span>共 {{ lifeMoments.length }} 条</span></div>
              <p v-if="!lifeMoments.length" class="eyebrow">生活还在 buffer 里，慢慢写…（内容维护见 src/data/moments.ts）</p>
              <ol v-else class="moment-list">
                <li v-for="(moment, index) in lifeMoments" :key="`${moment.date}-${index}`" class="moment-row">
                  <time>{{ moment.date }}</time>
                  <div class="moment-body">
                    <p>{{ moment.text }}</p>
                    <div v-if="moment.images && moment.images.length" class="moment-images">
                      <img v-for="image in moment.images" :key="image" :src="image" alt="" loading="lazy" @click="openLightbox(image)" />
                    </div>
                  </div>
                </li>
              </ol>
            </section>

            <section v-else-if="current === 'links'" class="links-view">
              <div class="view-title"><p class="eyebrow">目录 / 友链</p><h2>友链</h2><span>共 {{ friendLinks.length }} 个站点</span></div>
              <p v-if="contentError" class="login-error" role="alert">{{ contentError }}</p>
              <p v-else-if="!friendLinks.length" class="eyebrow">暂无友链，来做第一个交换链接的人</p>
              <div v-else class="link-grid">
                <a v-for="link in friendLinks" :key="link.id" class="link-card" :href="link.url" target="_blank" rel="noopener noreferrer">
                  <span class="link-avatar" aria-hidden="true">
                    <img v-if="link.avatar" :src="link.avatar" :alt="link.name" loading="lazy" referrerpolicy="no-referrer" @error="($event.target as HTMLImageElement).remove()" />
                    <b v-if="!link.avatar">{{ linkBadge(link) }}</b>
                  </span>
                  <span class="link-info">
                    <strong>{{ link.name }}</strong>
                    <small>{{ link.description || link.url }}</small>
                  </span>
                  <span class="link-go" aria-hidden="true">↗</span>
                </a>
              </div>

              <div class="link-mine">
                <div class="link-mine-head"><p class="eyebrow">我的提交 / MY LINKS</p><span>提交后需审核上架；修改会重新进入待审核</span></div>
                <form class="link-form" @submit.prevent="submitLink">
                  <label>站点名称<input v-model="linkForm.name" required maxlength="64" placeholder="比如：阿冰的小站" /></label>
                  <label>站点地址<input v-model="linkForm.url" required maxlength="500" type="url" placeholder="https://example.com" /></label>
                  <label>头像地址（可选）<input v-model="linkForm.avatar" maxlength="500" type="url" placeholder="https://.../avatar.png" /></label>
                  <label class="full">一句话简介（可选）<input v-model="linkForm.description" maxlength="255" placeholder="这个博客写点什么" /></label>
                  <div class="link-form-actions">
                    <button class="link-submit" type="submit" :disabled="linkSaving">{{ linkSaving ? '提交中…' : (editingLinkId === null ? '提交友链' : '保存修改') }}</button>
                    <button v-if="editingLinkId !== null" class="link-cancel" type="button" @click="resetLinkForm">取消编辑</button>
                  </div>
                </form>
                <p v-if="linksError && linksError !== contentError" class="login-error" role="alert">{{ linksError }}</p>
                <p v-else-if="!myLinks.length" class="eyebrow">还没有提交过友链</p>
                <div v-else class="link-mine-list">
                  <div v-for="link in myLinks" :key="link.id" class="link-mine-row">
                    <div class="link-mine-main">
                      <strong>{{ link.name }}</strong>
                      <small>{{ link.url }}</small>
                    </div>
                    <span :class="['friend-status', `friend-status-${link.status}`]">{{ friendStatusText(link) }}</span>
                    <div class="link-mine-actions">
                      <button type="button" :disabled="linkSaving" @click="editMyLink(link)">编辑</button>
                      <button type="button" class="danger" :disabled="linkSaving" @click="confirmDeleteLinkId = link.id">删除</button>
                    </div>
                    <div v-if="confirmDeleteLinkId === link.id" class="confirm-bar" role="alert">
                      <span>确定删除友链 <b>「{{ link.name }}」</b>？</span>
                      <button type="button" :disabled="linkSaving" @click="deleteMyLink">确认删除</button>
                      <button class="keep" type="button" @click="confirmDeleteLinkId = null">取消</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>


            <section v-else class="settings-view"><div class="view-title"><p class="eyebrow">系统 / 显示</p><h2>设置</h2></div><div class="setting-row theme-row"><span>配色</span><div class="theme-options" role="group" aria-label="配色"><button v-for="item in THEMES" :key="item.id" type="button" :class="['theme-option', 'theme-option-' + item.id, { active: theme === item.id }]" :aria-pressed="theme === item.id" @click="chooseTheme(item.id)"><i></i><em>{{ item.label }}</em></button></div></div><label class="setting-row"><span>动画</span><input v-model="motion" type="checkbox" /><i></i></label><button class="reset-intro" type="button" @click="openAdminLogin">进入后台 ↗</button></section>
        </div>

        <SideRail :current="current" :name="siteConfig.name" :motion="motion" />
      </div>

        <div v-if="lightbox" class="lightbox" role="dialog" aria-modal="true" aria-label="查看大图" @click.self="closeLightbox">
          <button class="lightbox-close" type="button" aria-label="关闭" @click="closeLightbox">×</button>
          <div class="lightbox-body">
            <video v-if="lightbox.isVideo" :src="lightbox.src" controls autoplay></video>
            <img v-else :src="lightbox.src" alt="" />
            <p v-if="lightbox.caption" class="lightbox-caption">{{ lightbox.caption }}</p>
          </div>
        </div>
    </section>
  </main>
</template>
