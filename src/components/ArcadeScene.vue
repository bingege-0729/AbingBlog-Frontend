<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 首页 3D 街机（three.js / WebGL）
 * ------------------------------------------------------------
 * 机柜摆在一间暗房里：地面、背墙、墙上霓虹字、顶光、屏幕冷光。
 *
 * 交互全部在 3D 里发生，界面上不出现任何提示文字：
 *   · 拖拽空白处 → 绕机柜 360° 转视角（阻尼，垂直方向限位）
 *   · 点投币口 → CREDIT +1（上限 5）
 *   · 投币后点屏幕 / START → 镜头推进屏幕特写，打砖块；指针横向控挡板（或 ←/→）
 *   · 游戏中点屏幕以外 / Esc → 退出，镜头拉回 3/4 机位
 *   · A / B → 换屏幕配色
 *   · 点顶部灯箱 → 进后台登录
 *   · 站点换主题 → 场景按新配色重建
 *
 * 性能：three 动态 import + 滚进视口才加载；不打游戏、不转视角时完全不渲染。
 */

const props = withDefaults(defineProps<{ name?: string }>(), { name: 'NOMAD' })

const emit = defineEmits<{ start: []; admin: [] }>()

const stageEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
const failed = ref(false)

/* eslint-disable @typescript-eslint/no-explicit-any */
let T: any = null
let renderer: any = null
let scene: any = null
let camera: any = null
let raycaster: any = null
let screenTex: any = null
let screenCtx: CanvasRenderingContext2D | null = null
let screenCanvas: HTMLCanvasElement | null = null
let signRoot: any = null
let stickPivot: any = null
let stickShaft: any = null
let stickBall: any = null
const targets: Record<string, any> = {}
/* eslint-enable @typescript-eslint/no-explicit-any */

const pointer = { x: 0, y: 0 }
let raf = 0
let alive = true
let started = false
let resizeObserver: ResizeObserver | null = null
let io: IntersectionObserver | null = null
let visibilityBound = false
let themeObserver: MutationObserver | null = null

// —— 机台状态（不参与模板渲染，所以用普通变量）——
let credit = 1
let level: 'mono' | 'amber' | 'blue' = 'mono'
let mode: 'idle' | 'play' | 'over' = 'idle'
let pressed = ''
let overTimer = 0
let flashUntil = 0
let lastTs = 0

// —— 视角：球坐标 + 阻尼，基准位是正面偏右 3/4 ——
const CAM_AZ = 0.385
const CAM_POL = 1.46
const CAM_DIST = 4.15

// 开局特写机位：正对屏幕、贴到刚好框住画面
const SCREEN_AZ = 0
const SCREEN_POL = Math.PI / 2
const SCREEN_DIST = 1.2

// dist/tdist 是「镜头远近」，look/lookT 是「镜头盯着哪个点」。
// 打到游戏时把注视点从机柜中心挪到屏幕中心，镜头同时拉近，
// 效果就是画面往屏幕里推——不用另做一套相机动画。
const cam = { az: CAM_AZ, pol: CAM_POL, dist: CAM_DIST, taz: CAM_AZ, tpol: CAM_POL, tdist: CAM_DIST }
const look = { x: 0, y: 1.05, z: 0 }
const lookT = { x: 0, y: 1.05, z: 0 }
let baseDist = CAM_DIST

// 屏幕贴图超采样倍数：放大成特写后 512×384 会糊，画布按 2 倍画
const SS = 2

// —— 拖拽 ——
let orbiting = false
let stickDrag = false
const dragFrom = { x: 0, y: 0, az: 0, pol: 0 }
let stickOffset = 0

// —— 小游戏：坐标都在屏幕贴图（512×384）里 ——
const W = 512
const H = 384
const paddle = { x: W / 2, w: 96, h: 10, y: H - 34 }
const ball = { x: W / 2, y: H - 60, vx: 2.4, vy: -2.9, r: 7 }
type Brick = { x: number; y: number; w: number; h: number; alive: boolean; accent: boolean }
let bricks: Brick[] = []
let score = 0
let lives = 3

function palette() {
  const cs = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => (cs.getPropertyValue(name) || fallback).trim()
  return {
    accent: read('--accent', '#4cd9c0'),
    accentSoft: read('--accent-soft', '#8fe3d3'),
    surface: read('--surface', '#12161a'),
    surface2: read('--surface-2', '#171b20'),
    surface3: read('--surface-3', '#1e242b'),
    text: read('--text', '#e8eef3'),
    bg: read('--bg', '#0c0f12'),
  }
}

function screenInk() {
  if (level === 'amber') return '#ffb454'
  if (level === 'blue') return '#6aa9ff'
  return palette().accent
}

/** 发光字：透明底，按 canvas 宽度自适应字号，小平面上也读得出 */
function glowText(text: string, accent: string, w = 512, h = 160, fontSize = 62, blur = 10) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const label = text.toUpperCase()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${fontSize}px "Space Grotesk", "Courier New", monospace`
  const width = ctx.measureText(label).width
  const fitted = Math.max(10, Math.floor(fontSize * Math.min(1, (w * 0.86) / Math.max(1, width))))
  ctx.font = `700 ${fitted}px "Space Grotesk", "Courier New", monospace`
  ctx.fillStyle = accent
  ctx.shadowColor = accent
  ctx.shadowBlur = blur * 1.8
  ctx.globalAlpha = 0.5
  ctx.fillText(label, w / 2, h / 2)
  ctx.globalAlpha = 1
  ctx.shadowBlur = blur * 0.6
  ctx.fillText(label, w / 2, h / 2)
  ctx.shadowBlur = 0
  ctx.fillText(label, w / 2, h / 2)
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

function sideArt(accent: string, text: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 512
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#0a0f12'
  ctx.fillRect(0, 0, 256, 512)
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.9
  ctx.fillRect(28, 28, 10, 200)
  ctx.globalAlpha = 1
  ctx.save()
  ctx.translate(128, 300)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = accent
  ctx.font = '700 54px "Space Grotesk", "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.fillText(text.toUpperCase().slice(0, 7), 0, 0)
  ctx.fillStyle = 'rgba(255,255,255,.5)'
  ctx.font = '600 20px "Courier New", monospace'
  ctx.fillText('MODEL A-01 · EST 2026', 0, 44)
  ctx.restore()
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

// ---------------------------------------------------------------- 小游戏

function resetBricks() {
  bricks = []
  const cols = 7
  const rows = 4
  const pad = 14
  const bw = (W - pad * (cols + 1)) / cols
  const bh = 18
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      bricks.push({
        x: pad + c * (bw + pad),
        y: 70 + r * (bh + 10),
        w: bw,
        h: bh,
        alive: true,
        accent: (r + c) % 3 === 0,
      })
    }
  }
}

function resetBall() {
  ball.x = W / 2
  ball.y = paddle.y - 30
  ball.vx = (Math.random() > 0.5 ? 1 : -1) * 2.4
  ball.vy = -2.9
}

function startGame() {
  if (credit <= 0) {
    // 没币：屏幕闪一下，不进入游戏
    flashUntil = performance.now() + 900
    drawScreen()
    startLoop()
    return
  }
  credit -= 1
  mode = 'play'
  score = 0
  lives = 3
  paddle.x = W / 2
  stickOffset = 0
  applyStick()
  resetBricks()
  resetBall()
  lastTs = 0
  drawScreen()
  focusScreen()
  emit('start')
}

// 退出游戏：回到待机画面 + 镜头拉回机位。点屏幕以外、按 Esc 都走这里。
function exitGame() {
  if (mode === 'idle') return
  mode = 'idle'
  lastTs = 0
  stickOffset = 0
  applyStick()
  drawScreen()
  returnToOrbit()
}

function stepGame(dt: number) {
  const k = Math.min(2.2, dt / 16.67)

  // 摇杆 → 挡板（带一点跟随阻尼，手感比硬跟好）
  const target = W / 2 + stickOffset * (W / 2 - paddle.w / 2 - 8)
  paddle.x += (target - paddle.x) * Math.min(1, 0.35 * k)

  ball.x += ball.vx * k
  ball.y += ball.vy * k

  if (ball.x < ball.r) {
    ball.x = ball.r
    ball.vx = Math.abs(ball.vx)
  }
  if (ball.x > W - ball.r) {
    ball.x = W - ball.r
    ball.vx = -Math.abs(ball.vx)
  }
  if (ball.y < 58 + ball.r) {
    ball.y = 58 + ball.r
    ball.vy = Math.abs(ball.vy)
  }

  // 挡板反弹：按命中位置给角度，手感才不呆
  if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h) {
    if (ball.x > paddle.x - paddle.w / 2 - ball.r && ball.x < paddle.x + paddle.w / 2 + ball.r) {
      const hit = (ball.x - paddle.x) / (paddle.w / 2)
      const speed = Math.min(6.2, Math.hypot(ball.vx, ball.vy) + 0.12)
      const angle = hit * 1.05
      ball.vx = Math.sin(angle) * speed
      ball.vy = -Math.abs(Math.cos(angle) * speed)
      ball.y = paddle.y - ball.r
    }
  }

  for (const b of bricks) {
    if (!b.alive) continue
    if (ball.x + ball.r < b.x || ball.x - ball.r > b.x + b.w) continue
    if (ball.y + ball.r < b.y || ball.y - ball.r > b.y + b.h) continue
    b.alive = false
    score += b.accent ? 30 : 10
    const fromSide = Math.abs(ball.x - (b.x + b.w / 2)) > Math.abs(ball.y - (b.y + b.h / 2))
    if (fromSide) ball.vx = -ball.vx
    else ball.vy = -ball.vy
    break
  }

  if (bricks.every((b) => !b.alive)) {
    resetBricks()
    resetBall()
    score += 100
  }

  if (ball.y - ball.r > H) {
    lives -= 1
    if (lives <= 0) {
      mode = 'over'
      overTimer = performance.now() + 1900
    } else {
      resetBall()
    }
  }
}

// ---------------------------------------------------------------- 屏幕绘制

function drawScreen() {
  if (!screenCtx || !screenCanvas || !screenTex) return
  const ctx = screenCtx
  const ink = screenInk()

  // 画布是 2 倍分辨率，坐标系统一缩回逻辑尺寸，下面的坐标全部不用改
  ctx.setTransform(SS, 0, 0, SS, 0, 0)
  ctx.fillStyle = '#05090b'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = ink
  ctx.globalAlpha = 0.2
  ctx.lineWidth = 3
  ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.globalAlpha = 1

  ctx.font = '600 17px "Courier New", ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.85
  ctx.fillText('A/ARCADE', 24, 44)
  ctx.textAlign = 'right'
  ctx.fillText(mode === 'play' ? `SCORE ${score}` : `CREDIT ${String(credit).padStart(2, '0')}`, W - 24, 44)
  ctx.globalAlpha = 1

  if (mode === 'play' || mode === 'over') {
    for (const b of bricks) {
      if (!b.alive) continue
      ctx.fillStyle = b.accent ? ink : '#ffffff'
      ctx.globalAlpha = b.accent ? 0.95 : 0.26
      ctx.fillRect(b.x, b.y, b.w, b.h)
      ctx.globalAlpha = 1
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)
      ctx.globalAlpha = 1
    }

    ctx.fillStyle = ink
    ctx.fillRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h)
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2)
    ctx.fill()

    ctx.font = '600 14px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.6
    ctx.fillText(`BALL ${lives}`, W / 2, H - 14)
    ctx.globalAlpha = 1
  } else {
    ctx.textAlign = 'center'
    ctx.font = '700 38px "Courier New", ui-monospace, monospace'
    ctx.fillStyle = ink
    ctx.shadowColor = ink
    ctx.shadowBlur = 18
    const label = credit > 0 ? 'PRESS START' : 'INSERT COIN'
    // 有币时常亮；没币时闪烁
    const blink = credit > 0 || Math.floor(performance.now() / 620) % 2 === 0 || performance.now() < flashUntil
    if (blink) ctx.fillText(label, W / 2, H / 2)
    ctx.shadowBlur = 0

    ctx.font = '15px "Courier New", ui-monospace, monospace'
    ctx.globalAlpha = 0.55
    ctx.fillText(`${level.toUpperCase()} CRT · BACKEND / AI`, W / 2, H / 2 + 42)
    ctx.globalAlpha = 1
  }

  if (mode === 'over') {
    ctx.fillStyle = 'rgba(5,9,11,.72)'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.fillStyle = ink
    ctx.font = '700 40px "Courier New", monospace'
    ctx.fillText('GAME OVER', W / 2, H / 2 - 6)
    ctx.font = '600 20px "Courier New", monospace'
    ctx.globalAlpha = 0.8
    ctx.fillText(`SCORE ${score}`, W / 2, H / 2 + 34)
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = 'rgba(0,0,0,.3)'
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2)
  const gloss = ctx.createLinearGradient(0, 0, 0, H * 0.42)
  gloss.addColorStop(0, 'rgba(255,255,255,.1)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.fillRect(0, 0, W, H * 0.42)

  screenTex.needsUpdate = true
}

// ---------------------------------------------------------------- 场景

function buildScene() {
  const base = palette()
  const lift = (hex: string, amount: number) => new T.Color(hex).lerp(new T.Color(0xffffff), amount)
  const darken = (hex: string, amount: number) => new T.Color(hex).lerp(new T.Color(0x000000), amount)

  const group = new T.Group()
  scene.add(group)

  const bodyMat = new T.MeshStandardMaterial({ color: lift(base.surface, 0.09), roughness: 0.52, metalness: 0.35 })
  const panelMat = new T.MeshStandardMaterial({ color: lift(base.surface2, 0.14), roughness: 0.42, metalness: 0.4 })
  const edgeMat = new T.MeshStandardMaterial({ color: base.accent, roughness: 0.3, emissive: base.accent, emissiveIntensity: 0.85 })
  const metalMat = new T.MeshStandardMaterial({ color: darken(base.surface3, 0.2), roughness: 0.35, metalness: 0.75 })

  const box = (w: number, h: number, d: number, mat: unknown, x: number, y: number, z: number, parent: any = group) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    return m
  }

  // ---- 房间 ----
  const floorMat = new T.MeshStandardMaterial({ color: lift(base.surface, 0.02), roughness: 0.42, metalness: 0.22 })
  const floor = new T.Mesh(new T.PlaneGeometry(24, 24), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // 环形内壁代替一面背墙：视角要能绕 360°，转到背后不能露出发白的"墙到此为止"。
  // BackSide 只渲染内表面，相机始终在筒内，所以看着就是一间接不到边的暗房。
  const wallMat = new T.MeshStandardMaterial({
    color: lift(base.surface2, 0.2),
    roughness: 0.92,
    metalness: 0.02,
    side: T.BackSide,
  })
  const room = new T.Mesh(new T.CylinderGeometry(7.4, 7.4, 7, 56, 1, true), wallMat)
  room.position.set(0, 3.2, 0)
  room.receiveShadow = true
  scene.add(room)

  // 霓虹招牌：做成落地灯箱。原来是贴在背墙上的一张纸，转过去就是空白
  const signGroup = new T.Group()
  signRoot = signGroup
  signGroup.position.set(1.62, 0, -2.95)
  signGroup.rotation.y = -0.34
  scene.add(signGroup)
  box(1.92, 0.9, 0.1, panelMat, 0, 1.96, 0, signGroup)
  ;[-0.83, 0.83].forEach((dx) => {
    const leg = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.55, 10), metalMat)
    leg.position.set(dx, 0.78, 0)
    leg.castShadow = true
    signGroup.add(leg)
  })
  box(1.96, 0.05, 0.32, metalMat, 0, 0.026, 0, signGroup)

  const sign = glowText('arcade', base.accent, 512, 160, 70, 14)
  if (sign) {
    const m = new T.Mesh(new T.PlaneGeometry(1.74, 0.5), new T.MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }))
    m.position.set(0, 1.96, 0.056)
    signGroup.add(m)
  }

  // ---- 机柜 ----
  box(1.16, 0.1, 0.68, panelMat, 0, 0.05, 0)
  box(1.04, 0.72, 0.58, bodyMat, 0, 0.46, 0)
  const upper = box(1.04, 1.0, 0.54, bodyMat, 0, 1.42, -0.01)
  upper.rotation.x = -0.02

  box(0.028, 1.0, 0.03, edgeMat, -0.51, 1.42, 0.265)
  box(0.028, 1.0, 0.03, edgeMat, 0.51, 1.42, 0.265)
  box(0.028, 0.72, 0.03, edgeMat, -0.51, 0.46, 0.285)
  box(0.028, 0.72, 0.03, edgeMat, 0.51, 0.46, 0.285)

  const art = sideArt(base.accent, 'ARCADE')
  if (art) {
    const artMat = new T.MeshBasicMaterial({ map: art })
    const left = new T.Mesh(new T.PlaneGeometry(0.52, 1.0), artMat)
    left.position.set(-0.523, 1.42, 0)
    left.rotation.y = -Math.PI / 2
    group.add(left)
    const right = new T.Mesh(new T.PlaneGeometry(0.52, 1.0), artMat)
    right.position.set(0.523, 1.42, 0)
    right.rotation.y = Math.PI / 2
    group.add(right)
  }

  box(0.86, 0.66, 0.05, panelMat, 0, 1.52, 0.275)
  screenCanvas = document.createElement('canvas')
  // 超采样：镜头推到特写时，贴图分辨率就是清晰度的上限
  screenCanvas.width = W * SS
  screenCanvas.height = H * SS
  screenCtx = screenCanvas.getContext('2d')
  screenTex = new T.CanvasTexture(screenCanvas)
  screenTex.colorSpace = T.SRGBColorSpace
  screenTex.minFilter = T.LinearFilter
  screenTex.magFilter = T.LinearFilter
  screenTex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1
  const screenMesh = new T.Mesh(new T.PlaneGeometry(0.76, 0.57), new T.MeshBasicMaterial({ map: screenTex, toneMapped: false }))
  screenMesh.position.set(0, 1.52, 0.303)
  screenMesh.userData.action = 'screen'
  group.add(screenMesh)
  targets.screen = screenMesh

  // 顶部灯箱：点它进后台
  box(1.04, 0.2, 0.14, panelMat, 0, 2.06, 0.06)
  const topSign = glowText(props.name, base.accent, 512, 96, 44, 8)
  if (topSign) {
    const m = new T.Mesh(new T.PlaneGeometry(0.96, 0.18), new T.MeshBasicMaterial({ map: topSign, transparent: true, toneMapped: false }))
    m.position.set(0, 2.06, 0.132)
    m.userData.action = 'admin'
    group.add(m)
    targets.marquee = m
  }

  // ---- 控制台 ----
  const deck = new T.Group()
  deck.position.set(0, 0.8, 0.34)
  deck.rotation.x = -0.3
  group.add(deck)

  const deckMesh = new T.Mesh(new T.BoxGeometry(1.06, 0.08, 0.5), panelMat)
  deckMesh.castShadow = true
  deckMesh.receiveShadow = true
  deck.add(deckMesh)
  box(1.02, 0.012, 0.44, new T.MeshStandardMaterial({ color: lift(base.surface3, 0.28), roughness: 0.5, metalness: 0.35 }), 0, 0.045, 0.01, deck)
  box(1.06, 0.03, 0.03, edgeMat, 0, 0.02, 0.25, deck)

  // 摇杆：底座和防尘罩照着台面固定，杆 + 球挂在同一个枢轴上整体摆动。
  // 早先是「杆平移一半、球平移一倍」硬拼的，拖动中一旦丢事件（指针甩出窗口，
  // pointerup 没回来）就停在错位上，看起来像杆和球是两个零件。
  const STICK_X = -0.32
  const STICK_Z = 0.02

  const stickBase = new T.Mesh(new T.CylinderGeometry(0.086, 0.098, 0.03, 28), bodyMat)
  stickBase.position.set(STICK_X, 0.062, STICK_Z)
  stickBase.castShadow = true
  deck.add(stickBase)

  const stickBoot = new T.Mesh(
    new T.CylinderGeometry(0.032, 0.06, 0.028, 20),
    new T.MeshStandardMaterial({ color: darken(base.surface3, 0.4), roughness: 0.9, metalness: 0.05 }),
  )
  stickBoot.position.set(STICK_X, 0.086, STICK_Z)
  deck.add(stickBoot)

  stickPivot = new T.Group()
  stickPivot.position.set(STICK_X, 0.094, STICK_Z)
  deck.add(stickPivot)

  stickShaft = new T.Mesh(new T.CylinderGeometry(0.0135, 0.016, 0.125, 16), metalMat)
  stickShaft.position.y = 0.0625
  stickShaft.castShadow = true
  stickPivot.add(stickShaft)

  stickBall = new T.Mesh(
    new T.SphereGeometry(0.05, 24, 16),
    new T.MeshStandardMaterial({ color: lift(base.accent, 0.1), roughness: 0.28, metalness: 0.25, emissive: base.accent, emissiveIntensity: 0.2 }),
  )
  stickBall.position.y = 0.148
  stickBall.castShadow = true
  stickPivot.add(stickBall)

  // 不可见命中垫
  const pad = (w: number, h: number, x: number, y: number, z: number, action: string, parent: any = group) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ visible: false }))
    m.position.set(x, y, z)
    m.userData.action = action
    parent.add(m)
    targets[`pad-${action}`] = m
  }

  const button = (x: number, mat: unknown, action: string, radius = 0.048) => {
    const m = new T.Mesh(new T.CylinderGeometry(radius, radius, 0.045, 24), mat)
    m.position.set(x, 0.06, 0.07)
    m.castShadow = true
    m.userData.action = action
    deck.add(m)
    targets[action] = m
  }
  button(0.06, new T.MeshStandardMaterial({ color: lift(base.accentSoft, 0.15), roughness: 0.35, emissive: base.accentSoft, emissiveIntensity: 0.5 }), 'a')
  button(0.23, new T.MeshStandardMaterial({ color: base.accent, roughness: 0.35, emissive: base.accent, emissiveIntensity: 0.5 }), 'b')
  button(0.43, edgeMat, 'start', 0.058)

  pad(0.24, 0.28, STICK_X, 0.15, 0.09, 'stick', deck)
  pad(0.15, 0.15, 0.06, 0.07, 0.08, 'a', deck)
  pad(0.15, 0.15, 0.23, 0.07, 0.08, 'b', deck)
  pad(0.17, 0.17, 0.43, 0.07, 0.08, 'start', deck)
  pad(0.76, 0.57, 0, 1.52, 0.305, 'screen')
  pad(1.0, 0.24, 0, 2.06, 0.16, 'admin')

  // 投币口
  box(0.24, 0.3, 0.03, panelMat, 0, 0.44, 0.295)
  const slot = new T.Mesh(new T.PlaneGeometry(0.038, 0.13), new T.MeshBasicMaterial({ color: base.accent, toneMapped: false }))
  slot.position.set(0, 0.45, 0.313)
  slot.userData.action = 'coin'
  group.add(slot)
  targets.coin = slot
  pad(0.3, 0.4, 0, 0.45, 0.316, 'coin')

  // ---- 环境小物 ----
  const stoolMat = new T.MeshStandardMaterial({ color: darken(base.surface3, 0.3), roughness: 0.6, metalness: 0.3 })
  const seat = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.07, 24), stoolMat)
  seat.position.set(1.15, 0.62, 0.75)
  seat.castShadow = true
  scene.add(seat)
  ;[0, 1, 2].forEach((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.4
    const leg = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.62, 8), metalMat)
    leg.position.set(1.15 + Math.cos(a) * 0.16, 0.31, 0.75 + Math.sin(a) * 0.16)
    leg.rotation.z = Math.cos(a) * 0.12
    leg.rotation.x = -Math.sin(a) * 0.12
    leg.castShadow = true
    scene.add(leg)
  })

  const crateMat = new T.MeshStandardMaterial({ color: lift(base.surface3, 0.05), roughness: 0.75, metalness: 0.1 })
  const c1 = box(0.52, 0.42, 0.46, crateMat, -1.35, 0.21, 0.15)
  const c2 = box(0.44, 0.36, 0.4, crateMat, -1.32, 0.6, 0.1)
  c1.rotation.y = 0.12
  c2.rotation.y = -0.18
  ;[[-1.2, 0.79, 0.12], [-1.42, 0.79, 0.02], [-1.3, 0.79, 0.24]].forEach(([x, y, z]) => {
    const coin = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.012, 16), metalMat)
    coin.position.set(x, y, z)
    coin.rotation.x = 0.1
    coin.castShadow = true
    scene.add(coin)
  })

  const poolCanvas = document.createElement('canvas')
  poolCanvas.width = poolCanvas.height = 256
  const pctx = poolCanvas.getContext('2d')
  if (pctx) {
    const g = pctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, 'rgba(255,255,255,.85)')
    g.addColorStop(0.5, 'rgba(255,255,255,.16)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    pctx.fillStyle = g
    pctx.fillRect(0, 0, 256, 256)
    const pool = new T.Mesh(
      new T.PlaneGeometry(4.6, 3.6),
      new T.MeshBasicMaterial({
        map: new T.CanvasTexture(poolCanvas),
        color: base.accent,
        transparent: true,
        opacity: 0.16,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(0, 0.004, 0.35)
    scene.add(pool)
  }
}

// ---------------------------------------------------------------- 主题联动

// 材质颜色是构建时按 CSS 变量算死的（不是引用变量），主题一切换就得整组重建。
// 游戏状态存在普通变量里，重建不会丢进度，屏幕重画一帧就接上了。
function disposeSceneGraph() {
  if (!scene) return
  for (const obj of scene.children.slice()) {
    obj.traverse?.((node: any) => {
      node.geometry?.dispose?.()
      const mat = node.material
      if (Array.isArray(mat)) {
        mat.forEach((m: any) => { m?.map?.dispose?.(); m?.dispose?.() })
      } else if (mat) {
        mat.map?.dispose?.()
        mat.dispose?.()
      }
    })
    scene.remove(obj)
  }
  for (const key of Object.keys(targets)) delete targets[key]
  // 屏幕贴图和摇杆都属于旧场景，置空让 buildScene 重新建
  screenTex = null
  screenCtx = null
  screenCanvas = null
  stickPivot = null
  stickShaft = null
  stickBall = null
}

function rebuildForTheme() {
  if (!scene || !renderer) return
  disposeSceneGraph()
  buildScene()
  addLights()
  // 雾色也得跟着换：它只影响远景，漏掉的话换主题后背景还是上一个主题的底色
  const tint = palette()
  scene.fog?.color?.set?.(new T.Color(tint.bg))
  if (signRoot) signRoot.visible = mode === 'idle'
  applyStick()
  drawScreen()
  applyCamera()
  startLoop()
}

function addLights() {
  const base = palette()
  const lift = (hex: string, amount: number) => new T.Color(hex).lerp(new T.Color(0xffffff), amount)
  const darken = (hex: string, amount: number) => new T.Color(hex).lerp(new T.Color(0x000000), amount)

  scene.add(new T.HemisphereLight(lift(base.surface, 0.3), darken(base.surface, 0.32), 1.45))

  const spot = new T.SpotLight(0xffffff, 46, 14, 0.52, 0.55, 2)
  spot.position.set(0.9, 4.6, 2.1)
  spot.target.position.set(0, 1.0, -0.1)
  spot.castShadow = true
  spot.shadow.mapSize.set(1024, 1024)
  spot.shadow.bias = -0.0012
  spot.shadow.camera.near = 1
  spot.shadow.camera.far = 12
  scene.add(spot)
  scene.add(spot.target)

  const glow = new T.PointLight(base.accent, 2.6, 3.2, 2)
  glow.position.set(0, 1.5, 0.75)
  scene.add(glow)

  const signLight = new T.PointLight(base.accent, 0.9, 3.4, 2)
  signLight.position.set(1.8, 2.35, -1.9)
  scene.add(signLight)

  const fill = new T.DirectionalLight(lift(base.surface, 0.35), 0.9)
  fill.position.set(4.5, 3.2, 5)
  scene.add(fill)

  // 背后补光：视角能绕一圈，机柜背面也得有体积
  const back = new T.DirectionalLight(lift(base.surface, 0.26), 1.7)
  back.position.set(-1.6, 3.6, -4.6)
  scene.add(back)

  // 顶光：把地面和环形墙照亮一点，360° 转到哪都有"房间"的感觉
  const ceiling = new T.PointLight(lift(base.surface, 0.5), 32, 18, 2)
  ceiling.position.set(0, 5.2, 0.6)
  scene.add(ceiling)

  // 侧后方轮廓光：转到背面时靠它勾出机箱的边
  const rim = new T.DirectionalLight(base.accentSoft, 0.85)
  rim.position.set(3.4, 2.4, -3.2)
  scene.add(rim)
}

// ---------------------------------------------------------------- 相机 / 循环

function applyCamera() {
  if (!camera) return
  const sp = Math.sin(cam.pol)
  camera.position.set(
    look.x + Math.sin(cam.az) * sp * cam.dist,
    look.y + Math.cos(cam.pol) * cam.dist,
    look.z + Math.cos(cam.az) * sp * cam.dist,
  )
  camera.lookAt(look.x, look.y, look.z)
}

// 开局：镜头推到屏幕前
function focusScreen() {
  // 灯箱正好卡在特写画面的右边缘，先收起来
  if (signRoot) signRoot.visible = false
  cam.taz = SCREEN_AZ
  cam.tpol = SCREEN_POL
  cam.tdist = SCREEN_DIST
  lookT.y = 1.52
  lookT.z = 0.30
  startLoop()
}

// 退出：按原路退回 3/4 机位
function returnToOrbit() {
  if (signRoot) signRoot.visible = true
  cam.taz = CAM_AZ
  cam.tpol = CAM_POL
  cam.tdist = baseDist
  lookT.y = 1.05
  lookT.z = 0
  startLoop()
}

function applyStick() {
  // 杆和球都是枢轴的子节点，转枢轴就行——两者不可能再分开
  if (!stickPivot) return
  stickPivot.rotation.z = -stickOffset * 0.4
}

// releaseStick 把摇杆回中。pointerup 一旦丢了（指针甩出窗口、切标签页、
// 系统弹窗抢焦点），摇杆会一直卡在偏位——所以除了 pointerup，还要在
// 失焦和 pointercancel 时兜一次。
function releaseStick() {
  if (!stickDrag) return
  stickDrag = false
  stickOffset = 0
  applyStick()
  startLoop()
}

function onWindowBlur() {
  releaseStick()
  orbiting = false
  pressed = ''
}

function loop(now: number) {
  raf = 0
  if (!renderer || !scene || !camera) return
  let again = false

  // 相机阻尼：只在还没到位时继续跑
  if (
    Math.abs(cam.taz - cam.az) > 0.0004 ||
    Math.abs(cam.tpol - cam.pol) > 0.0004 ||
    Math.abs(cam.tdist - cam.dist) > 0.001 ||
    Math.abs(lookT.y - look.y) > 0.001 ||
    Math.abs(lookT.z - look.z) > 0.001
  ) {
    cam.az += (cam.taz - cam.az) * 0.16
    cam.pol += (cam.tpol - cam.pol) * 0.16
    cam.dist += (cam.tdist - cam.dist) * 0.13
    look.y += (lookT.y - look.y) * 0.13
    look.z += (lookT.z - look.z) * 0.13
    applyCamera()
    again = true
  }

  if (mode === 'play') {
    if (!lastTs) lastTs = now
    const dt = Math.min(48, now - lastTs)
    lastTs = now
    stepGame(dt)
    drawScreen()
    again = true
  }

  if (mode === 'over') {
    if (now > overTimer) {
      mode = 'idle'
      lastTs = 0
      drawScreen()
      returnToOrbit()
    } else {
      again = true
    }
  }

  if (flashUntil) {
    if (now > flashUntil) {
      flashUntil = 0
      drawScreen()
    } else {
      drawScreen()
      again = true
    }
  }

  renderer.render(scene, camera)
  if (again) raf = requestAnimationFrame(loop)
}

function startLoop() {
  if (raf) return
  raf = requestAnimationFrame(loop)
}

// ---------------------------------------------------------------- 输入

function pickAction(event: PointerEvent | MouseEvent) {
  const canvas = canvasEl.value
  if (!canvas || !raycaster || !camera) return ''
  const rect = canvas.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(Object.values(targets), false)
  return (hits[0]?.object?.userData?.action as string) || ''
}

function addCredit() {
  if (credit >= 5) return
  credit += 1
  drawScreen()
  startLoop()
}

function cycleLevel() {
  level = level === 'mono' ? 'amber' : level === 'amber' ? 'blue' : 'mono'
  drawScreen()
  startLoop()
}

function setLevel(next: 'mono' | 'amber' | 'blue') {
  level = next
  drawScreen()
  startLoop()
}

function onPointerDown(event: PointerEvent) {
  const action = pickAction(event)
  const canvas = canvasEl.value
  pressed = action

  // 特写模式：屏幕以外的地方按一下就退出（此时不再转视角，手是用来打球的）
  if (mode !== 'idle') {
    if (action !== 'screen') exitGame()
    return
  }

  if (action === 'stick') {
    stickDrag = true
    dragFrom.x = event.clientX
    canvas?.setPointerCapture?.(event.pointerId)
    return
  }
  if (!action) {
    orbiting = true
    dragFrom.x = event.clientX
    dragFrom.y = event.clientY
    dragFrom.az = cam.taz
    dragFrom.pol = cam.tpol
    if (canvas) {
      canvas.style.cursor = 'grabbing'
      canvas.setPointerCapture?.(event.pointerId)
    }
  }
}

function onPointerMove(event: PointerEvent) {
  const canvas = canvasEl.value
  if (!canvas) return

  // 特写模式：指针横向位置直接决定挡板位置，比拖摇杆直观
  if (mode === 'play') {
    const rect = canvas.getBoundingClientRect()
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width)
    stickOffset = Math.max(-1, Math.min(1, nx * 2 - 1))
    applyStick()
    canvas.style.cursor = 'crosshair'
    startLoop()
    return
  }
  if (mode === 'over') return

  if (stickDrag) {
    const rect = canvas.getBoundingClientRect()
    stickOffset = Math.max(-1, Math.min(1, (event.clientX - dragFrom.x) / (rect.width * 0.12)))
    applyStick()
    startLoop()
    return
  }

  if (orbiting) {
    // 水平方向不设限：可以绕一整圈看机柜背后（房间做成了环形内壁，转到哪都有背景）；
    // 垂直方向留一点余量：压到 0 会翻过头，抬到 π 会钻到地板下面
    cam.taz = dragFrom.az - (event.clientX - dragFrom.x) * 0.006
    cam.tpol = Math.max(0.42, Math.min(2.28, dragFrom.pol + (event.clientY - dragFrom.y) * 0.004))
    startLoop()
    return
  }

  const hover = pickAction(event)
  canvas.style.cursor = hover ? 'pointer' : 'grab'
}

function onPointerUp(event: PointerEvent) {
  if (mode !== 'idle') {
    pressed = ''
    return
  }
  if (stickDrag) {
    releaseStick()
    pressed = ''
    return
  }
  if (orbiting) {
    orbiting = false
    const canvas = canvasEl.value
    if (canvas) canvas.style.cursor = 'grab'
    pressed = ''
    return
  }
  const action = pickAction(event)
  const same = action && action === pressed
  pressed = ''
  if (!same) return
  if (action === 'coin') addCredit()
  else if (action === 'screen' || action === 'start') startGame()
  else if (action === 'a') setLevel('mono')
  else if (action === 'b') setLevel('amber')
  else if (action === 'admin') emit('admin')
}

function onKey(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag && ['INPUT', 'TEXTAREA'].includes(tag)) return
  if (event.key === 'Escape') exitGame()
  if (event.key === 'c' || event.key === 'C') addCredit()
  if (event.key === 'Enter' || event.key === ' ') {
    if (tag === 'BUTTON') return
    event.preventDefault()
    if (mode === 'play') return
    startGame()
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (mode !== 'play') return
    event.preventDefault()
    stickOffset = Math.max(-1, Math.min(1, stickOffset + (event.key === 'ArrowLeft' ? -0.2 : 0.2)))
    applyStick()
    startLoop()
  }
}

function onVisibility() {
  if (!document.hidden) startLoop()
}

function resize() {
  const canvas = canvasEl.value
  if (!canvas || !renderer || !camera) return
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  const aspect = w / h
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(w, h, false)
  camera.aspect = aspect
  baseDist = aspect < 1.05 ? 5.1 : CAM_DIST
  if (mode !== 'play') {
    cam.dist = baseDist
    cam.tdist = baseDist
  }
  camera.updateProjectionMatrix()
  applyCamera()
  startLoop()
}

async function init() {
  const canvas = canvasEl.value
  if (!canvas) return
  try {
    T = await import('three')
  } catch {
    failed.value = true
    return
  }
  if (!alive) return

  renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFShadowMap

  scene = new T.Scene()
  // 远景化进背景色：环形内壁再远也不会被看成"墙到此为止"
  const roomTint = palette()
  scene.fog = new T.Fog(new T.Color(roomTint.bg), 6.5, 17)
  camera = new T.PerspectiveCamera(38, 1, 0.1, 60)

  buildScene()
  addLights()
  raycaster = new T.Raycaster()

  drawScreen()
  resize()
  ready.value = true

  canvas.style.cursor = 'grab'
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  // 失焦兜底：拖动中切走窗口，pointerup 不会回来，摇杆得自己回中
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
  visibilityBound = true
  // 主题（石墨·青 / 暖纸·朱砂）变了就重建场景，氛围跟着 CSS 走
  themeObserver = new MutationObserver(() => rebuildForTheme())
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
}

function start() {
  if (started) return
  started = true
  void init()
}

onMounted(() => {
  const stage = stageEl.value
  if (!stage) return
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        start()
        io?.disconnect()
      }
    },
    { rootMargin: '280px 0px' },
  )
  io.observe(stage)
  resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(stage)
})

onBeforeUnmount(() => {
  alive = false
  started = true
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  io?.disconnect()
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  themeObserver = null
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('blur', onWindowBlur)
  if (visibilityBound) document.removeEventListener('visibilitychange', onVisibility)
  const canvas = canvasEl.value
  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('blur', onWindowBlur)
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  scene?.traverse?.((obj: any) => {
    obj?.geometry?.dispose?.()
    const mat = obj?.material
    if (Array.isArray(mat)) {
      mat.forEach((m: any) => { m?.map?.dispose?.(); m?.dispose?.() })
    } else if (mat) {
      mat.map?.dispose?.()
      mat.dispose?.()
    }
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */
  screenTex?.dispose?.()
  renderer?.dispose?.()
  renderer?.forceContextLoss?.()
  scene = null
  camera = null
  renderer = null
})
</script>

<template>
  <div ref="stageEl" class="cabinet3d">
    <canvas
      ref="canvasEl"
      class="cabinet3d-canvas"
      role="application"
      aria-label="3D 街机：拖拽可以 360 度转动视角，点投币口投币，点屏幕开始游戏，游戏中点屏幕外退出，点顶部灯箱进入后台"
    ></canvas>

    <!-- 只给键盘和读屏用的入口，界面上不出现任何提示文字 -->
    <div class="cabinet3d-a11y">
      <button type="button" @click="addCredit">投币</button>
      <button type="button" @click="startGame">开始</button>
      <button type="button" @click="cycleLevel">换配色</button>
      <button type="button" @click="emit('admin')">后台登录</button>
    </div>

    <p v-if="!ready && !failed" class="cabinet3d-state">LOADING 3D…</p>
    <p v-else-if="failed" class="cabinet3d-state">3D 加载失败，请刷新重试</p>
  </div>
</template>

<style scoped>
.cabinet3d {
  position: relative;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 14px;
  background:
    radial-gradient(90% 70% at 50% 18%, color-mix(in srgb, var(--surface-2) 55%, transparent), transparent 72%),
    var(--bg);
  overflow: hidden;
}

.cabinet3d-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  min-height: 340px;
  max-height: 600px;
  cursor: grab;
  touch-action: none;
  outline: none;
}

/* 键盘 / 读屏入口：视觉上完全隐藏，但 Tab 能到 */
.cabinet3d-a11y {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.cabinet3d-state {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  margin: 0;
  color: var(--muted-3);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .16em;
  text-align: center;
}

@media (max-width: 720px) {
  .cabinet3d { border-radius: 12px; }
  .cabinet3d-canvas { aspect-ratio: 4 / 5; min-height: 380px; }
}
</style>
