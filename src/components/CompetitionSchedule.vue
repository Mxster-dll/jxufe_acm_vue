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
const nowLeft = `${((nowMonth - 1) / 12) * 100}%`
const nowWidth = `${100 / 12}%`

/* 宽屏那条贯穿整列的高亮：放在「所有行的容器」里，左边让出名称列（--name-col）后 12 等分。
   早先是每行泳道里各放一条、靠 ±11px 溢出互相接上 —— 行首改成「图标在上、名字在下」后，
   行高由名称列（约 55px）决定、远高于 30px 的泳道，固定溢出量接不上（实测裂出 29px 缝）。
   放成一条就天然连续，且与行高无关。 */
const nowColLeft = `calc(var(--name-col) + (100% - var(--name-col)) * ${(nowMonth - 1) / 12})`
const nowColWidth = `calc((100% - var(--name-col)) / 12)`

/** 每行一种颜色；取站点既有的调色板（主色 / 强调色 / 荣誉绿 / 会长金 / 紫 / 特等红），不新造色 */
const PALETTE = ['#1a73e8', '#ff9800', '#2e7d32', '#a16207', '#7c3aed', '#c62828']

/** 同一赛事的每个阶段**各占一行**（会长 2026-09-23：「我希望仍在不同行，只是取消横线」）。
    早先是「月份重叠才下沉」的贪心泳道，而实际数据里一场赛事的各阶段月份并不重叠
    （邀请赛 4-7 月 / 网络预选赛 9 月 / 区域赛 10-12 月），于是三条都落在同一行。
    现在按 from 升序一条一行 —— 行数 = 阶段数；将来真出现月份重叠也天然分成两行。 */
function packLanes(bars) {
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
    const froms = bars.map((b) => b.from)
    const tos = bars.map((b) => b.to)
    const spanFrom = froms.length ? Math.min(...froms) : 0
    const spanTo = tos.length ? Math.max(...tos) : 0
    return {
      slug: g.key,
      name: g.name,
      // 每行名前的图标（会长 2026-09-23）；合并行会有两个
      logos: g.logos,
      color: PALETTE[i % PALETTE.length],
      lanes: packLanes(bars),
      bars,
      // 窄屏清单右上角的区间概览：「3–6月」/「9月」
      spanText: spanFrom ? (spanFrom === spanTo ? `${spanFrom}月` : `${spanFrom}–${spanTo}月`) : '',
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
          v-for="row in rows"
          :key="row.slug"
          class="schedule__row"
          :style="{ '--row-color': row.color, '--lanes': row.lanes }"
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

    <!-- 窄屏：Fluent 风格的竖置时间线清单（会长 2026-09-23 要求重新设计）——
         一场赛事一条：左边是一条 2px 的竖直时间条、阶段处落一个圆点，右边是「月份 + 阶段名」。
         原先的 6 列窄柱状图在手机宽度下每列只剩 40 多像素，字号被迫压到 9.6px、阶段名要折两三行，
         读不出来；这里改用 Fluent 的 4px 栅格与 ≥12px 字号重排。 -->
    <ul class="schedule__mlist">
      <li
        v-for="row in rows"
        :key="row.slug"
        class="schedule__mitem"
        :style="{ '--row-color': row.color }"
      >
        <p class="schedule__mhead">
          <img
            v-for="(lg, i) in row.logos"
            :key="i"
            :src="lg"
            :alt="row.name"
            class="schedule__logo"
          />
          <span class="schedule__mname">{{ row.name }}</span>
          <span class="schedule__mspan">{{ row.spanText }}</span>
        </p>
        <ul class="schedule__mstages">
          <li v-for="(bar, i) in row.bars" :key="i" class="schedule__mstage">
            <span class="schedule__mrail" aria-hidden="true"></span>
            <span class="schedule__mdot" aria-hidden="true"></span>
            <span class="schedule__mmonth">{{ bar.range }}</span>
            <span class="schedule__mstage-name">{{ bar.stage }}</span>
          </li>
        </ul>
      </li>
    </ul>
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

/* ── 窄屏：Fluent 风格的竖置时间线清单（会长 2026-09-23 重设计）──
   一场赛事一条：左边一条 2px 竖直时间条 + 阶段圆点，右边「月份 + 阶段名」。
   间距一律 4px 的倍数（4/6/8/16/24），字号一律 ≥12px —— 原 6 列窄柱状图在手机上
   每列只有 40 多像素、字号被压到 9.6px 且阶段名要折两三行，读不出来。 */
.schedule__mlist {
  display: none;
  margin: 0;
  padding: 16px;
  list-style: none;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--radius-xl);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.06);
}
.schedule__mitem + .schedule__mitem {
  margin-top: 24px; /* 用留白分组，不画横向分隔线（与图表「只要竖线」同一口径） */
}
.schedule__mhead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.schedule__mhead .schedule__logo {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}
.schedule__mname {
  font-size: 0.9375rem; /* 15px —— Fluent BodyStrong */
  font-weight: 600;
  color: var(--text);
}
.schedule__mspan {
  margin-left: auto;
  font-size: 0.75rem; /* 12px —— Fluent Caption */
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.schedule__mstages {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}
.schedule__mstage {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0 6px 24px;
}
/* 竖直时间条：每行一段，首行自圆点起、末行至圆点止 ⇒ 首尾相接成一条连续竖线 */
.schedule__mrail {
  position: absolute;
  left: 5px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: color-mix(in srgb, var(--row-color) 45%, transparent);
}
.schedule__mstage:first-child .schedule__mrail {
  top: 13px;
  border-radius: 2px 2px 0 0;
}
.schedule__mstage:last-child .schedule__mrail {
  bottom: auto;
  height: 13px;
  border-radius: 0 0 2px 2px;
}
/* 阶段圆点落在时间条上（条在 5~7px，点宽 10px、左缘 1px ⇒ 圆心 6px 对齐） */
.schedule__mdot {
  position: absolute;
  left: 1px;
  top: 8px;
  width: 10px;
  height: 10px;
  box-sizing: border-box;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--row-color);
}
.schedule__mmonth {
  flex: 0 0 44px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--row-color);
  font-variant-numeric: tabular-nums;
}
.schedule__mstage-name {
  font-size: 0.875rem; /* 14px —— Fluent Body */
  color: var(--text);
  line-height: 1.4;
}

@media (max-width: 768px) {
  .schedule {
    margin-top: 40px;
    margin-bottom: 40px;
  }
  .schedule__chart {
    display: none;
  }
  .schedule__mlist {
    display: block;
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
