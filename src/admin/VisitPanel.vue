<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { adminApi, AdminApiError, isAuthError } from '../services/admin'
import type { Paginated, VisitLog, VisitSummaryData, VisitorSummary } from '../types/admin'

const emit = defineEmits<{ authExpired: [] }>()

// —— 汇总区 ——
const summary = ref<VisitSummaryData | null>(null)
const summaryError = ref('')
const summaryLoading = ref(true)

// —— 明细区 ——
const logs = ref<VisitLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const keyword = ref('')
const searchInput = ref('')
const loading = ref(true)
const error = ref('')

async function loadSummary(silent = false) {
  if (!silent) summaryError.value = ''
  try {
    summary.value = await adminApi.visitSummary()
    summaryError.value = ''
  } catch (e) {
    if (isAuthError(e)) return emit('authExpired')
    if (!silent) summaryError.value = e instanceof AdminApiError ? e.message : '统计加载失败'
  } finally {
    summaryLoading.value = false
  }
}

async function loadLogs(silent = false) {
  if (!silent) {
    error.value = ''
    loading.value = true
  }
  try {
    const data: Paginated<VisitLog> = await adminApi.listVisits(page.value, pageSize, keyword.value)
    logs.value = data.list ?? []
    total.value = data.total ?? 0
    error.value = ''
  } catch (e) {
    if (isAuthError(e)) return emit('authExpired')
    if (!silent) error.value = e instanceof AdminApiError ? e.message : '明细加载失败'
  } finally {
    loading.value = false
  }
}

// 静默刷新：不重置 loading，避免轮询时整块变成"加载中"造成空白闪烁
function refresh() {
  loadSummary(true)
  loadLogs(true)
}

function onVisible() {
  if (document.visibilityState === 'visible') refresh()
}

function search() {
  keyword.value = searchInput.value.trim()
  page.value = 1
  loadLogs()
}

function turnPage(direction: 1 | -1) {
  const next = page.value + direction
  if (next < 1 || (total.value && next > Math.ceil(total.value / pageSize))) return
  page.value = next
  loadLogs()
}

// 没填昵称的访客显示 key 的前 8 位，一眼可读且不泄露完整标识
function visitorLabel(visitor: Pick<VisitLog, 'nickname' | 'visitor_key'>): string {
  return visitor.nickname?.trim() || `#${visitor.visitor_key.slice(0, 8)}`
}

function deviceText(entry: Pick<VisitLog, 'device' | 'user_agent'>): string {
  return entry.device || entry.user_agent?.slice(0, 48) || '未知设备'
}

function formatTime(iso: string): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16)
}

// 规整 IPv6 回环/映射地址，避免把 ::1 / ::ffff:1.2.3.4 这类地址当"乱码"展示
function formatIp(ip: string): string {
  if (!ip) return '—'
  if (ip === '::1') return '127.0.0.1'
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

// 访客数据每 30s 静默刷新一次；切回标签页时立即刷新。
const REFRESH_INTERVAL = 30000
let refreshTimer: number | null = null

onMounted(() => {
  loadSummary()
  loadLogs()
  refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL)
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <section class="admin-panel visit-panel">
    <div class="view-title"><p class="eyebrow">后台 / 访客</p><h2>访客</h2><span v-if="summary">累计 {{ summary.stats.total }} 次访问</span></div>
    <div class="visit-toolbar"><button class="visit-refresh" type="button" @click="refresh">刷新数据</button><span>每 30 秒自动刷新</span></div>

    <!-- 统计卡片：终端读数风，数字用等宽字体 -->
    <p v-if="summaryError" class="admin-error" role="alert">{{ summaryError }}</p>
    <p v-else-if="summaryLoading" class="admin-empty">统计加载中…</p>
    <div v-else-if="summary" class="visit-cards">
      <div class="visit-card">
        <span class="visit-card-label">TOTAL VISITS</span>
        <b class="visit-card-value">{{ summary.stats.total }}</b>
        <small>累计访问</small>
      </div>
      <div class="visit-card">
        <span class="visit-card-label">TODAY VISITS</span>
        <b class="visit-card-value">{{ summary.stats.today }}</b>
        <small>今日访问</small>
      </div>
      <div class="visit-card">
        <span class="visit-card-label">UNIQUE GUESTS</span>
        <b class="visit-card-value">{{ summary.stats.distinct_users }}</b>
        <small>独立访客</small>
      </div>
      <div class="visit-card visit-card-live">
        <span class="visit-card-label"><i class="live-dot"></i> TODAY GUESTS</span>
        <b class="visit-card-value">{{ summary.stats.today_distinct }}</b>
        <small>今日独立访客</small>
      </div>
    </div>

    <div class="visit-columns">
      <!-- 最近访客：按 visitor_key 聚合 -->
      <div class="visit-block">
        <div class="visit-block-head"><span>最近访客</span><small>TOP {{ summary?.visitors.length ?? 0 }}</small></div>
        <p v-if="!summary?.visitors.length" class="admin-empty">暂无访客记录</p>
        <table v-else class="visit-table">
          <thead><tr><th>访客</th><th>设备 / 系统</th><th>IP</th><th>次数</th><th>最近</th></tr></thead>
          <tbody>
            <tr v-for="visitor in summary.visitors" :key="visitor.visitor_key">
              <td class="visit-nick">{{ visitorLabel(visitor) }}</td>
              <td class="visit-device">{{ deviceText(visitor) }}</td>
              <td class="visit-ip">{{ formatIp(visitor.ip) }}</td>
              <td class="visit-num">{{ visitor.visits }}</td>
              <td class="visit-time">{{ formatTime(visitor.last_seen_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 热门接口 -->
      <div class="visit-block">
        <div class="visit-block-head"><span>热门接口</span><small>TOP {{ summary?.top_paths.length ?? 0 }}</small></div>
        <p v-if="!summary?.top_paths.length" class="admin-empty">暂无数据</p>
        <ul v-else class="visit-top-list">
          <li v-for="item in summary.top_paths" :key="item.path">
            <span class="visit-top-path">{{ item.path }}</span>
            <span class="visit-top-bar"><i :style="{ width: `${Math.max(8, (item.visits / (summary?.top_paths[0]?.visits || 1)) * 100)}%` }"></i></span>
            <b>{{ item.visits }}</b>
          </li>
        </ul>
      </div>
    </div>

    <!-- 访问明细 -->
    <div class="admin-panel-head">
      <span>访问明细</span>
      <form class="visit-search" role="search" @submit.prevent="search">
        <input v-model="searchInput" placeholder="搜索昵称 / 路径" aria-label="搜索访问明细" />
        <button type="submit">查询</button>
      </form>
    </div>

    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="admin-empty">加载中…</p>
    <p v-else-if="!logs.length" class="admin-empty">暂无访问记录</p>
    <table v-else class="visit-table visit-detail">
      <thead><tr><th>时间</th><th>访客</th><th>设备 / 系统</th><th>IP</th><th>路径</th></tr></thead>
      <tbody>
        <tr v-for="log in logs" :key="log.id">
          <td class="visit-time">{{ formatTime(log.created_at) }}</td>
          <td class="visit-nick">{{ visitorLabel(log) }}</td>
          <td class="visit-device" :title="log.user_agent">{{ deviceText(log) }}</td>
          <td class="visit-ip">{{ formatIp(log.ip) }}</td>
          <td class="visit-path">{{ log.kind === 'page' ? `页面 · ${log.path}` : log.path }}</td>
        </tr>
      </tbody>
    </table>

    <div class="page-controls">
      <button type="button" :disabled="page <= 1" @click="turnPage(-1)">上一页</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button type="button" :disabled="page >= totalPages" @click="turnPage(1)">下一页</button>
    </div>
  </section>
</template>
