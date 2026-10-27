<script setup lang="ts">
/**
 * 侧栏访问计数
 * ------------------------------------------------------------
 * 数据源：GET /api/v1/visits/stats（访问日志聚合出的 UV，只读）
 * 口径：只展示「访客数」（按 visitor_key 去重），不展示 PV（访问次数）。
 *   同一个访客刷十次页面，访客数只 +1，这个数字才反映「有多少人看过」。
 * 设计原则：
 *   1. 它是信息不是装饰 —— 不做数字滚动、渐变、发光，纯静态排版；
 *   2. 只认后端真实数据：不读本地假数据、不写死兜底数字，拿不到就整块不渲染；
 *   3. 切回标签页才刷新，不做定时轮询，避免后台标签页空耗请求。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { fetchVisitStats, type VisitStats } from '../services/visits'

const stats = ref<VisitStats | null>(null)

const fmt = (n: number) => n.toLocaleString('zh-CN')

async function load() {
  // 只认后端真实数据：不读本地假数据、不写死兜底数字。
  // 拿不到就整块不渲染，宁可不显示，也不给读者一个编出来的访问量。
  try {
    stats.value = await fetchVisitStats()
  } catch (err) {
    // 生产环境静默：统计挂了不该影响阅读。
    // 开发环境留一条 warn：否则「盒子没出现」这种问题只能靠猜。
    if (import.meta.env.DEV) {
      console.warn('[VisitCounter] 读取 /visits/stats 失败，访问数盒子不渲染：', err)
    }
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') load()
}

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <section v-if="stats" class="visit-box" aria-label="站点访问统计">
    <p class="visit-label">TRAFFIC</p>
    <div class="visit-grid">
      <p class="visit-cell" title="累计独立访客数（UV）">
        <b>{{ fmt(stats.distinct_users) }}</b><span>总访客</span>
      </p>
      <p class="visit-cell" title="今日独立访客数">
        <b>{{ fmt(stats.today_distinct) }}</b><span>今日访客</span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.visit-box {
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.visit-label {
  margin: 0 0 10px;
  color: var(--muted-3);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .18em;
}

/* 2 列：数字在上、标签在下，比「标签…数字」两端对齐更紧凑，窄栏里不散 */
.visit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 8px;
}

.visit-cell {
  margin: 0;
}

/* 等宽 + 表格数字：位数变化时不左右抖动 */
.visit-cell b {
  display: block;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.02em;
  line-height: 1.15;
}

.visit-cell span {
  display: block;
  margin-top: 3px;
  color: var(--muted-3);
  font-size: 10px;
  letter-spacing: .04em;
}

/* 窄屏时侧栏折到正文下方、备案行紧跟其后，盒子需要自带下边距和分隔线，
   否则和版权行的间距会被压没 */
@media (max-width: 1080px) {
  .visit-box {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
  }

  .visit-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-width: 260px;
  }
}
</style>

