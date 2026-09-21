<script setup>
/**
 * AvatarMosaic —— 头像墙背景层（可交互版）
 *
 * 把群成员的头像铺成一面「一直朝同一个方向慢慢走的墙」，作为页面底纹。
 * 角色相当于 Fluent 的 Mica：Mica 是取桌面壁纸着色后垫在窗口最底层，
 * 这里是取协会成员的头像垫在页面最底层 —— 同样的「长驻、低对比、不抢内容」定位。
 *
 * ## 为什么是「一张环面 + 两条锯齿」
 * 以前是 `alternate`（一来一回），位移刚好一个瓷砖边长，到头顶回来。要改成**一直往一个方向**
 * 就必须解决「走完一轮怎么接回去」：直接跳回起点会让整面墙的人脸瞬间换掉。
 * 干净的解法是让画面**周期重复**：把墙铺成一张环面 —— 第 (r, c) 格取
 * `list[((r % Py) × Px + (c % Px)) % n]`（横向周期 Px 列、纵向周期 Py 行）。
 *
 * 但环面的周期是**轴对齐**的。早先的写法是让整面墙当刚体、沿一个**格点向量**
 * `(mx×Px, my×Py)` 平移 —— 那样确实无缝，可方向只能是横、竖和四个斜向（有理斜率，
 * 本站约 ±31°），走不出 17° 这种角度。要任意角度，就不能让两个轴绑在一起走：
 * 把它们**拆开**，各自在自己的轴上走一整个周期（0 → ±Px·step、0 → ±Py·step），
 * 时长各 = 自己的周期 ÷ 自己轴上的速度。任一轴走到头时，画面正好平移了自己一整个周期，
 * 逐像素与起点相同（这就是环面的定义），所以那一次「跳回去」看不见；两个轴各跳各的，
 * 合起来就是一条**任意角度的匀速直线**。
 *   - 前提是瓷砖边界本身不可见 —— 我们是无缝墙（gap 0、无边框、无圆角），跳到哪都一样。
 *     哪天有人把 gap 调大或给瓷砖加圆角，这套「两轴各跳各的」就会开始露馅。
 *   - 实现上两条动画必须落在**两个不同的属性**上（横向 `translate`、纵向 `transform`），
 *     否则同一个元素上的两条 transform 动画会互相覆盖。
 *   - 周期内要**装得下全部成员**（Px × Py ≥ n），否则会有人永远不出现；
 *   - 周期取**不小于视口**（Px ≥ 可见列数、Py ≥ 可见行数）—— 视口里看不到重复图案，
 *     每个人都只出现一次；网格 = 视口 + 一个周期，DOM 因此约是纯视口时的 4 倍（本站约 680 格）。
 *
 * ## 其余刻意的取舍
 *  - `position: fixed` 而不是 absolute：内容是滚动的，底纹不跟着滚（Mica 就是这样），
 *    这样整页始终有一层稳定的质感，而不是越往下越稀。
 *  - 墙面顺序每次刷新**打乱**（带种子的 LCG，见 wallList）；漂移方向也是每次随机 ——
 *    但「谁在第几格」在同一次渲染里是确定的，所以截图仍可复现。
 *  - 顶部一条 mask 渐隐：页头与标题直接落在底纹上，是最需要干净背景的区域。
 *  - 默认 `gap: 0`（无缝）：头像之间不留缝、瓷砖也不带圆角，整屏拼成**一面**墙。
 *  - 这里**故意不加** filter: blur()。模糊是「遮罩那层材料」的属性，不是墙自己的属性。
 *  - 传 `interactive` 之后，铺墙用的那一格本身可交互：悬停从格子里长出一张卡
 *    （左边圆框头像，右边姓名 / 竞赛荣誉）。不悬停时它只是墙的一块砖。
 *  - 传 `hires` 之后改用 640 原图（2× 屏上 124px 的格子要 248 个物理像素，缩略图会被拉软）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useJson } from '../composables/useJson'
import { loadHonorPills } from '../utils/honorPills'
import { HONOR_TYPE_LABELS, normalizeHonors } from '../utils/honorType'

const props = defineProps({
  /** 整体不透明度。首页本身已有滚动代码背景 + 浮动形状，取值要比优秀成员页低 */
  opacity: { type: Number, default: 0.14 },
  /** 期望的瓷砖边长（px，会被 4px 网格对齐；只在节点数超预算时才会自动放大） */
  tile: { type: Number, default: 112 },
  /** 瓷砖间距（px，4 的倍数）。0 = 无缝，头像直接拼成一面整墙 */
  gap: { type: Number, default: 0 },
  /** 漂移速度（px/秒）。屏幕速度恒定、与方向无关（斜着走也不会变快） */
  speed: { type: Number, default: 4 },
  /** 顶部渐隐到全不透明的位置（视口高度的百分比） */
  topFade: { type: Number, default: 46 },
  /** 单个网格允许的最大格数。这是节点数上的偏好（最软的一条约束）：
      135 人、1440×900 时约 680 格（视口本身约 170 格，网格 = 视口 + 一个周期） */
  blockBudget: { type: Number, default: 700 },
  /** 墙面本身可交互（悬停长出一张「圆框头像 + 右侧荣誉」的卡）。需要额外加载荣誉数据 */
  interactive: { type: Boolean, default: false },
  /** 用 640 原图铺墙（而不是 160 缩略图）。整墙约 4.9 MB，切换时才开始下载 */
  hires: { type: Boolean, default: false },
})

const { data } = useJson('/data/group_members.json', { initial: null })
const members = computed(() => data.value?.members || [])

/** 墙面顺序：每次刷新打乱一次（会长要求）。
    名单本身是有序的 —— 群主、管理员、成员，末尾还追加了 25 位优秀成员 ——
    而环面是按顺序取人的，不打乱的话索引 110~134 会连成一整段，
    于是那 25 张优秀成员的脸永远挤在墙上同一片地方。
    用**带种子的**伪随机（LCG）而不是 Math.random()：computed 会被反复求值，
    直接用 Math.random() 每求值一次就重排一次，动画会跟着乱跳；种子只在挂载时取一次。 */
const shuffleSeed = ref(Math.floor(Math.random() * 0x7fffffff) || 1)
const wallList = computed(() => {
  const list = [...members.value]
  let s = shuffleSeed.value
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = list[i]
    list[i] = list[j]
    list[j] = t
  }
  return list
})

/** 荣誉只在可交互时才加载 —— 纯背景用不着它，别让首页白读一堆赛事数据。
    三个来源合成一张表，口径与优秀成员页 / 负责人页的卡完全一致：
      1) 比赛战绩胶囊（utils/honorPills.js，站点竞赛数据自动汇总）
      2) 优秀成员页手写的那些（members.json 的 honors[].text，胶囊表达不了的名次类条目）
      3) 协会负责人页手写的那些（leaders.json 的 achievements[].text）
    注意 2) 与 3) 的**字段名不一样**（photo/honors 对 avatar/achievements），
    这是站点既有数据；两份都过同一个 normalizeHonors，颜色才不会两边不一致。
    关联键是真名，来源是「群成员真名对照表.csv」；没填的人不显示任何荣誉 ——
    不写「暂无获奖记录」，那是对数据说谎。 */
const pills = ref(new Map())
const manualHonors = ref(new Map())
onMounted(async () => {
  if (!props.interactive) return
  pills.value = await loadHonorPills()
  /** 同一个人可能同时出现在两份名单里（既是优秀成员又是负责人）→ 合并而不是覆盖，
      各条按 text 去重，顺序是「先优秀成员、后负责人」。 */
  const push = (map, name, list) => {
    const key = (name || '').trim()
    if (!key || !list.length) return
    const cur = map.get(key) || []
    const seen = new Set(cur.map((h) => h.text))
    map.set(key, [...cur, ...list.filter((h) => !seen.has(h.text))])
  }
  const getJson = (url) => fetch(url).then((r) => r.json()).catch(() => [])
  try {
    const [excellent, leaders] = await Promise.all([
      getJson('/data/members.json'),
      getJson('/data/leaders.json'),
    ])
    const m = new Map()
    // 用与两个页面**同一个**分类器（utils/honorType.js），胶囊的颜色才不会两边不一致
    for (const p of excellent || []) push(m, p.name, normalizeHonors(p.honors))
    for (const l of leaders || []) push(m, l.name, normalizeHonors(l.achievements))
    manualHonors.value = m
  } catch {
    /* 手写荣誉拿不到就只显示比赛战绩，不影响墙本身 */
  }
})

/** 群昵称里实测混着整串不可见字符（零宽连接符 U+200D、韩文填充符 U+3164×4、
    以及两个未分配的 U+E0000），直接渲染会得到一条没有名字的浮条。
    按 Unicode 大类别 C*（含未分配的 Cn）删净，另加「类别正常却渲染为空白」的那几个；
    删完为空就退回「成员 <QQ号>」—— 宁可显示 QQ，也不显示一片空白。 */
const BLANK_RE = /[\p{C}\u2800\u3164\uffa0\u115f\u1160\u180e\ufe00-\ufe0f]/gu
/** 显示哪个名字：填了真名就用真名（与优秀成员页口径一致），没填才用清洗过的群昵称。
    真名来自「群成员真名对照表.csv」，同时它也是荣誉关联的键 —— 同一份数据，两处共用。 */
const nameOf = (m) => {
  const real = (m.realName || '').trim()
  if (real) return real
  return (m.name || '').replace(BLANK_RE, '').trim() || `成员 ${m.qq}`
}
/** 荣誉 = 自动汇总的比赛战绩 + 优秀成员页手写的条目（顺序与优秀成员页一致）。
    每条都带上要用的类名，**分色与优秀成员页同一套**：
      · 自动那批是「整条汇总」的统计串 → honor-tag--contest + honor-tag--stat（与优秀成员页一字不差）；
      · 手写条目各带自己的类型（比赛 / 去向 / 荣誉 / 联系 / 更多），由 normalizeHonors 判定。
    类样式在 styles/honors.css，是全局表 —— 组件里直接用，不必也不该复制一份配色。
    去重是防御性的：将来若把某条手写条目也纳入了自动汇总，不至于在同一张卡上出现两次。 */
const honorsOf = (m) => {
  const name = (m.realName || '').trim()
  if (!name) return []
  const out = (pills.value.get(name) || []).map((text) => ({
    text,
    cls: 'honor-tag--contest honor-tag--stat',
    title: '比赛战绩，由站点竞赛数据自动汇总',
  }))
  const seen = new Set(out.map((p) => p.text))
  for (const h of manualHonors.value.get(name) || []) {
    if (!h.text || seen.has(h.text)) continue
    out.push({ text: h.text, cls: `honor-tag--${h.type}`, title: HONOR_TYPE_LABELS[h.type] })
  }
  return out
}

/* ── 视口尺寸 ── */
const vw = ref(0)
const vh = ref(0)
const measure = () => {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
}
onMounted(() => {
  measure()
  window.addEventListener('resize', measure, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))

/* ── 漂移方向：任意角度 ──
   每次启动在 [0, 2π) 上均匀取一个角度。要做到任意角度，就不能让两个轴绑在一起走
   （沿格点向量平移只能得到有理斜率），而是**两个轴各自走自己的整个周期**：
   横向 0 → ±Px·step、纵向 0 → ±Py·step，各自 linear infinite。
   任一轴走到头时画面正好平移了自己一个周期 → 逐像素不变 → 那次跳回看不见。
   于是合起来的观感就是一条任意角度的匀速直线，速度恒为 speed（=|(vx,vy)|）。 */
const angle = ref(Math.random() * Math.PI * 2)
/** 一个轴慢到这个速度以下就当它不动 —— 否则时长会算出 Infinity，
    CSS 会把 Infinity 当成 0s，那会让整面墙每一帧跳一次周期。 */
const MIN_AXIS_SPEED = 0.02

const drift = computed(() => {
  const vx = Math.cos(angle.value) * props.speed
  const vy = Math.sin(angle.value) * props.speed
  const px = geom.value.px * step.value // 横向周期（px）
  const py = geom.value.py * step.value // 纵向周期（px）
  return {
    vx,
    vy,
    // 位移 = ±一整个周期。Math.sign(0) === 0 → 速度为 0 的那个轴位移干脆为 0
    dx: Math.sign(vx) * px,
    dy: Math.sign(vy) * py,
    xDur: px / Math.max(Math.abs(vx), MIN_AXIS_SPEED),
    yDur: py / Math.max(Math.abs(vy), MIN_AXIS_SPEED),
    deg: (angle.value * 180) / Math.PI,
  }
})
/** 网格起点：位移取正的那一侧要往反方向让出一个周期，保证走到头也不露白边 */
const gridX = computed(() => -Math.max(0, drift.value.dx))
const gridY = computed(() => -Math.max(0, drift.value.dy))

/* ── 环面周期 (Px, Py) ──
   两条约束：
     · 装得下所有人（Px × Py ≥ n）—— 周期是取人的唯一范围，小了就有人永远不出现；
     · 周期**不小于视口**（Px ≥ 完整可见的列数、Py ≥ 行数）—— 于是视口里看不到重复图案，
       每个人都只出现一次。周期越小网格越小，所以这条同时也是「最省节点」的取法。
   在满足这两条的前提下取**网格总格数最小**的那组；网格还要按位移多铺一整个周期，
   那部分是这套设计避不开的代价（约等于视口格数的 4 倍）。 */
const periodFor = (n, cols0, rows0) => {
  let best = null
  for (let px = cols0; px <= n; px++) {
    const py = Math.max(rows0, Math.ceil(n / px))
    const cells = (cols0 + px) * (rows0 + py)
    if (!best || cells < best.cells) best = { px, py, cells }
  }
  return best || { px: cols0, py: rows0 }
}

/* ── 一格的大小 ──
   4px 网格上取离期望边长最近的那个；只有当格数进不了预算时才往上放大。 */
const geom = computed(() => {
  const n = wallList.value.length || 110
  const base = Math.max(4, Math.round(props.tile / 4) * 4)
  if (!vw.value || !vh.value) return { s: base, px: 1, py: 1, cols: 1, rows: 1 }
  let best = null
  let lax = null
  for (let s = 40; s <= 240; s += 4) {
    const cols0 = Math.ceil(vw.value / s)
    const rows0 = Math.ceil(vh.value / s)
    const p = periodFor(n, cols0, rows0)
    const cand = { s, px: p.px, py: p.py, cols: cols0 + p.px, rows: rows0 + p.py }
    cand.cells = cand.cols * cand.rows
    if (!lax || Math.abs(s - base) < Math.abs(lax.s - base)) lax = cand
    if (cand.cells > props.blockBudget) continue
    if (!best || Math.abs(s - base) < Math.abs(best.s - base)) best = cand
  }
  if (best) return best
  if (lax) return lax
  return {
    s: base,
    px: 1,
    py: 1,
    cols: Math.ceil(vw.value / base) + 1,
    rows: Math.ceil(vh.value / base) + 1,
  }
})

const step = computed(() => geom.value.s)
const gridCols = computed(() => geom.value.cols)
const gridRows = computed(() => geom.value.rows)

/** 平铺序列：在环面上取人，一个周期内正好覆盖全部成员（顺序是打过乱的） */
const tiles = computed(() => {
  const list = wallList.value
  const n = list.length
  const { px, py } = geom.value
  const out = []
  if (!n || !gridCols.value || !gridRows.value) return out
  for (let r = 0; r < gridRows.value; r++) {
    const rr = r % py
    for (let c = 0; c < gridCols.value; c++) {
      out.push(list[(rr * px + (c % px)) % n])
    }
  }
  return out
})

</script>

<template>
  <div
    v-if="tiles.length"
    class="mosaic"
    :class="{ 'mosaic--interactive': interactive }"
    aria-hidden="true"
    :style="{
      '--mosaic-opacity': opacity,
      '--tile': step - gap + 'px',
      '--gap': gap + 'px',
      '--step': step + 'px',
      '--cols': gridCols,
      '--rows': gridRows,
      /* 环面周期也写出来：CSS 不用，但调试/探针要靠它还原「谁在第几格」 */
      '--px': geom.px,
      '--py': geom.py,
      /* 两轴各自的位移（±一整个周期）+ 网格起点 */
      '--drift-x': drift.dx + 'px',
      '--drift-y': drift.dy + 'px',
      '--drift-x-dur': drift.xDur + 's',
      '--drift-y-dur': drift.yDur + 's',
      '--grid-x': gridX + 'px',
      '--grid-y': gridY + 'px',
      /* 方向与两轴速度（px/s，带符号）：CSS 不消费，只给调试与注入式探针读 */
      '--drift-vx': drift.vx,
      '--drift-vy': drift.vy,
      '--drift-angle': drift.deg,
      '--mask-fade': topFade + '%',
      /* 无缝（gap 为 0）时瓷砖不能再带圆角，否则四角露出的底色会连成一片菱形暗缝 */
      '--tile-radius': gap > 0 ? 'var(--fluent-radius-control)' : '0px',
      /* 悬停卡片的尺寸（比格子大得多，所以要能探出格子外） */
      '--card-w': '360px',
      '--avatar': '96px',
    }"
  >
    <div class="mosaic__grid">
      <div
        v-for="(m, i) in tiles"
        :key="i"
        class="mosaic__tile"
        :class="{ 'mosaic__tile--blank': m.blank, 'mosaic__tile--initial': !m.thumb }"
      >
        <img
          v-if="m.thumb"
          class="mosaic__img"
          :src="m.thumb"
          alt=""
          loading="eager"
          decoding="async"
          fetchpriority="low"
        />
        <!-- 没有照片的（例如将来新加的优秀成员还没拍照）：这一格铺一个姓氏字，
             而不是留一个空方格 —— 空格子在整面墙里比一个字更扎眼。 -->
        <span v-else class="mosaic__initial">{{ m.initial }}</span>
        <!-- 高清层：叠在缩略图上面，加载完才淡入。
             直接改 src 的话，整面墙会先白一下（换 src 会立刻清掉当前图像）。 -->
        <img
          v-if="hires && m.photo"
          class="mosaic__img mosaic__img--hires"
          :src="m.photo"
          alt=""
          decoding="async"
          @load="$event.target.classList.add('is-ready')"
        />

        <!-- 悬停才「长」出来的卡：左圆框头像，右侧姓名 / 职务 / 荣誉。
             不悬停时整格就是墙的一块砖，没有边框、没有圆角、跟邻居严丝合缝。
             群身份（群主 / 管理员 / 群成员）不显示 —— 106/110 是「群成员」，纯噪音；
             只有协会负责人多一行职务（「2026届会长」），那是他们真正的年份标识。
             透明头像（群主）走 --blank：白色圆、白色方砖，飞入动画就是「白矩形变白圆」。 -->
        <div v-if="interactive" class="mosaic__card">
          <div
            class="mosaic__avatar"
            :class="{ 'mosaic__avatar--blank': m.blank, 'mosaic__avatar--initial': !m.thumb }"
          >
            <img v-if="m.thumb" :src="hires && m.photo ? m.photo : m.thumb" alt="" loading="lazy" decoding="async" />
            <span v-else class="mosaic__initial mosaic__initial--card">{{ m.initial }}</span>
          </div>
          <div class="mosaic__info">
            <p class="mosaic__name">{{ nameOf(m) }}</p>
            <p v-if="m.title" class="mosaic__title">{{ m.title }}</p>
            <div v-if="honorsOf(m).length" class="mosaic__honors">
              <span
                v-for="(p, j) in honorsOf(m)"
                :key="j"
                class="honor-tag"
                :class="p.cls"
                :title="p.title"
                >{{ p.text }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mosaic {
  position: fixed;
  inset: 0;
  z-index: var(--fluent-z-backdrop);
  overflow: hidden;
  pointer-events: none;
  /* 不透明度**不能挂在这一层**上：悬停那张卡也是它的后代，挂这儿卡片就跟着半透明，
     底下墙上的头像会从字缝里透出来（会长看到的「卡片不透明」就是这条）。
     改成挂在墙的图与字上，卡片自己保持 100% 不透明。 */
  /* 这里**故意不加** filter: blur()。模糊是「遮罩那层材料」的属性，不是墙自己的属性：
     挂在墙上就等于永远糊着，遮罩走了也糊。改用遮罩的 backdrop-filter —— 遮罩滚到哪
     模糊到哪，它一走，留下的就是一面清晰的头像墙（见 ExcellentView 的 .members-scrim）。 */
  /* 顶部渐隐：页头与页标题直接落在底纹上，那一片最需要干净 */
  mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.4) calc(var(--mask-fade) * 0.3),
    rgba(0, 0, 0, 1) var(--mask-fade),
    rgba(0, 0, 0, 1) 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.4) calc(var(--mask-fade) * 0.3),
    rgba(0, 0, 0, 1) var(--mask-fade),
    rgba(0, 0, 0, 1) 100%
  );
  /* 绘制隔离：底纹的合成不参与页面布局与重绘传播 */
  contain: layout paint style;
}

/* 网格在环面上铺开，尺寸就是 cols × rows 格；位移取正的那一侧要往反方向让出一个周期
   （--grid-x / --grid-y），保证从 0 走到一趟终点这段时间里视口始终被盖满。 */
.mosaic__grid {
  position: absolute;
  left: var(--grid-x);
  top: var(--grid-y);
  width: calc(var(--cols) * var(--tile));
  height: calc(var(--rows) * var(--tile));
  display: grid;
  grid-template-columns: repeat(var(--cols), var(--tile));
  grid-template-rows: repeat(var(--rows), var(--tile));
  gap: var(--gap);
  /* 两个轴各走自己的一个周期（见文件头）：横向 0 → ±Px·step、纵向 0 → ±Py·step，
     各自 linear infinite。任一轴走到头时画面正好平移了自己一个周期 → 逐像素不变 →
     那次跳回看不见。两轴各跳各的，合起来就是任意角度的匀速直线。
     两条动画必须落在**两个不同的属性**上：横向用独立属性 translate、纵向用 transform，
     否则同元素上的两条 transform 动画会互相覆盖（后一条赢）。
     位移带符号，所以不需要 animation-direction。 */
  animation:
    mosaic-drift-x var(--drift-x-dur) linear infinite,
    mosaic-drift-y var(--drift-y-dur) linear infinite;
  will-change: transform, translate;
}

@keyframes mosaic-drift-x {
  from {
    translate: 0 0;
  }
  to {
    translate: var(--drift-x) 0;
  }
}

@keyframes mosaic-drift-y {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(0, var(--drift-y), 0);
  }
}

/* overflow 必须是 visible：悬停那张卡比格子大得多，要能探到格子外面去。
   图片本身铺得跟格子一样大，不需要裁剪，圆角靠 inherit 传下去即可。 */
.mosaic__tile {
  position: relative;
  width: var(--tile);
  height: var(--tile);
  overflow: visible;
  background: var(--subtle-fill-color-secondary);
  border-radius: var(--tile-radius);
}
/* 透明头像（群主）：砖是白的，飞出去那块也是白的 —— 会长指定的「白矩形变白圆」 */
.mosaic__tile--blank {
  background: var(--bg);
}
.mosaic__img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  opacity: var(--mosaic-opacity);
}
.mosaic__img--hires {
  opacity: 0;
  transition: opacity var(--fluent-duration-slow) var(--fluent-ease-standard);
}
.mosaic__img--hires.is-ready {
  opacity: var(--mosaic-opacity);
}

/* 没有照片的砖：铺一个姓氏字 */
.mosaic__tile--initial {
  display: flex;
  align-items: center;
  justify-content: center;
}
.mosaic__initial {
  font-size: calc(var(--tile) * 0.42);
  font-weight: var(--fluent-weight-semibold);
  line-height: 1;
  color: var(--text-fill-color-tertiary);
  opacity: var(--mosaic-opacity);
  user-select: none;
}
.mosaic__initial--card {
  font-size: calc(var(--avatar) * 0.4);
  color: var(--primary);
  opacity: 1;
}

/* ── 可交互版 ── */
.mosaic--interactive .mosaic__tile {
  pointer-events: auto;
}
.mosaic--interactive .mosaic__tile:hover {
  z-index: 5;
}

/* 悬停长出来的那张卡：以格子中心为锚，比格子大得多。
   左圆框头像（与优秀成员页同一个做法：渐变环 + 白描边），右侧姓名 / 荣誉。 */
.mosaic__card {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: var(--fluent-space-md);
  width: var(--card-w);
  padding: var(--fluent-space-md);
  /* 不透明：卡片压在墙上，半透明会让底下的头像从字缝里透出来，读不清（会长指定）。
     代价是不能再叫 Acrylic —— 不透明层做背景模糊没有意义，索性不再叠模糊。 */
  background: var(--solid-background-fill-color-base);
  border: 1px solid var(--card-stroke-color-default);
  border-radius: var(--fluent-radius-overlay);
  box-shadow: var(--fluent-shadow-dialog);
  text-align: left;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.88);
  transition:
    opacity var(--fluent-duration-normal) var(--fluent-ease-decelerate),
    transform var(--fluent-duration-normal) var(--fluent-ease-decelerate);

  /* 头像的起飞点（会长指定：从背景里它原来那块格子的位置飞进框里）。
     卡片正好以格子中心为锚 → 卡片中心 == 原格子中心。
     头像自然位置在卡片左侧，其中心距卡片中心 = 卡片半宽 − 内边距 − 头像半宽；
     于是「向右挪这么多 + 放大到格子尺寸」正好盖回原格子上，归零即飞到位。
     父级那层 scale 不影响落点：缩放是绕卡片中心（= 原点）做的，原点缩完还是原点。 */
  --avatar-from-x: calc(var(--card-w) / 2 - var(--fluent-space-md) - var(--avatar) / 2);
  --avatar-from-scale: calc(var(--tile) / var(--avatar));
}
.mosaic--interactive .mosaic__tile:hover .mosaic__card {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

/* 静止时头像停在「原格子」那儿（卡片本身就悬在格子上，所以看起来就是那块砖），
   悬停时卡片浮现、头像同时飞进左侧圆框 —— 时长比卡片长一档，落点才看得清。 */
.mosaic__avatar {
  flex: none;
  width: var(--avatar);
  height: var(--avatar);
  padding: 3px;
  border-radius: 50%;
  background: var(--gradient-primary);
  transform: translateX(var(--avatar-from-x)) scale(var(--avatar-from-scale));
  transition:
    transform var(--fluent-duration-slow) var(--fluent-ease-decelerate),
    border-radius var(--fluent-duration-slow) var(--fluent-ease-decelerate);
}
.mosaic--interactive .mosaic__tile:hover .mosaic__avatar {
  transform: translateX(0) scale(1);
}

/* 透明头像：卡片里显示成白色，而不是那圈蓝色渐变（会长指定）。
   起飞时它跟砖一样是方的（圆角取自 --tile-radius），归位时才收成圆 ——
   于是整段动画读起来就是「一个白色矩形变成白色圆形并移动」。 */
.mosaic__avatar--blank {
  background: var(--bg);
  border-radius: var(--tile-radius);
}
/* 选择器要带上 .mosaic__avatar 才压得过后面那条基础规则（同优先级时后者胜）——
   实测漏写这一层，透明头像里层仍留着一圈 rgba(0,0,0,.037) 的灰。 */
.mosaic__avatar.mosaic__avatar--blank img {
  background: var(--bg);
}
.mosaic--interactive .mosaic__tile:hover .mosaic__avatar--blank {
  border-radius: 50%;
}
.mosaic__avatar--initial {
  display: flex;
  align-items: center;
  justify-content: center;
}
.mosaic__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid var(--bg);
  background: var(--subtle-fill-color-secondary);
}

.mosaic__info {
  min-width: 0;
}
.mosaic__name {
  font-size: var(--fluent-type-body-large);
  font-weight: var(--fluent-weight-semibold);
  line-height: 1.3;
  color: var(--text-fill-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 只有协会负责人有这一行（「2026届会长」，来自 build_site_assets.py 写入的 title）。
   尺寸是 Fluent 的 caption 档，颜色退到次级 —— 名字仍是卡片的视觉重点。 */
.mosaic__title {
  margin-top: var(--fluent-space-xs);
  font-size: var(--fluent-type-caption);
  line-height: 1.4;
  color: var(--text-fill-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mosaic__honors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--fluent-space-xs);
  margin-top: var(--fluent-space-sm);
}
/* 配色用全局的 .honor-tag（styles/honors.css），与优秀成员页、负责人页一字不差；
   只在卡片里把尺寸压回紧凑版 —— 优秀成员页那张卡宽 380px、只有文字，
   这里要和 96px 圆框并排，同样的内边距会让 7 枚胶囊把卡撑到 262px 高（实测）。 */
.mosaic__honors .honor-tag {
  padding: 1px 8px;
}

@media (max-width: 576px) {
  .mosaic__card {
    transform: translate(-50%, -50%) scale(0.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mosaic__grid {
    animation: none;
  }
}
</style>
