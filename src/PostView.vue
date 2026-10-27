<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { contentService } from './services/content'
import { renderMermaid, renderPostContent } from './utils/markdown'
import { friendlyError } from './utils/error'
import type { PostDetail, PostSummary } from './types/content'

const props = defineProps<{ slug: string; posts: PostSummary[] }>()
const emit = defineEmits<{ close: []; open: [slug: string] }>()

const post = ref<PostDetail | null>(null)
const loading = ref(false)
const error = ref('')
const contentEl = ref<HTMLElement | null>(null)

const toc = ref<{ id: string; text: string; level: number }[]>([])
const activeId = ref('')

// 列表里匹配到的同 slug 摘要，给阅读页头部补日期/标签（详情接口本身不含这两项）
const summary = computed(() => props.posts.find((p) => p.slug === props.slug))

// 预计阅读时长：中文按 ~350 字/分钟，去掉代码块粗略估算
const readingTime = computed(() => {
  const text = post.value?.content ?? ''
  const chars = text.replace(/\s+/g, '').replace(/```[\s\S]*?```/g, '').length
  return Math.max(1, Math.ceil(chars / 350))
})

// 上一篇 / 下一篇：按日期倒序，prev = 列表中更靠上（更新）的一篇
const sorted = computed(() =>
  [...props.posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
)
const index = computed(() => sorted.value.findIndex((p) => p.slug === props.slug))
const prev = computed(() => (index.value > 0 ? sorted.value[index.value - 1] : null))
const next = computed(() =>
  index.value >= 0 && index.value < sorted.value.length - 1 ? sorted.value[index.value + 1] : null,
)

function updateActive() {
  const root = contentEl.value
  if (!root) return
  const heads = Array.from(root.querySelectorAll<HTMLElement>('h2, h3'))
  if (!heads.length) {
    activeId.value = ''
    return
  }
  const y = window.scrollY + 120
  let cur = heads[0].id
  for (const h of heads) {
    if (h.offsetTop <= y) cur = h.id
    else break
  }
  activeId.value = cur
}

// 顶部细进度线复用站点现有的 --scroll-progress（header-progress 已读取该变量）
function onScroll() {
  updateActive()
  const doc = document.documentElement
  const max = doc.scrollHeight - doc.clientHeight
  doc.style.setProperty('--scroll-progress', (max > 0 ? Math.min(1, doc.scrollTop / max) : 0).toFixed(4))
}

// 正文渲染完后从 DOM 抓 h2/h3：赋锚点 id、建目录、算初始高亮
function buildToc() {
  const root = contentEl.value
  if (!root) return
  const heads = Array.from(root.querySelectorAll<HTMLElement>('h2, h3'))
  toc.value = heads.map((h, i) => {
    const id = `sec-${i}`
    h.id = id
    return { id, text: (h.textContent ?? '').trim(), level: h.tagName === 'H2' ? 2 : 3 }
  })
  updateActive()
}

function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 80
  window.scrollTo({ top, behavior: 'smooth' })
}

async function load(slug: string) {
  loading.value = true
  error.value = ''
  try {
    post.value = await contentService.getPost(slug)
    await nextTick()
    buildToc()
    await nextTick()
    // scope 到文章根，避免影响其它区域的图；主题切换由 App 的全局 renderMermaid 兜底重绘
    renderMermaid(contentEl.value ?? undefined)
  } catch (e) {
    post.value = null
    error.value = friendlyError(e, '正文加载失败')
  } finally {
    loading.value = false
  }
}

// slug 变化（上一篇/下一篇）时重拉并重渲染，组件实例复用
watch(() => props.slug, (s) => load(s))

onMounted(() => {
  document.documentElement.style.setProperty('--scroll-progress', '0')
  load(props.slug)
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  document.documentElement.style.setProperty('--scroll-progress', '0')
})
</script>

<template>
  <article class="post-view">
    <div class="post-head">
      <button class="post-back" type="button" @click="emit('close')">← 全部文章</button>

      <p v-if="loading" class="post-loading">加载正文…</p>
      <p v-else-if="error" class="login-error" role="alert">{{ error }}</p>

      <template v-else-if="post">
        <h1 class="post-title">{{ post.title }}</h1>
        <p v-if="post.summary" class="post-lead">{{ post.summary }}</p>
        <div class="post-meta">
          <span v-if="summary?.date">{{ summary.date }}</span>
          <span v-if="summary?.date" class="dot">·</span>
          <span v-if="summary?.tag">{{ summary.tag }}</span>
          <span v-if="summary?.tag" class="dot">·</span>
          <span>约 {{ readingTime }} 分钟阅读</span>
        </div>
        <img v-if="post.cover" class="post-cover" :src="post.cover" :alt="post.title" />
      </template>
    </div>

    <div v-if="post && !loading" class="post-body">
      <div ref="contentEl" class="post-article">
        <div class="post-content" v-html="renderPostContent(post.content)"></div>
      </div>

      <aside v-if="toc.length" class="post-toc">
        <p class="post-toc-title">目录</p>
        <ul>
          <li
            v-for="item in toc"
            :key="item.id"
            :class="['toc-' + item.level, { active: activeId === item.id }]"
          >
            <a :href="'#' + item.id" @click.prevent="scrollToHeading(item.id)">{{ item.text }}</a>
          </li>
        </ul>
      </aside>
    </div>

    <nav v-if="post && !loading" class="post-nav">
      <button v-if="prev" class="post-nav-item" type="button" @click="emit('open', prev.slug)">
        <span class="post-nav-dir">← 上一篇</span>
        <span class="post-nav-title">{{ prev.title }}</span>
      </button>
      <span v-else class="post-nav-item post-nav-empty"></span>

      <button v-if="next" class="post-nav-item post-nav-next" type="button" @click="emit('open', next.slug)">
        <span class="post-nav-dir">下一篇 →</span>
        <span class="post-nav-title">{{ next.title }}</span>
      </button>
      <span v-else class="post-nav-item post-nav-empty post-nav-next"></span>
    </nav>
  </article>
</template>
