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

/** 每行一种颜色；取站点既有的调色板（主色 / 强调色 / 荣誉绿 / 会长金 / 紫 / 特等红），不新造色 */
const PALETTE = ['#1a73e8', '#ff9800', '#2e7d32', '#a16207', '#7c3aed', '#c62828']

/** 把同一行里重叠的区间分配到不同泳道：贪心，放得下就复用已有泳道 */
function packLanes(bars) {
  const lanes = []
  for (const bar of [...bars].sort((a, b) => a.from - b.from)) {
    let lane = lanes.findIndex((last) => last < bar.from)
    if (lane === -1) {
      lane = lanes.length
      lanes.push(0)
    }
    lanes[lane] = bar.to
    bar.lane = lane
  }
  return lanes.length
}

const rows = computed(() =>
  props.competitions
    .filter((c) => (c.schedule || []).length)
    .map((c, i) => {
      const bars = (c.schedule || []).map((s) => ({
        stage: s.stage,
        note: s.note || '',
        range: s.from === s.to ? `${s.from}月` : `${s.from}-${s.to}月`,
        left: ((s.from - 1) / 12) * 100,
        width: ((s.to - s.from + 1) / 12) * 100,
        lane: 0,
      }))
      return {
        slug: c.slug,
        name: c.shortName || c.name,
        color: PALETTE[i % PALETTE.length],
        lanes: packLanes(bars),
        bars,
      }
    })
)
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
      <div
        v-for="row in rows"
        :key="row.slug"
        class="schedule__row"
        :style="{ '--row-color': row.color, '--lanes': row.lanes }"
      >
        <div class="schedule__name">{{ row.name }}</div>
        <div class="schedule__track">
          <!-- 当前月份列：一条贯穿本行泳道的淡蓝底（各行对齐 ⇒ 视觉上是一整列） -->
          <span class="schedule__now" :style="{ left: nowLeft, width: nowWidth }" aria-hidden="true"></span>
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

    <!-- 窄屏：同一份数据换成「赛事 → 阶段 + 月份」清单（月份刻度在这个宽度下不可读） -->
    <ul class="schedule__list">
      <li v-for="row in rows" :key="row.slug" :style="{ '--row-color': row.color }">
        <p class="schedule__list-name">{{ row.name }}</p>
        <p class="schedule__chips">
          <span v-for="(bar, i) in row.bars" :key="i" class="schedule__chip"
            >{{ bar.stage }}<b>{{ bar.range }}</b></span
          >
        </p>
      </li>
    </ul>

    <p class="schedule__note">
      区间由本会历年真实赛历统计得出（获奖记录日期与赛季资料），非官方公告日历；未收录的阶段不显示。
    </p>
  </section>
</template>

<style scoped>
/* ==========================================================================
   全年赛程时间轴
   ========================================================================== */
.schedule {
  margin-top: 56px;
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
  margin-left: 132px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.07);
}
.schedule__axis span {
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
  border-bottom: 1px dashed rgba(15, 23, 42, 0.06);
}
.schedule__row:last-child {
  border-bottom: 0;
}
.schedule__name {
  flex: 0 0 132px;
  width: 132px;
  padding-right: 12px;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text);
  line-height: 30px;
  border-right: 1px solid rgba(15, 23, 42, 0.06);
}
.schedule__track {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  /* 12 个月等宽网格：区间条按 left/width 百分比落格 */
  height: calc(var(--lanes) * 30px);
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

/* ── 窄屏清单 ── */
.schedule__list {
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;
}
.schedule__list li {
  padding: 12px 0;
  border-bottom: 1px dashed rgba(15, 23, 42, 0.08);
}
.schedule__list li:last-child {
  border-bottom: 0;
}
.schedule__list-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}
.schedule__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.schedule__chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--row-color);
  background: color-mix(in srgb, var(--row-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--row-color) 32%, transparent);
  border-radius: var(--radius-full);
}
.schedule__chip b {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.schedule__note {
  margin-top: 12px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .schedule {
    margin-top: 40px;
  }
  .schedule__chart {
    display: none;
  }
  .schedule__list {
    display: block;
    padding: 4px 16px;
    background: #fff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: var(--radius-xl);
  }
}
/* ── 当前月份列（会长 2026-09-23：「把当前月份列高亮」）──
   每行的泳道里各放一条贯穿上下的淡蓝底，各行位置一致 ⇒ 看起来是一整列。
   区间条在 DOM 里排在它后面、又是定位元素，天然画在它上面（不用 z-index 打架）。 */
.schedule__now {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 0;
  border-radius: 6px;
  background: rgba(26, 115, 232, 0.09);
  box-shadow: inset 0 0 0 1px rgba(26, 115, 232, 0.16);
  pointer-events: none;
}
.schedule__axis span.is-now {
  color: var(--primary);
  font-weight: 700;
}
</style>
