<script setup>
/**
 * HeroAvatarWall —— 首页 hero 的头像墙（可切换、可交互）
 *
 * 按下按钮 → 原有的 hero 文案与轮播淡出，墙从背后浮上来并开始缓慢漂移；
 * 再按一次 → 墙退场，文案与轮播原样回来。**原有文案与轮播逻辑一行未改**，
 * 只是被盖住 / 淡出（见 HomeView.vue 的 .hero-inner.is-wall-on）。
 *
 * ## 运动模型：一张环面 + 两条锯齿
 * 直接把这一页铺成一张环面 —— 第 (r, c) 格取 `list[((r % Py) * Px + (c % Px)) % n]`
 * （横向周期 Px 列、纵向周期 Py 行）。环面的周期是轴对齐的，所以要让两个轴**各自**
 * 走满一个周期（0 → ±Px·step、0 → ±Py·step，时长各 = 自己的周期 ÷ 自己轴上的速度）：
 * 任一轴走到头时画面正好平移了自己一整个周期，逐像素与起点相同，那次跳回看不见；
 * 两个轴各跳各的，合起来就是一条**任意角度的匀速直线**。
 *
 * ⚠ 两条动画必须落在**两个不同的元素**上，否则同元素上的两条 transform 动画互相覆盖。
 *   这里用两层嵌套 wrapper（.wall__drift-x / .wall__drift-y），各自用自己的
 *   `transform: translate3d()`。**不用 `translate` 这个独立变换属性** ——
 *   它 iOS 14.1 以下不支持，一旦不支持横向那条就整条失效（墙不动）。
 *   嵌套 wrapper 兼容到老 iOS，而且每层能独立合成，移动端 GPU 更稳。
 *
 * ⚠ 前提是**瓷砖边界本身不可见**（gap 0、无边框、无圆角）—— 我们是无缝墙。
 *   哪天要给瓷砖加圆角或间隙，这套「两轴各跳各的」立刻露馅。
 *
 * ## 环面周期 (Px, Py) 怎么取
 *   · 装得下所有图（Px × Py ≥ n）—— 周期是取图的唯一范围；
 *   · 周期不小于视口（Px ≥ 完整可见列数、Py ≥ 行数）—— 于是视口里看不到重复图案。
 * 在满足这两条的前提下取网格总格数最小的一组。网格 = 视口 + 一个周期（两轴都要多铺
 * 一整个周期，这是这套设计避不开的代价）。
 *
 * ## 图不够会重复 —— 那是故意的
 * n 张图铺 m 格就重复 ⌈m/n⌉ 次。33 张图、桌面一屏 40 格时：26 张出现 1 次、
 * 7 张出现 2 次，且两次出现被环面映射甩到对角方向。**往图片文件夹里加图不用改任何代码**，
 * n 变大 → 周期变大 → 重复自然减少（加到 60 张时一屏全是不同的人）。
 *
 * ## 响应式
 * 瓷砖边长不写死在 JS 里，而是由 CSS 变量 `--wall-tile` 给目标值、媒体查询调档，
 * 组件读出来后再在 4px 网格上扫描（40→260），取「离目标最近且 DOM 不超预算」的那组。
 * 几何量的是**本组件的盒子**（= hero 的盒子）而不是视口，于是白拿三件事：
 * 手机地址栏收放、≤768px 的 `min-height: auto`、横竖屏切换，全都自动跟随。
 *
 * ## 交互（桌面悬停 / 触屏点击，两套）
 * 用 `matchMedia('(hover: hover) and (pointer: fine)')` 做能力检测，不看 UA：
 *   · 桌面：悬停弹出卡片（锚在格子上，头像从砖里飞进圆框）；卡片位置 JS 夹紧，
 *           免得贴边格子的卡被 hero 的 overflow: clip 裁掉。
 *   · 触屏：点一下弹居中的卡（360px 的卡挂在 96px 的格子上根本锚不住），点空白关闭。
 * ⚠ 瓷砖必须 `touch-action: pan-y`，否则墙会吃掉触摸事件、**手机上在 hero 区域滑不动页面**。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  /** 由父组件 v-model:active 控制（HomeView 里就是那个按钮的开关） */
  active: { type: Boolean, default: false },
  /** 漂移速度（px/秒，激活态）。屏幕速度恒定，与方向无关。
      参考项目首页用的是 4 —— 那是当纯底纹用的；实测 4px/s 走完一格要 47 秒，
      肉眼等于静止。要「一直在滚」的观感，取 20 上下（约 9 秒一格）。 */
  speed: { type: Number, default: 22 },
  /** 底纹态的速度。比激活态慢一档：它只是垫在文案后面的质感，不该抢阅读。 */
  speedBackdrop: { type: Number, default: 11 },
  /** 墙的整体不透明度（激活态） */
  opacity: { type: Number, default: 1 },
  /** 底纹态的暗淡程度。参考项目首页用的就是 0.16：
      0.09 时肉眼只剩一层灰雾、看不出是头像，0.16 才读得出「一面人脸墙」。 */
  dimOpacity: { type: Number, default: 0.18 },
  /** 单个网格允许的最大格数 —— DOM 节点数上的偏好（最软的一条约束） */
  blockBudget: { type: Number, default: 320 },
  /** 可用的缩略图档位（<thumbsBase>/ 下的目录名） */
  sizes: { type: Array, default: () => [384, 256] },
  /** 缩略图根目录。默认是首页那 33 位优秀成员的墙；「协会成员头像墙」（138 人
      群成员 + 优秀成员 + 负责人）传自己的目录即可，不用动组件。 */
  thumbsBase: { type: String, default: '/images/hero_wall_thumbs' },
  /** 缩略图扩展名。默认 .jpg（hero_wall_thumbs 是 GDI+ 转出来的）；群成员墙用 .webp */
  thumbsExt: { type: String, default: '.jpg' },
  /** 有哪些图（生成物） */
  manifestUrl: { type: String, default: '/data/hero_wall.manifest.json' },
  /** 悬浮卡片的文案（手写物） */
  copyUrl: { type: String, default: '/data/hero_wall.json' },
  /** 开关按钮的文案 —— 想换词在 HomeView 传 prop 即可，不用碰组件 */
  label: { type: String, default: '成员墙' },
  labelActive: { type: String, default: '返回' },
})
const emit = defineEmits(['update:active'])

/* 这个类在 setup 期就挂上，而不是等 onMounted ——
   它控制的是「hero 在手机上一屏高」这条布局规则，晚一帧挂就会看到首屏先 683px、
   装载后再跳到一屏高的抖动。 */
if (typeof document !== 'undefined') document.body.classList.add('hero-wall-present')

const rootEl = ref(null)
const items = ref([])
const sourceBase = ref('/images/excellent_member/')
/** 触屏端弹出的那一条 —— 存**条目对象本身**，不存下标：
    瓷砖序号（0..cols×rows-1）和图片下标（0..n-1）不是一个东西，
    而且几何重排后同一序号会换成另一张脸。 */
const openItem = ref(null)

/* ── 环境能力 ── */
const canHover = ref(true)
const inView = ref(true)
const pageHidden = ref(false)

/* ── 盒子尺寸 + 瓷砖目标值（都从 CSS 读，媒体查询负责调档） ── */
const boxW = ref(0)
const boxH = ref(0)
const tileTarget = ref(188)

const measure = () => {
  const el = rootEl.value
  if (!el) return
  boxW.value = el.clientWidth
  boxH.value = el.clientHeight
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--wall-tile'))
  if (Number.isFinite(v) && v > 0) tileTarget.value = v
}

/* ── 数据：清单（有哪些图）× 文案（写什么） ── */
/**
 * 卡片标签的两种写法都收：
 *   · 纯字符串 —— 首页那 33 位优秀成员的 hero_wall.json 就是这么写的（中性蓝胶囊）；
 *   · { text, type } —— 协会成员头像墙，type 交给全站那套分色（styles/honors.css 的
 *     .honor-tag--contest|destination|honor|contact|leader|more）。
 * 统一成 { text, type }，type 为空字符串时按纯字符串渲染。
 */
const normalizeTags = (list) => {
  if (!Array.isArray(list)) return []
  return list
    .map((t) =>
      typeof t === 'string'
        ? { text: t, type: '' }
        : { text: String(t?.text ?? ''), type: String(t?.type ?? '') }
    )
    .filter((t) => t.text.trim())
}

async function loadData() {
  const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const [man, copy] = await Promise.all([getJson(props.manifestUrl), getJson(props.copyUrl)])
  if (man && typeof man.source === 'string') sourceBase.value = man.source
  const files = Array.isArray(man?.images) ? man.images : []
  const dict = copy && typeof copy.tiles === 'object' && copy.tiles ? copy.tiles : {}
  items.value = files.map((file) => {
    const c = dict[file] || {}
    return {
      file,
      // 原图（缩略图失败时的兜底）。留空则退回 manifest 的 source 前缀。
      full: typeof c.full === 'string' ? c.full : '',
      name: typeof c.name === 'string' ? c.name : '',
      line: typeof c.line === 'string' ? c.line : '',
      tags: normalizeTags(c.tags),
    }
  })
}

/* ── 缩略图路径：按 瓷砖 × DPR 自动选档；缺图时 onerror 回退原图 ── */
const thumbSize = computed(() => {
  const list = [...props.sizes].map(Number).filter((n) => n > 0).sort((a, b) => a - b)
  if (!list.length) return 384
  const need = tileTarget.value * Math.min(window.devicePixelRatio || 1, 2)
  return list.find((s) => s >= need) || list[list.length - 1]
})
const thumbOf = (file) =>
  `${props.thumbsBase}/${thumbSize.value}/${file.replace(/\.[^.]+$/, props.thumbsExt)}`
/** 原图：只在缩略图失败时兜底。tiles 里写了 `full`（站内绝对路径）就直接用它 ——
    群成员墙的原图分散在三个目录（群头像 / 优秀成员 / 负责人），单一 source 前缀盖不住。 */
const originalOf = (file, full) => (full ? String(full) : sourceBase.value + file)

const onImgError = (e, item) => {
  const el = e.target
  if (el.dataset.fallback === '1') return // 原图也失败就认了，别再循环
  el.dataset.fallback = '1'
  el.src = originalOf(item.file, item.full)
}

/* ── 环面周期：装得下所有人 且 不小于视口，在此前提下格数最少 ── */
const periodFor = (n, cols0, rows0) => {
  let best = null
  for (let px = cols0; px <= Math.max(n, cols0); px++) {
    const py = Math.max(rows0, Math.ceil(n / px))
    const cells = (cols0 + px) * (rows0 + py)
    if (!best || cells < best.cells) best = { px, py, cells }
  }
  return best || { px: cols0, py: rows0, cells: (cols0 + 1) * (rows0 + 1) }
}

/* ── 一格的大小：4px 网格上取离目标最近的那个；格数超预算就往上放大 ── */
const geom = computed(() => {
  const n = items.value.length || 1
  const base = Math.max(40, Math.round(tileTarget.value / 4) * 4)
  const W = boxW.value
  const H = boxH.value
  if (!W || !H) return { s: base, px: 1, py: 1, cols: 1, rows: 1 }

  let best = null
  let lax = null
  for (let s = 40; s <= 260; s += 4) {
    const cols0 = Math.ceil(W / s)
    const rows0 = Math.ceil(H / s)
    const p = periodFor(n, cols0, rows0)
    const cand = { s, px: p.px, py: p.py, cols: cols0 + p.px, rows: rows0 + p.py }
    cand.cells = cand.cols * cand.rows
    if (!lax || Math.abs(s - base) < Math.abs(lax.s - base)) lax = cand
    if (cand.cells > props.blockBudget) continue
    if (!best || Math.abs(s - base) < Math.abs(best.s - base)) best = cand
  }
  // 都超预算就退到最接近目标的那组（宁可多几个节点，也不要算不出几何）
  return best || lax || { s: base, px: 1, py: 1, cols: 2, rows: 2 }
})

/* ── 漂移：方向每次加载随机，两轴各走自己的一整个周期 ── */
const angle = ref(Math.random() * Math.PI * 2)
/** 一个轴慢到这个速度以下就当它不动 —— 否则时长算出 Infinity，CSS 当 0s，整面墙每帧跳一次周期 */
const MIN_AXIS_SPEED = 0.02

const drift = computed(() => {
  // 底纹态慢一档（见 props 说明）。方向角不随状态变，切换时不会突然拐弯。
  const speed = props.active ? props.speed : props.speedBackdrop
  const vx = Math.cos(angle.value) * speed
  const vy = Math.sin(angle.value) * speed
  const px = geom.value.px * geom.value.s
  const py = geom.value.py * geom.value.s
  return {
    // 位移 = ±一整个周期；Math.sign(0) === 0 → 速度为 0 的那个轴位移干脆为 0
    dx: Math.sign(vx) * px,
    dy: Math.sign(vy) * py,
    xDur: px / Math.max(Math.abs(vx), MIN_AXIS_SPEED),
    yDur: py / Math.max(Math.abs(vy), MIN_AXIS_SPEED),
  }
})
/** 网格起点：位移取正的那一侧要往反方向让出一个周期，保证走到头也不露白边 */
const gridX = computed(() => -Math.max(0, drift.value.dx))
const gridY = computed(() => -Math.max(0, drift.value.dy))

/* ── 平铺序列：在环面上取图，一个周期内正好覆盖全部图片 ── */
const tiles = computed(() => {
  const list = items.value
  const n = list.length
  const { px, py, cols, rows } = geom.value
  const out = []
  if (!n || !cols || !rows) return out
  const total = cols * rows
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / cols)
    const c = i - r * cols
    out.push(list[((r % py) * px + (c % px)) % n])
  }
  return out
})

const wallStyle = computed(() => ({
  '--step': geom.value.s + 'px',
  '--cols': geom.value.cols,
  '--rows': geom.value.rows,
  '--grid-x': gridX.value + 'px',
  '--grid-y': gridY.value + 'px',
  '--drift-x': drift.value.dx + 'px',
  '--drift-y': drift.value.dy + 'px',
  '--drift-x-dur': drift.value.xDur + 's',
  '--drift-y-dur': drift.value.yDur + 's',
  /* 暗淡度挂在**每一张图**上，不挂在 .wall 容器上：
     容器的 opacity 会把整棵子树一起压暗，那样悬停那一格永远亮不起来，
     底纹态的「模糊亮斑」就无从谈起。 */
  '--wall-opacity': props.active ? props.opacity : props.dimOpacity,
}))

/* ── 暂停：悬停 / 卡片打开 / 滚出视口 / 标签页切走 ── */
const paused = computed(() => !inView.value || pageHidden.value || !!openItem.value)

/* ── 悬停：卡片夹紧（免得贴边格子的卡被 hero 的 overflow: clip 裁掉） ── */
const CARD_W = 360
const CARD_H = 132
let lastTile = null

/** 顶栏下沿（视口坐标）。顶栏是 fixed 的，所以它的下沿就是「内容不该钻进去」的那条线。 */
const headerBottom = () => {
  const h = typeof document !== 'undefined' ? document.querySelector('#app > header') : null
  return h ? h.getBoundingClientRect().bottom : 0
}

const clampCard = (tile) => {
  const root = rootEl.value
  if (!tile || !root) return
  const r = tile.getBoundingClientRect()
  const c = root.getBoundingClientRect()
  if (!c.width || !c.height) return
  const cardW = Math.min(CARD_W, c.width - 32)
  const halfW = cardW / 2 + 10
  const halfH = CARD_H / 2 + 10
  const cx = r.left + r.width / 2 - c.left
  const cy = r.top + r.height / 2 - c.top
  // 上边界用「顶栏下沿」而不是容器上沿：顶栏的 pointer-events 已放开（横屏下墙要在
  // 那一条里也能悬停），但卡片不能钻到导航栏底下去 —— 那样只会露出半张。
  const minY = Math.max(0, headerBottom() - c.top) + halfH
  const maxY = c.height - halfH
  let sx = 0
  let sy = 0
  // 卡片中心 = 格子中心 + (sx, sy)，所以「贴左边界」要往右推（正）、
  // 「贴右边界」要往左推（负）—— 两边的符号相反，别写反。
  if (cx < halfW) sx = halfW - cx
  else if (cx > c.width - halfW) sx = c.width - halfW - cx
  if (cy < minY) sy = minY - cy
  else if (cy > maxY) sy = maxY - cy
  tile.style.setProperty('--sx', sx.toFixed(1) + 'px')
  tile.style.setProperty('--sy', sy.toFixed(1) + 'px')
}

/** 只在「换了一格」时才算，避免 pointerover 在子元素间反复触发时反复量布局。
    底纹态不需要（那时不弹卡），直接跳过 —— 省掉每次悬停的一次布局读取。 */
const onGridOver = (e) => {
  if (!canHover.value || !props.active) return
  const tile = e.target.closest?.('.wall__tile') || null
  if (tile === lastTile) return
  lastTile = tile
  if (tile) clampCard(tile)
}

/* ── 点击：只有激活态才弹卡（底纹态点一下什么都不做，滑动手势也交给浏览器） ── */
let downPt = null
const onGridDown = (e) => {
  downPt = { x: e.clientX, y: e.clientY }
}
const onGridClick = (e) => {
  if (!props.active) return // 底纹态：不响应点击
  if (canHover.value) return // 桌面端靠 :hover，点击不用管
  // 顶栏那一条的 pointer-events 已放开（横屏下墙要在那里也能悬停），
  // 但那是导航栏的地盘 —— 点在它的空白处不该弹出成员卡。
  if (e.clientY <= headerBottom()) return
  const tile = e.target.closest?.('.wall__tile')
  if (!tile) return
  if (downPt && (Math.abs(e.clientX - downPt.x) > 10 || Math.abs(e.clientY - downPt.y) > 10)) return
  const i = Number(tile.dataset.i)
  if (Number.isInteger(i)) openItem.value = tiles.value[i] || null
}

const closeCard = () => (openItem.value = null)

const toggle = () => emit('update:active', !props.active)
const onKeydown = (e) => {
  if (e.key !== 'Escape') return
  if (openItem.value) closeCard()
  else if (props.active) emit('update:active', false)
}

/* ── 顶栏：底纹态下把它「掏空」 ──
   顶栏是 position: fixed 的整条，高 80px。竖屏时它只占视口的 9%，感知不到；
   **手机横屏时它占 20%+**（实测 844×390 时整片墙有 22% 落在它下面收不到悬停）。
   底纹态顶栏本身是透明的，那一条其实只有左边 logo 和右边导航是真的可点，
   中间是空的 —— 把顶栏整体放开、只留这些可点元素，墙就能在那一条里被悬停到。
   ⚠ 只在**底纹态**这么做：激活态顶栏压着一层 90% 白纱，墙在它下面本来就看不见，
   放开反而会让「点顶栏空白处」误弹出成员卡。 */
watch(
  () => props.active,
  (v) => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('hero-wall-on', !!v)
  },
  { immediate: true }
)

/* ── 生命周期 ── */
let ro = null
let io = null
const mq = typeof window !== 'undefined' ? window.matchMedia('(hover: hover) and (pointer: fine)') : null
const onMqChange = (e) => {
  canHover.value = e.matches
  if (canHover.value) openItem.value = null
}
const onVis = () => (pageHidden.value = document.hidden)

onMounted(async () => {
  canHover.value = mq ? mq.matches : true
  mq?.addEventListener?.('change', onMqChange)

  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(rootEl.value)
  } else {
    window.addEventListener('resize', measure, { passive: true })
  }
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(([entry]) => (inView.value = entry.isIntersecting), { threshold: 0 })
    io.observe(rootEl.value)
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('keydown', onKeydown)

  await loadData()
})

onBeforeUnmount(() => {
  ro?.disconnect()
  io?.disconnect()
  mq?.removeEventListener?.('change', onMqChange)
  window.removeEventListener('resize', measure)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', onVis)
  if (typeof document !== 'undefined') document.body.classList.remove('hero-wall-present', 'hero-wall-on')
})

// 关掉卡片时把上一格的 hover 位移清掉，免得下次悬停用到旧值
watch(openItem, (v) => {
  if (!v) lastTile = null
})
</script>

<template>
  <div ref="rootEl" class="hero-avatar-wall">
    <!-- 头像墙本体：固定铺满 hero 盒子，在文案与轮播背后（z-index 见 scoped 样式）。
         两种状态共用**同一套几何**（同样的瓷砖、同样的环面），只切不透明度与是否可交互 ——
         于是切换是一次纯淡入淡出，不重排、不重启漂移动画，画面不会跳。
           · 底纹态（默认）：淡着铺在背景里，悬停出模糊亮斑，不弹卡；
           · 激活态（is-active）：全强度，悬停弹卡、点击弹居中卡。 -->
    <div
      v-if="tiles.length"
      class="wall"
      :class="{ 'is-active': active, 'is-paused': paused }"
      aria-hidden="true"
      :style="wallStyle"
      @pointerover="onGridOver"
      @pointerdown="onGridDown"
      @click="onGridClick"
    >
      <div class="wall__drift-x">
        <div class="wall__drift-y">
          <div class="wall__grid">
            <div
              v-for="(m, i) in tiles"
              :key="i"
              class="wall__tile"
              :data-i="i"
            >
              <img
                class="wall__img"
                :src="thumbOf(m.file)"
                alt=""
                loading="eager"
                decoding="async"
                fetchpriority="low"
                @error="onImgError($event, m)"
              />

              <!-- 悬停卡（仅 hover 设备）：左圆框头像 + 右侧姓名 / 班级 / 奖项 -->
              <div class="wall__card">
                <div class="wall__avatar">
                  <img :src="thumbOf(m.file)" alt="" loading="lazy" decoding="async" @error="onImgError($event, m)" />
                </div>
                <div class="wall__info">
                  <p class="wall__name">{{ m.name || ' ' }}</p>
                  <p v-if="m.line" class="wall__line">{{ m.line }}</p>
                  <div v-if="m.tags.length" class="wall__tags">
                    <span
                      v-for="(t, j) in m.tags"
                      :key="j"
                      :class="t.type ? ['honor-tag', `honor-tag--${t.type}`, 'wall__tag--typed'] : 'wall__tag'"
                      >{{ t.text }}</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 触屏端的居中卡：不能放进网格里 —— 网格的祖先带 transform，
         position: fixed 会相对那个祖先定位，而不是视口。 -->
    <div v-if="active && openItem" class="wall-sheet" @click.self="closeCard">
      <div class="wall-sheet__card">
        <div class="wall-sheet__avatar">
          <img :src="thumbOf(openItem.file)" alt="" decoding="async" @error="onImgError($event, openItem)" />
        </div>
        <p class="wall-sheet__name">{{ openItem.name || ' ' }}</p>
        <p v-if="openItem.line" class="wall-sheet__line">{{ openItem.line }}</p>
        <div v-if="openItem.tags.length" class="wall-sheet__tags">
          <span
            v-for="(t, j) in openItem.tags"
            :key="j"
            :class="t.type ? ['honor-tag', `honor-tag--${t.type}`, 'wall__tag--typed'] : 'wall__tag'"
            >{{ t.text }}</span
          >
        </div>
        <p class="wall-sheet__hint">点空白处关闭</p>
      </div>
    </div>

    <!-- 开关：必须在 .hero-inner 之外，否则会跟着文案一起退场就回不来了。
         文案由 label / labelActive 两个 prop 给，改词不用碰组件。 -->
    <button
      v-if="items.length"
      class="wall-toggle"
      :class="{ 'is-on': active }"
      type="button"
      :aria-pressed="active"
      :aria-label="active ? labelActive : label"
      @click="toggle"
    >
      <!-- 空闲：2×2 网格，指代「一面墙」 -->
      <svg v-if="!active" class="wall-toggle__icon" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="1" y="1" width="8" height="8" rx="2.6" fill="currentColor" />
        <rect x="11" y="1" width="8" height="8" rx="2.6" fill="currentColor" />
        <rect x="1" y="11" width="8" height="8" rx="2.6" fill="currentColor" />
        <rect x="11" y="11" width="8" height="8" rx="2.6" fill="currentColor" />
      </svg>
      <!-- 激活：返回箭头 -->
      <svg v-else class="wall-toggle__icon" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M12 4 6 10l6 6"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="wall-toggle__text">{{ active ? labelActive : label }}</span>
    </button>
  </div>
</template>

<style scoped>
/* ==========================================================================
   容器：铺满 hero 的 padding box（.hero 是最近的定位祖先）
   ========================================================================== */
.hero-avatar-wall {
  /* 瓷砖目标边长 —— 媒体查询调档，组件读它，再在 4px 网格上扫描取最优。
     量的是本元素的盒子（= hero 的盒子），不是视口。 */
  --wall-tile: 188px;

  position: absolute;
  inset: 0;
  /* ⚠ 这里**故意不设 z-index**：一旦设了（哪怕 0），本元素就会形成层叠上下文，
     内部按钮的 z-index 再高也压不过外面的 .hero-inner —— 按钮会被 hero 内容盖住、点不到。
     墙面本身由下面 .wall 的 z-index: 0 定位在 hero 最底层。 */
  pointer-events: none; /* 只有瓷砖和按钮自己打开事件，其余交给页面 */
}
@media (max-width: 1199px) {
  .hero-avatar-wall { --wall-tile: 148px; }
}
@media (max-width: 991px) {
  .hero-avatar-wall { --wall-tile: 132px; }
}
@media (max-width: 767px) {
  .hero-avatar-wall { --wall-tile: 96px; }
}

/* ==========================================================================
   墙
   ========================================================================== */
.wall {
  position: absolute;
  inset: 0;
  /* 与 .code-scroll-bg / .float-shapes / .hero-particles 同为 z-index: 0，
     DOM 序决定它在最下面；.hero-inner 是 z-index: 1，天然在墙上面 */
  z-index: 0;
  overflow: hidden;
  animation: wall-in 520ms ease both;
}
@keyframes wall-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 两层嵌套 wrapper：两条 transform 动画必须落在**两个不同的元素**上，
   否则同元素上的两条会互相覆盖。各自 translate3d 自己的一个周期。 */
.wall__drift-x {
  position: absolute;
  left: var(--grid-x);
  top: var(--grid-y);
  animation: wall-drift-x var(--drift-x-dur) linear infinite;
  will-change: transform;
}
.wall__drift-y {
  animation: wall-drift-y var(--drift-y-dur) linear infinite;
  will-change: transform;
}
@keyframes wall-drift-x {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(var(--drift-x), 0, 0); }
}
@keyframes wall-drift-y {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(0, var(--drift-y), 0); }
}

.wall__grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), var(--step));
  grid-template-rows: repeat(var(--rows), var(--step));
  width: calc(var(--cols) * var(--step));
  height: calc(var(--rows) * var(--step));
  /* 无缝：gap 恒为 0、无边框、无圆角 —— 这是「两轴各跳各的」能成立的前提 */
}

.wall__tile {
  position: relative;
  width: var(--step);
  height: var(--step);
  background: #eef2f7;
  overflow: visible; /* 悬停卡比格子大得多，要能探出去 */
  pointer-events: auto;
  /* ⚠ 垂直滑动必须交还给浏览器，否则手机上在 hero 区域滑不动页面 */
  touch-action: pan-y;
}
.wall__img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 暗淡度在这里：底纹态 0.18、激活态 1，切换时 160 张一起淡入 —— 这就是「墙亮起来」 */
  opacity: var(--wall-opacity, 1);
  transition:
    opacity 520ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 300ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── 底纹态的悬停：这一格「亮起来并模糊」 ──
   为什么模糊的是图本身、而不是加一层毛玻璃（backdrop-filter）：
   墙在底纹态只有 0.18 的不透明度，隔着它去模糊背后那层平滑的渐变底，肉眼看不出任何变化；
   模糊自己这张图才有东西可看 —— 效果是一团柔和的亮斑跟着鼠标在墙面上走。
   参数取「大模糊 + 中等不透明度 + 放大」：blur 会把元素自身的 alpha 一起抹开，
   于是边缘自然摊成十几像素的软过渡，不会是一块硬邦邦的方块；
   再抬 z-index 保证它压在相邻格子之上。只在底纹态生效，激活态交给悬停卡。 */
@media (hover: hover) and (pointer: fine) {
  .wall:not(.is-active) .wall__tile:hover {
    z-index: 4;
  }
  .wall:not(.is-active) .wall__tile:hover .wall__img {
    opacity: 0.55;
    filter: blur(18px) saturate(1.2);
    transform: scale(1.4);
  }
}

/* ── 暂停：卡片打开 / 滚出视口 / 标签页切走 ──
   ⚠ 刻意**不**把「悬停」算进来。悬停暂停看着很美，实测下来是反效果：
     墙铺满 hero（≈整屏），鼠标只要在页面上就必然悬停着某一格 ——
     于是漂移这个招牌效果等于被永久冻结（这一条对底纹态和激活态都成立）。
     悬停卡跟着瓷砖以 4px/s 走，读完一张卡才移动十几个像素，完全不影响阅读。
     （顺带也省掉了每次 mousemove 都要对 160 个格子重算 :has() 的开销。） */
.wall.is-paused .wall__drift-x,
.wall.is-paused .wall__drift-y {
  animation-play-state: paused;
}

/* ==========================================================================
   悬停卡（仅 hover 设备）
   ========================================================================== */
.wall__card {
  --card-w: 360px;
  --avatar: 96px;
  --pad: 16px;
  /* 头像的起飞点：卡片正好以格子中心为锚 → 卡片中心 == 原格子中心。
     头像自然位置在卡片左侧，其中心距卡片中心 = 卡片半宽 − 内边距 − 头像半宽；
     于是「右移这么多 + 放大到格子尺寸」正好盖回原格子上，归零即飞到位。
     再减去卡片的夹紧位移 (--sx/--sy)，贴边格子也能精确落回原砖。 */
  --from-x: calc(var(--card-w) / 2 - var(--pad) - var(--avatar) / 2);
  --shift-x: var(--sx, 0px);
  --shift-y: var(--sy, 0px);

  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 14px;
  width: min(var(--card-w), calc(100vw - 32px));
  padding: var(--pad);
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  box-shadow:
    0 18px 48px rgba(15, 23, 42, 0.18),
    0 2px 8px rgba(15, 23, 42, 0.06);
  text-align: left;
  opacity: 0;
  pointer-events: none;
  transform: translate(calc(-50% + var(--shift-x)), calc(-50% + var(--shift-y))) scale(0.88);
  transition:
    opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.wall__avatar {
  flex: none;
  width: var(--avatar);
  height: var(--avatar);
  padding: 3px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a73e8, #4fc3f7);
  transform: translate(calc(var(--from-x) - var(--shift-x)), calc(0px - var(--shift-y)))
    scale(calc(var(--step) / var(--avatar)));
  transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
}
.wall__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #fff;
  background: #e2e8f0;
}
.wall__info {
  min-width: 0;
}
.wall__name {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.35;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wall__line {
  margin-top: 2px;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wall__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.wall__tag {
  font-size: 0.75rem;
  line-height: 1.7;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(26, 115, 232, 0.08);
  color: #1a73e8;
  white-space: nowrap;
}

/* 带头像墙分色的标签（协会成员头像墙用）——颜色走全站那套：
   styles/honors.css 的 .honor-tag--contest|destination|honor|contact|leader|more，
   每个修饰类自己持有 --tag-* 私有变量。这里只压小卡内几何：整页那套 3px 12px 的内边距
   在 360×132 的悬浮卡里会把卡片撑高。**不要**在这里回写颜色，否则六种色会退化成一种。 */
.wall__tag--typed {
  font-size: 0.75rem;
  line-height: 1.7;
  padding: 0 8px;
  white-space: nowrap;
}

/* 悬停卡只在**激活态**出现 —— 底纹态悬停是上面那块模糊亮斑，不弹卡。
   用能力检测包住，触屏上不启用（iOS 会把第一次 tap 当 hover）。 */
@media (hover: hover) and (pointer: fine) {
  .wall.is-active .wall__tile:hover {
    z-index: 5;
  }
  .wall.is-active .wall__tile:hover .wall__card {
    opacity: 1;
    transform: translate(calc(-50% + var(--shift-x)), calc(-50% + var(--shift-y))) scale(1);
  }
  .wall.is-active .wall__tile:hover .wall__avatar {
    transform: translate(0, 0) scale(1);
  }
}

/* ==========================================================================
   触屏端的居中卡
   ========================================================================== */
/* 触屏端的居中卡。
   ⚠ 必须 position: fixed（相对**视口**居中），不能用 absolute 相对 hero——
     hero 在横屏下能高到 900px+ 而视口只有 390px，相对 hero 居中的卡片会整张弹到屏幕外。
   这里能用 fixed 是因为它**不在网格里**：网格的祖先带 transform，
    那条链上的 fixed 会退化成相对祖先定位（组件头部注释里提过）。 */
.wall-sheet {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.34);
  pointer-events: auto;
  animation: wall-in 200ms ease both;
}
.wall-sheet__card {
  width: min(340px, 100%);
  padding: 24px 20px 18px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  text-align: center;
}
.wall-sheet__avatar {
  width: 104px;
  height: 104px;
  margin: 0 auto 12px;
  padding: 3px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a73e8, #4fc3f7);
}
.wall-sheet__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #fff;
  background: #e2e8f0;
}
.wall-sheet__name {
  font-size: 1.125rem;
  font-weight: 600;
  color: #0f172a;
}
.wall-sheet__line {
  margin-top: 4px;
  font-size: 0.8125rem;
  color: #64748b;
}
.wall-sheet__tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
  margin-top: 12px;
}
.wall-sheet__hint {
  margin-top: 16px;
  font-size: 0.75rem;
  color: #94a3b8;
}

/* ==========================================================================
   开关按钮：在墙之上（z-index: 30），且不在 .hero-inner 里。
   位置分两套（见下面的断点）：
     · 桌面：底部居中的药丸 —— 那个位置本来就是空的；
     · ≤991px：**左下角**的圆形图标钮。hero 在这一档变成单列，文案与轮播竖着排下来，
       下面这两样都会跟「底部居中 / 右下」抢位置：
         · slider 的圆点是 text-align:center 的，落在底部居中（实测 375px 时占 x 91–283）；
         · 「加入我们」浮动按钮固定在视口右下（实测 375×667 时正好压住 hero 的右下角）。
       左下角两边都让开，是唯一不打架的位置。
       这一档同时收起文字只留图标，按钮也就不必为了塞下文案而变宽。
   ========================================================================== */
.wall-toggle {
  position: absolute;
  left: 50%;
  bottom: 24px;
  z-index: 30;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px; /* 触控目标下限（Apple HIG） */
  padding: 0 18px 0 16px;
  border: 1px solid rgba(26, 115, 232, 0.24);
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
  color: #1a73e8;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  transition:
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 200ms ease,
    background 200ms ease,
    color 200ms ease,
    border-color 200ms ease;
}
/* 激活态：反色，一眼能看出「现在是墙在前面」 */
.wall-toggle.is-on {
  background: #1a73e8;
  border-color: #1a73e8;
  color: #fff;
  box-shadow: 0 6px 20px rgba(26, 115, 232, 0.3);
}
.wall-toggle:hover {
  transform: translateX(-50%) translateY(-2px);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.16);
}
.wall-toggle.is-on:hover {
  box-shadow: 0 10px 26px rgba(26, 115, 232, 0.36);
}
.wall-toggle:active {
  transform: translateX(-50%) scale(0.97);
}
.wall-toggle__icon {
  display: block;
  flex: none;
  width: 16px;
  height: 16px;
}
.wall-toggle__text {
  white-space: nowrap;
}
@media (max-width: 991px) {
  .wall-toggle {
    left: 16px; /* 取消居中：靠左下，避开 slider 居中的圆点与右下角的「加入我们」 */
    right: auto;
    bottom: 16px;
    transform: none;
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    justify-content: center;
    border-radius: 50%;
  }
  .wall-toggle:hover {
    transform: translateY(-2px);
  }
  .wall-toggle:active {
    transform: scale(0.96);
  }
  .wall-toggle__text {
    display: none; /* 只留图标 */
  }
  .wall-toggle__icon {
    width: 18px;
    height: 18px;
  }
}

/* 769–991px 这一档要单独处理：
   它虽然也是单列（≤992px 单列），但 hero 仍是 min-height: 100vh 且内容撑得比视口高
   （实测 900×800 时 hero 高约 1120px），贴在 hero 底部的按钮就落到首屏之外了。
   好消息是这一档 hero 的上内边距是 header + 120px，顶上有一大片空白 —— 挪上去正好。 */
@media (min-width: 769px) and (max-width: 991px) {
  .wall-toggle {
    top: calc(var(--header-height, 80px) + 24px);
    bottom: auto;
  }
}

/* ==========================================================================
   无障碍：尊重「减弱动态效果」
   ========================================================================== */
@media (prefers-reduced-motion: reduce) {
  .wall__drift-x,
  .wall__drift-y {
    animation: none;
  }
  .wall,
  .wall-sheet {
    animation: none;
  }
  .wall__img,
  .wall__card,
  .wall__avatar,
  .wall-toggle {
    transition: none;
  }
}
</style>

<!-- ==========================================================================
     非 scoped：头像墙激活时，给顶部固定导航栏加一层「白纱 + 阴影」。

     为什么写在**这个组件**里而不是 AppHeader.vue：
     这条规则完全属于头像墙这个功能，放在这里它就会随组件一起被删除，
     AppHeader 一个字符都不用改（回滚时不留死代码）。

     选择器用 `#app > header` 而不是 `header`：站内还有 .page-hero 之类的
     <header> 元素，用 id 限定到 App.vue 里的那个固定顶栏，且 id 的特异性
     足以压过 AppHeader 自己的 `header.scrolled[data-v-*]`。

     长相直接沿用顶栏「已滚动」那套（同样的 rgba(255,255,255,.88) + blur），
     只把阴影加重一档 —— 人像墙比纯色背景「吵」得多，靠阴影把栏和墙分开。
     ========================================================================== -->
<style>
body.hero-wall-on #app > header {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  border-bottom-color: rgba(15, 23, 42, 0.06);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.06),
    0 8px 28px rgba(15, 23, 42, 0.14);
}

/* 把顶栏那条「掏空」，只留真正可点的元素（底纹态与激活态都放开）。
   横屏时这一条占视口 20%+（实测 844×390 是 22%），不放开的话整片墙在顶部那一带
   都收不到悬停。放开后有两个副作用，都在 JS 里挡掉了（见 onGridClick 与 clampCard）：
   点顶栏空白处不会误弹成员卡，悬停卡也不会钻到导航栏底下去。 */
body.hero-wall-present #app > header {
  pointer-events: none;
}
body.hero-wall-present #app > header a,
body.hero-wall-present #app > header button {
  pointer-events: auto;
}

/* ── 让 hero 在手机上至少占满一屏 ──
   ≤768px 时 .hero 是 min-height: auto（高度由内容撑）。实测：
     390×844 → hero 683px，底部露出 168px 的 About 区
     430×932 → hero 708px，露出 228px
     375×667 → hero 673px，不露（矮屏反而没问题）
   —— 就是「有的时候会露一点」的来源：屏幕越高露得越多。
   墙在场时把 hero 撑到一屏高，那条缝就没了。
   用 100vh（静态值 = 大视口）而不是 dvh：dvh 会随地址栏收放实时变，
   墙的 ResizeObserver 会跟着不停重算几何、漂移动画不停重启。
   100vh 在地址栏收放时盒子不动，墙一次都不用重排。
   放在这里（而不是 HomeView）是为了让这条规则随组件一起被删除。 */
@media (max-width: 768px) {
  body.hero-wall-present .hero {
    min-height: 100vh;
  }
}
</style>
