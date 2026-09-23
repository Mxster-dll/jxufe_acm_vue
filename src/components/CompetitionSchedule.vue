<script setup>
/**
 * 全年赛程时间轴（竞赛信息页，会长 2026-09-23）。
 * 一场赛事一行，行内按月份画出该赛事各阶段的区间（网络赛 / 邀请赛 / 区域赛 / 省赛 …）。
 * 同一行里区间会重叠（如 CCPC 5 月既有邀请赛又有省赛），故按泳道（lane）贪心排布，
 * 不重叠的区间共用一条泳道、重叠的自动下沉一行 —— 行高随泳道数增长。

 * 区间**不是官方日历**，而是本会历年真实赛历的统计结果，两类证据：
 *   ① public/data/awards/*.json 里我校获奖记录的日期 —— 跨年份取月份的实测最小~最大，
 *      剔除疫情等异常年（2020 天梯赛 11 月、2020 蓝桥杯省赛 7 月）；
 *   ② 工作区赛季目录名里的日期（`2024-09_XCPC网络预选赛`、`2025-09-07_XCPC网络赛`、
 *      `2025-05-18_南昌邀请赛`、`2025-05-25_CCPC东北邀请赛`）与 competitions.json
 *      「比赛时间」卡片的文案（如天梯赛「每年3-4月」、传智杯「每年11月和3-4月」）。
 * 没有证据的阶段不画（宁缺勿造）。要改赛程只改 competitions.json 的 schedule 字段。
 */
import { computed } from 'vue'

const props = defineProps({
  /** competitions.json 原样传入；只读 name / shortName / schedule */
  competitions: { type: Array, default: () => [] },
})

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

/** 当前月份（1-12）—— 用来高亮「现在处在一年中的哪一段」。
    坐标轴 12 格等宽（区间条的 left/width 都是按 12 个月算的百分比），所以当下这一列的
    位置就是 (月份-1)/12，宽度 1/12。跨年不影响：赛程表本身就是「一年之内」的视角。 */
const nowMonth = new Date().getMonth() + 1

/* 宽屏那条贯穿整列的高亮：放在「所有行的容器」里，左边让出名称列（--name-col）后 12 等分。
   早先是每行泳道里各放一条、靠 ±11px 溢出互相接上 —— 行首改成「图标在上、名字在下」后，
   行高由名称列（约 55px）决定、远高于 30px 的泳道，固定溢出量接不上（实测裂出 29px 缝）。
   放成一条就天然连续，且与行高无关。 */
const nowColLeft = `calc(var(--name-col) + (100% - var(--name-col)) * ${(nowMonth - 1) / 12})`
const nowColWidth = `calc((100% - var(--name-col)) / 12)`

/** 每行一种颜色。**一律引令牌**（会长 2026-09-23 审查：原先是令牌的字面复制，
    改令牌不会跟着变）。只有紫色没有对应令牌 —— 它是「第五种可区分的色相」，
    站点别处不用，就地保留字面值并在此说明，比为一个消费者新立令牌更省。 */
const PALETTE = [
  'var(--primary)',
  'var(--accent)',
  'var(--honor-honor)',
  'var(--honor-leader)',
  '#7c3aed',
  'var(--honor-grand)',
]

/** 同一赛事的每个阶段**各占一行**（会长 2026-09-23：「我希望仍在不同行，只是取消横线」）。
    早先是「月份重叠才下沉」的贪心泳道，而实际数据里一场赛事的各阶段月份并不重叠
    （邀请赛 4-7 月 / 网络预选赛 9 月 / 区域赛 10-12 月），于是三条都落在同一行。
    现在按 from 升序一条一行 —— 行数 = 阶段数；将来真出现月份重叠也天然分成两行。

    ⚠ 它**就地**给 bar 写 lane（模板按 bar.lane 算 top，见 :164），返回值是行数（喂给行高的
    `--lanes`）—— 别把这个数字当成「排好序的条」：bars 本身仍是调用方给的顺序。 */
function packBars(bars) {
  const sorted = [...bars].sort((a, b) => a.from - b.from)
  sorted.forEach((bar, i) => {
    bar.lane = i
  })
  return sorted.length
}

const rows = computed(() => {
  const list = props.competitions.filter((c) => (c.schedule || []).length)

  /* ① 合并分组（会长 2026-09-23「ICPC 和 CCPC 合并显示」）：competitions.json 里
        scheduleGroup 相同的赛事合成一行 —— 图标并排，阶段取并集
        （ICPC 区域赛 10-12 与 CCPC 区域赛 10-11 并成 10-12），悬停提示里标明区间来自谁。 */
  const groups = []
  for (const c of list) {
    const key = c.scheduleGroup || c.slug
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, name: c.scheduleGroup || c.shortName || c.name, logos: [], items: [] }
      groups.push(g)
    }
    if (c.image) g.logos.push(c.image)
    g.items.push(c)
  }

  return groups.map((g, i) => {
    const byStage = new Map()
    for (const c of g.items) {
      const src = c.shortName || c.name
      for (const s of c.schedule || []) {
        const cur = byStage.get(s.stage)
        if (!cur) byStage.set(s.stage, { stage: s.stage, from: s.from, to: s.to, srcs: [src] })
        else {
          cur.from = Math.min(cur.from, s.from)
          cur.to = Math.max(cur.to, s.to)
          if (!cur.srcs.includes(src)) cur.srcs.push(src)
        }
      }
    }
    const bars = [...byStage.values()].map((s) => ({
      stage: s.stage,
      note: s.srcs.length > 1 ? s.srcs.join(' / ') : '',
      range: s.from === s.to ? `${s.from}月` : `${s.from}-${s.to}月`,
      // from/to 也带上：窄屏的竖置时间线要按它算 top / height（宽屏用的是 left / width）
      from: s.from,
      to: s.to,
      left: ((s.from - 1) / 12) * 100,
      width: ((s.to - s.from + 1) / 12) * 100,
      lane: 0,
    }))
    return {
      slug: g.key,
      name: g.name,
      // 每行名前的图标（会长 2026-09-23）；合并行会有两个
      logos: g.logos,
      color: PALETTE[i % PALETTE.length],
      lanes: packBars(bars),
      bars,
    }
  })
})
</script>

<template>
  <section v-if="rows.length" class="schedule">
    <header class="schedule__head">
      <h2 class="schedule__label"><i class="fas fa-calendar-alt"></i> 全年赛程</h2>
      <p class="schedule__desc">各大赛事在一年中的开展区间，按月份排布</p>
    </header>

    <!-- 宽屏：月份坐标轴 + 每赛事一行区间条 -->
    <div class="schedule__chart">
      <div class="schedule__axis" aria-hidden="true">
        <span v-for="(m, i) in MONTHS" :key="m" :class="{ 'is-now': i + 1 === nowMonth }">{{ m }}</span>
      </div>
      <div class="schedule__body">
        <!-- 当前月份列：一条贯穿全部行的淡蓝底（只此一条 ⇒ 天然连续，与行高无关） -->
        <span class="schedule__now" :style="{ left: nowColLeft, width: nowColWidth }" aria-hidden="true"></span>
        <!-- 月份竖线：一条贯穿全部行（连行与行之间的留白一起），所以也放在行容器里 -->
        <span class="schedule__vlines" aria-hidden="true"></span>
        <div
          v-for="(row, idx) in rows"
          :key="row.slug"
          v-reveal="'fade-up'"
          class="schedule__row"
          :style="{ '--row-color': row.color, '--lanes': row.lanes, '--reveal-index': idx }"
        >
          <div class="schedule__name">
            <img
              v-for="(lg, i) in row.logos"
              :key="i"
              :src="lg"
              :alt="row.name"
              class="schedule__logo"
            />
            <span class="schedule__name-text">{{ row.name }}</span>
          </div>
          <div class="schedule__track">
            <span
              v-for="(bar, i) in row.bars"
              :key="i"
              class="schedule__bar"
              :style="{ left: `${bar.left}%`, width: `${bar.width}%`, top: `calc(${bar.lane} * 30px)` }"
              :title="`${row.name} · ${bar.stage}（${bar.range}）${bar.note ? ' —— ' + bar.note : ''}`"
              >{{ bar.stage }}</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- 窄屏：**竖排**月份轴（会长 2026-09-23 第四次要求：「移动端的竞赛时间卡片改成竖向的」）。
         横轴那版把 12 个月挤进 204px —— 每格 17px，「10月」都得砍成「10」；
         竖过来之后月份占 12 行（每行 26px），宽度让给「每个赛事一列」：
         阶段的区间就成了该列里一条纵向色块，一眼看出「谁在几月忙」。
         数据、配色与宽屏完全同源（都来自 rows 的 bars），只是行与列对调。 -->
    <div
      class="schedule__mv"
      :style="{ gridTemplateColumns: `40px repeat(${rows.length}, minmax(0, 1fr))` }"
    >
      <span class="schedule__mvcorner">月份</span>

      <p
        v-for="(row, ci) in rows"
        :key="row.slug"
        v-reveal="'fade-up'"
        class="schedule__mvhead"
        :style="{ gridRow: 1, gridColumn: ci + 2, '--reveal-index': ci, '--row-color': row.color }"
      >
        <img v-for="(lg, i) in row.logos" :key="i" :src="lg" :alt="row.name" class="schedule__logo" />
        <span class="schedule__mvhead-name">{{ row.name }}</span>
      </p>

      <!-- 当前月份那一行：横贯整行、与左边那格同色 —— 与宽屏那条「当前月份列」是一个意思 -->
      <span class="schedule__mvnow" :style="{ gridRow: nowMonth + 1 }" aria-hidden="true"></span>

      <span
        v-for="(m, i) in MONTHS"
        :key="m"
        class="schedule__mvmonth"
        :class="{ 'is-now': i + 1 === nowMonth }"
        :style="{ gridRow: i + 2 }"
        >{{ m }}</span
      >

      <!-- 每个阶段 = 一列里的一段纵向色块，跨 from..to 行（与宽屏那条横向区间条一一对应） -->
      <template v-for="(row, ci) in rows" :key="row.slug + '-bars'">
        <span
          v-for="(bar, i) in row.bars"
          :key="i"
          v-reveal="'fade-up'"
          class="schedule__mvbar"
          :style="{
            '--reveal-index': ci,
            '--row-color': row.color,
            gridRow: `${bar.from + 1} / span ${bar.to - bar.from + 1}`,
            gridColumn: ci + 2,
          }"
          :title="`${row.name} · ${bar.stage}（${bar.range}）${bar.note ? ' —— ' + bar.note : ''}`"
          >{{ bar.stage }}</span
        >
      </template>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   全年赛程时间轴
   ========================================================================== */
.schedule {
  margin-top: 56px;
  /* 与下方竞赛卡片拉开距离（会长 2026-09-23：原来挨得太近） */
  margin-bottom: 56px;
  /* 左侧「图标 + 赛事名」那一列的宽度：坐标轴的 margin-left 与每行的 flex-basis 共用它。
     会长 2026-09-23 定稿的排版是「图标在上、名字在下」，所以这一列不需要很宽 */
  --name-col: 132px;
}
.schedule__head {
  margin-bottom: 20px;
}
.schedule__label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
}
.schedule__label i {
  color: var(--primary);
  font-size: 1.1rem;
}
.schedule__desc {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

/* ── 宽屏图表 ── */
.schedule__chart {
  padding: 18px 20px 22px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.06);
}
.schedule__axis {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  margin-left: var(--name-col);
  padding-bottom: 0; /* 表头格与列高亮要接成一体（原来这 8px 会把两者切开） */
  /* 会长 2026-09-23：时间表只要**竖向**框线（月份的竖网格），不要横向框线 ——
     坐标轴的下框线与每行的行分隔线都已去掉，行与行只靠留白区分。 */
}
.schedule__axis span {
  padding: 4px 0; /* 上下各 4px ⇒ 表头格 26px，正好与列高亮同宽同高、上下贴合 */
  font-size: 0.72rem;
  color: var(--text-secondary);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
/* 入场动画：只把**速度**加快（会长 2026-09-23：「然后只是把速度加快」）。
   形态与之前完全一致 —— 仍是 fade-up（整行平移 40px）+ 淡入，缓动仍是 ease，
   级联延迟仍是 0.1s × idx，只有时长从全局 [data-reveal] 的 0.7s 缩到 0.4s
   （全站卡片实测就是这一档：transform 0.4s）。
   ⚠ 必须写成**长写**属性、不能用 `transition` 简写：简写会把 transition-delay 一并重置为 0s，
   而 scoped 选择器带 [data-v-*]、特异性 (0,2,0) 与全局那条
   [data-reveal][style*="--reveal-index"] 打平、又在 base.css 之后注入 →
   一旦用简写，5 行的先后顺序就没了（这个坑踩过一次）。
   长写不动 delay，所以全局提供的级联延迟照旧生效。 */
.schedule__row,
.schedule__mvhead,
.schedule__mvbar {
  transition-property: opacity, transform;
  transition-duration: 0.4s;
  transition-timing-function: ease;
}
.schedule__row {
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding: 10px 0;
}
.schedule__name {
  /* 图标在上、名字在下（会长 2026-09-23：格子够大，logo 放大、文字下移）。
     用 wrap + 文字的 flex-basis:100% 实现：xCPC 有两枚 logo 时它们**并排**站一行，
     名字仍被挤到下一行；若直接 flex-direction:column，两枚 logo 会上下叠起来把行撑高。 */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 6px;
  flex: 0 0 var(--name-col);
  width: var(--name-col);
  padding: 2px 10px 2px 0;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
  text-align: center;
  border-right: 1px solid rgba(15, 23, 42, 0.06);
}
.schedule__logo {
  flex: none;
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 4px;
}
/* 图表里的行首图标放大一档（窄屏清单仍是 20px，那里一行放不下更大的） */
.schedule__name .schedule__logo {
  width: 34px;
  height: 34px;
  border-radius: 6px;
}
.schedule__name-text {
  min-width: 0;
  flex-basis: 100%; /* 占满一整行 → 一定落在图标下方（而不是被挤到图标右边） */
}
.schedule__track {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  /* 12 个月等宽：区间条按 left/width 百分比落格。
     月份竖线**不在这里**画 —— 每行各画一份会被行间留白切断，改用贯穿全部行的
     .schedule__vlines（见下）。 */
  height: calc(var(--lanes) * 30px);
}
/* 月份竖线：一整条贯穿所有行（连行间留白一起），与「当前月份高亮」同属一列的视觉 */
.schedule__vlines {
  position: absolute;
  left: var(--name-col);
  right: 0;
  top: -26px; /* 向上正好够到月份刻度那一行的顶边（坐标轴高 26px） */
  bottom: -10px;
  z-index: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to right,
    rgba(15, 23, 42, 0.06) 0 1px,
    transparent 1px calc(100% / 12)
  );
}
.schedule__bar {
  position: absolute;
  height: 22px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--row-color);
  border-radius: var(--radius-full);
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.16);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.schedule__bar:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.22);
  z-index: 2;
}

/* ── 窄屏：**竖排**月份轴（会长 2026-09-23 第四次要求：「移动端的竞赛时间卡片改成竖向的」）──
   横轴版本把 12 个月压进 204px：每格 17px，「10月」都得砍成「10」，故事实上读不出月份。
   竖过来以后月份占 12 行（每行至少 26px，够写「10月」），宽度全留给「每个赛事一列」——
   阶段的区间就是该列里一段纵向色块，跨 from..to 行，与宽屏那条横向区间条一一对应。
   前四版（6 列窄柱状图 → 一场一竖条的时间线 → 横轴统一表）都在跟「手机没有宽度」较劲，
   这一版把稀缺的那个维度换成了行高。 */
.schedule__mv {
  display: none;
  /* 第一行是赛事表头，下面 12 行是月份；minmax(26px, auto) 让跨月的色块内容多时能撑开 */
  grid-template-rows: auto repeat(12, minmax(26px, auto));
  column-gap: 4px;
  padding: 12px 12px 14px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.06);
}
/* 角标占住月份那一列，表头才与下面的色块严格对齐（不用 margin 对齐，避免 1px 偏差） */
.schedule__mvcorner {
  grid-row: 1;
  grid-column: 1;
  display: flex;
  align-items: center;
  font-size: 0.625rem;
  color: var(--text-muted);
}
.schedule__mvhead {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  margin: 0 0 6px;
  text-align: center;
}
.schedule__mvhead .schedule__logo {
  width: 18px;
  height: 18px;
  border-radius: 4px;
}
.schedule__mvhead-name {
  font-size: 0.625rem; /* 10px —— 列宽约 46px，「百度之星」四个字刚好一行 */
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
/* 当前月份那一行：横贯整行（含月份格），与宽屏那条列高亮同色、同一个意思 */
.schedule__mvnow {
  grid-column: 1 / -1;
  z-index: 0;
  background: rgba(26, 115, 232, 0.09);
  pointer-events: none;
}
.schedule__mvmonth {
  /* 列必须**显式**写成 1：当前月那一行被 .schedule__mvnow（grid-column: 1 / -1）整行占满，
     若这里只给 gridRow、列交给自动放置，算法在本行找不到任何空列，就会给它开一个
     **隐式列**放在表格右端之外 —— 会长看到的「高亮行的表头跑到右端」就是这个
     （实测 390px：其余 11 个标签 left=45，当前月那个 left=330，落在高亮带 45~326 之外，
      并且隐式列还从 1fr 的列宽里抠走了约 16px）。 */
  grid-column: 1;
  /* 月份格要压在色带之上（静态元素的背景/文字会被定位元素盖住） */
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  font-size: 0.625rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  border-top: 1px solid rgba(15, 23, 42, 0.05);
}
.schedule__mvmonth.is-now {
  color: var(--primary);
  font-weight: 700;
}
/* 区间色块：列里的一段，底色是该赛事的行色（与宽屏区间条同色） */
.schedule__mvbar {
  position: relative;
  z-index: 1;
  margin: 2px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  border-radius: 6px;
  background: var(--row-color);
  color: #fff;
  font-size: 0.625rem; /* 10px：列宽约 46px，「校内选拔赛」折两行正好装下 */
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  overflow: hidden;
}

@media (max-width: 768px) {
  .schedule {
    margin-top: 40px;
    margin-bottom: 40px;
  }
  .schedule__chart {
    display: none;
  }
  .schedule__mv {
    display: grid;
  }
}
/* ── 当前月份列（会长 2026-09-23：「把当前月份列高亮」＋「表头的高亮应与此列的高亮是一体的」）──
   表头格（.schedule__axis span.is-now，26px）与这一条合起来是**一块**连续的列高亮：
   表头用同一档底色、只在上面两角倒圆，这一条从坐标轴下沿一路铺到底，
   两者同宽（都是 1/12）且上下贴合，中间不留缝、也不叠色。 */
.schedule__body {
  position: relative;
  padding-top: 8px; /* 表头与第一行之间的留白（原先是坐标轴的 padding-bottom） */
}
.schedule__now {
  position: absolute;
  top: 0; /* 定位基准是 padding box ⇒ 0 就是紧贴坐标轴下沿 */
  bottom: -10px;
  z-index: 0;
  background: rgba(26, 115, 232, 0.09);
  pointer-events: none;
}
/* 表头也点亮：同一档底色 + 只倒上面两角 ⇒ 与下面那条拼成完整的一列 */
.schedule__axis span.is-now {
  color: var(--primary);
  font-weight: 700;
  background: rgba(26, 115, 232, 0.09);
  border-radius: 4px 4px 0 0;
}
</style>
