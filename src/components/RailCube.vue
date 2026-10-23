<script setup lang="ts">
/**
 * 侧栏立方体（纯 CSS 3D + 一段 rAF）
 * ------------------------------------------------------------
 * 交互：
 *   - 指针进入组件范围 → 立方体转向指针（Y ±35° / X ±28°），缓动跟随
 *   - 指针离开 → 缓慢自转 + 轻微摆动，避免"死物"感
 *   - 里面没有可点元素：只收 pointermove，不复用街机踩过的"转起来按钮点不中"结构
 *
 * 降级：
 *   - props.motion=false（设置里关动画）→ 停 rAF，回固定角度
 *   - prefers-reduced-motion → CSS 里 !important 钉死角度
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ motion?: boolean }>(), { motion: true })

const stage = ref<HTMLElement | null>(null)
const cube = ref<HTMLElement | null>(null)

// 静止时的基础角度：不是正对镜头，一眼能看出这是个体
const BASE_X = -15
const BASE_Y = -28

let raf = 0
let hovering = false
let curX = BASE_X
let curY = BASE_Y
let aimX = BASE_X
let aimY = BASE_Y

function write(x: number, y: number) {
  if (cube.value) cube.value.style.transform = `rotateX(${x.toFixed(2)}deg) rotateY(${y.toFixed(2)}deg)`
}

function frame(now: number) {
  if (!hovering) {
    // 闲置漂移：约 16s 一个来回，幅度小，放在文章列表旁边不抢注意力
    aimY = BASE_Y + Math.sin(now / 2600) * 13
    aimX = BASE_X + Math.cos(now / 3400) * 7
  }
  const k = hovering ? 0.16 : 0.06
  curX += (aimX - curX) * k
  curY += (aimY - curY) * k
  write(curX, curY)
  raf = requestAnimationFrame(frame)
}

function start() {
  if (raf || !props.motion) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  raf = requestAnimationFrame(frame)
}

function stop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  curX = aimX = BASE_X
  curY = aimY = BASE_Y
  write(BASE_X, BASE_Y)
}

function onMove(event: PointerEvent) {
  const el = stage.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const nx = (event.clientX - rect.left) / rect.width - 0.5
  const ny = (event.clientY - rect.top) / rect.height - 0.5
  aimY = BASE_Y + nx * 70
  aimX = BASE_X - ny * 56
}

function onEnter() {
  hovering = true
}

function onLeave() {
  hovering = false
}

onMounted(start)
onBeforeUnmount(stop)
watch(() => props.motion, (on) => (on ? start() : stop()))
</script>

<template>
  <div
    ref="stage"
    class="cube-stage"
    aria-hidden="true"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
    @pointermove="onMove"
  >
    <div class="cube" ref="cube">
      <div class="cube-face f-front"><b>A<i>/</i></b></div>
      <div class="cube-face f-back"><span>3D</span></div>
      <div class="cube-face f-right"><span>GO</span></div>
      <div class="cube-face f-left"><span>VUE</span></div>
      <div class="cube-face f-top"><span>2026</span></div>
      <div class="cube-face f-bottom"><span>//</span></div>
    </div>
    <span class="cube-floor"></span>
  </div>
</template>

<style scoped>
.cube-stage {
  --size: 88px;
  --half: calc(var(--size) / 2);
  position: relative;
  display: grid;
  place-items: center;
  height: calc(var(--size) + 34px);
  perspective: 760px;
  perspective-origin: 50% 45%;
  cursor: grab;
  touch-action: pan-y;
}

.cube {
  position: relative;
  width: var(--size);
  height: var(--size);
  transform: rotateX(-15deg) rotateY(-28deg);
  transform-style: preserve-3d;
  will-change: transform;
}

.cube-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 3px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--surface) 92%, transparent), color-mix(in srgb, var(--surface-3) 88%, transparent));
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .14em;
  backface-visibility: hidden;
}

/* 正面放名字缩写，用强调色，其余面用灰字 —— 只有一面抢眼 */
.f-front {
  border-color: var(--accent);
  transform: translateZ(var(--half));
}

.f-front b {
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -.04em;
}

.f-front i {
  color: var(--accent);
  font-style: normal;
}

.f-back { transform: rotateY(180deg) translateZ(var(--half)); opacity: .55; }
.f-right { transform: rotateY(90deg) translateZ(var(--half)); }
.f-left { transform: rotateY(-90deg) translateZ(var(--half)); opacity: .8; }
.f-top {
  transform: rotateX(90deg) translateZ(var(--half));
  background: linear-gradient(145deg, var(--accent-wash), color-mix(in srgb, var(--surface) 90%, transparent));
  color: var(--accent);
  opacity: .9;
}
.f-bottom { transform: rotateX(-90deg) translateZ(var(--half)); opacity: .4; }

/* 落地投影：没有它立方体像浮在半空 */
.cube-floor {
  position: absolute;
  bottom: 4px;
  width: 74px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-tint-strong);
  opacity: .35;
  filter: blur(9px);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .cube { transform: rotateX(-15deg) rotateY(-28deg) !important; }
}
</style>
