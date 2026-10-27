<script setup lang="ts">
/**
 * 右侧栏
 * ------------------------------------------------------------
 * 首页：立方体（可鼠标控制）+ 页内目录（滚动高亮）+ 备案号
 * 其他页：只留备案号，压在视口底部 —— 布局列宽不变，切页面不跳。
 * 窄屏（≤1180）整列折到正文下方，只保留备案号。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SiteBeian from './SiteBeian.vue'
import RailCube from './RailCube.vue'
import VisitCounter from './VisitCounter.vue'

const props = withDefaults(defineProps<{ current?: string; name?: string; motion?: boolean }>(), {
  current: 'home',
  name: 'Nomad',
  motion: true,
})

const anchors = [
  { id: 'sec-projects', num: '01', label: '项目' },
  { id: 'sec-posts', num: '02', label: '文章' },
  { id: 'sec-about', num: '03', label: '关于' },
]

const isHome = computed(() => props.current === 'home')
const active = ref('')

// 目录高亮：取「已经滚过顶栏」的最后一个分区。
// 用 rAF 节流，一帧最多算一次，滚动时也只有三次 getBoundingClientRect。
let ticking = false

function measure() {
  ticking = false
  if (!isHome.value) return
  let hit = ''
  for (const item of anchors) {
    const el = document.getElementById(item.id)
    if (el && el.getBoundingClientRect().top <= 160) hit = item.id
  }
  // 最后一节往往撑不满一屏，"滚到顶部"这条判据永远命中不了它；
  // 触底时直接点亮最后一项，目录才不会悬在上一节。
  const atBottom = window.scrollY > 200 &&
    window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8
  if (atBottom) hit = anchors[anchors.length - 1].id
  active.value = hit
}

function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(measure)
}

function goTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced || !props.motion ? 'auto' : 'smooth', block: 'start' })
}

function toTop() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduced || !props.motion ? 'auto' : 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  measure()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
})

watch(
  () => props.current,
  () => nextTick(measure),
)
</script>

<template>
  <aside class="side-rail" aria-label="侧栏">
    <RailCube v-if="isHome" :motion="motion" />

    <nav v-if="isHome" class="rail-menu" aria-label="页内目录">
      <p class="rail-label">INDEX</p>
      <button
        v-for="item in anchors"
        :key="item.id"
        type="button"
        class="rail-link"
        :class="{ on: active === item.id }"
        @click="goTo(item.id)"
      >
        <em>{{ item.num }}</em>
        <span>{{ item.label }}</span>
      </button>
      <button class="rail-top" type="button" @click="toTop">↑ TOP</button>
    </nav>

    <!-- 访问计数盒：紧跟页内目录下方；非首页没有目录，就落在右栏顶部 -->
    <VisitCounter />

    <div class="rail-foot">
      <span class="rail-copy">© 2026 {{ name }}</span>
      <span class="beian"><SiteBeian /></span>
    </div>
  </aside>
</template>

<style scoped>
.side-rail {
  position: sticky;
  top: 88px;
  display: flex;
  flex-direction: column;
  gap: 26px;
  /* 撑到视口底部：内容再短，备案号也不会飘在页面半空 */
  min-height: calc(100vh - 112px);
  padding: 4px 0 20px;
}

/* ---------- 页内目录 ---------- */
.rail-label {
  margin: 0 0 10px;
  color: var(--muted-3);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .18em;
}

.rail-menu {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-top: 1px solid var(--line);
}

.rail-menu .rail-label { padding-top: 14px; }

.rail-link {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: color .18s;
}

.rail-link em {
  color: var(--muted-3);
  font-family: var(--font-mono);
  font-size: 10px;
  font-style: normal;
  transition: color .18s;
}

/* 高亮靠左侧的一条竖线，不加背景色，保持"目录"的克制感 */
.rail-link span {
  position: relative;
  padding-left: 10px;
}

.rail-link span::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 1px;
  height: 0;
  background: var(--accent);
  content: "";
  transform: translateY(-50%);
  transition: height .2s;
}

.rail-link:hover { color: var(--text); }
.rail-link.on { color: var(--text); }
.rail-link.on em { color: var(--accent); }
.rail-link.on span::before { height: 14px; }

.rail-top {
  align-self: flex-start;
  margin-top: 14px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted-3);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: .16em;
  cursor: pointer;
}

.rail-top:hover { color: var(--accent); }

/* ---------- 备案 / 版权（上下排列） ---------- */
.rail-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  color: var(--muted-2);
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.5;
}

.rail-copy { color: var(--muted-3); }

.beian {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.beian :deep(.beian-link) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted-2);
  text-decoration: none;
  transition: color .18s;
}

.beian :deep(.beian-link:hover) { color: var(--accent); }

.beian :deep(.beian-shield) { width: 11px; height: 11px; }

/* ---------- 窄屏：折到正文下方，仍保留立方体与备案 ---------- */
@media (max-width: 1080px) {
  .side-rail {
    position: static;
    min-height: 0;
    /* layout 是纵向 flex，这一条把整列推到页面底部 */
    margin-top: auto;
    padding-top: 22px;
    border-top: 1px solid var(--line);
  }

  .rail-menu { display: none; }

  .side-rail :deep(.cube-stage) {
    --size: 74px;
    height: 100px;
  }

  .rail-foot {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 18px;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .beian { flex-direction: row; flex-wrap: wrap; gap: 14px; }
}

/* 手机：立方体是装饰，让位给内容 */
@media (max-width: 720px) {
  .side-rail :deep(.cube-stage) { display: none; }
  .side-rail { gap: 0; }
}

@media print {
  .side-rail { display: none; }
}
</style>
