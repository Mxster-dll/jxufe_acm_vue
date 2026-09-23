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
      lanes: packLanes(bars),
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

    <!-- 窄屏：时间线竖置 —— 月份刻度自上而下，一个赛事一列，阶段是竖向时间条、文字在条的旁边
         （会长 2026-09-23；取代早先的「阶段 + 月份」胶囊清单） -->
    <div class="schedule__vchart">
      <div class="schedule__vaxis" aria-hidden="true">
        <span v-for="(m, i) in MONTHS" :key="m" :class="{ 'is-now': i + 1 === nowMonth }">{{ m }}</span>
      </div>
      <div
        v-for="row in rows"
        :key="row.slug"
        class="schedule__vcol"
        :style="{ '--row-color': row.color }"
      >
        <p class="schedule__vname">
          <img
            v-for="(lg, i) in row.logos"
            :key="i"
            :src="lg"
            :alt="row.name"
            class="schedule__logo"
          />
          <span>{{ row.name }}</span>
        </p>
        <div class="schedule__vtrack">
          <!-- 当前月份那一段（横贯本列的一格底色；区间条在其上） -->
          <span class="schedule__vnow" :style="{ top: nowLeft, height: nowWidth }" aria-hidden="true"></span>
          <span
            v-for="(bar, i) in row.bars"
            :key="i"
            class="schedule__vbar"
            :style="{ top: `${((bar.from - 1) / 12) * 100}%`, height: `${((bar.to - bar.from + 1) / 12) * 100}%` }"
            :title="`${row.name} · ${bar.stage}（${bar.range}）${bar.note ? ' —— ' + bar.note : ''}`"
          >
            <span class="schedule__vlabel">{{ bar.stage }}</span>
          </span>
        </div>
      </div>
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
  padding-bottom: 8px;
  /* 会长 2026-09-23：时间表只要**竖向**框线（月份的竖网格），不要横向框线 ——
     坐标轴的下框线与每行的行分隔线都已去掉，行与行只靠留白区分。 */
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

/* ── 窄屏：竖置时间线（会长 2026-09-23）──
   月份刻度自上而下排在左边，一个赛事一列，阶段画成**竖向**时间条、文字贴在条的右侧。
   竖网格只保留列与列之间的 1px 竖线（与宽屏同一条口径：只竖向、不横向），
   行与行（月份）之间不画任何线，靠坐标轴的刻度读月份。 */
.schedule__vchart {
  display: none;
  --vmonth: 22px; /* 每个月在竖直方向占的高度 */
  align-items: stretch;
}
.schedule__vaxis {
  flex: 0 0 26px;
  padding-top: 46px; /* 与每列顶部的「图标 + 赛事名」对齐 */
  border-right: 1px solid rgba(15, 23, 42, 0.06);
}
.schedule__vaxis span {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--vmonth);
  font-size: 0.62rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.schedule__vaxis span.is-now {
  color: var(--primary);
  font-weight: 700;
}
.schedule__vcol {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(15, 23, 42, 0.05);
}
.schedule__vname {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  height: 46px;
  padding-bottom: 4px;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  word-break: break-all;
}
.schedule__vname .schedule__logo {
  width: 22px;
  height: 22px;
  border-radius: 4px;
}
.schedule__vtrack {
  position: relative;
  height: calc(var(--vmonth) * 12);
}
.schedule__vnow {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 0;
  background: rgba(26, 115, 232, 0.09);
  pointer-events: none;
}
.schedule__vbar {
  position: absolute;
  left: 0;
  z-index: 1;
  width: 10px;
  background: var(--row-color);
  border-radius: var(--radius-full);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
}
/* 阶段名贴在时间条右侧（条只有 10px 宽，列内剩下的 ~30px 留给文字，2~3 字一行） */
.schedule__vlabel {
  position: absolute;
  left: calc(100% + 4px);
  top: 50%;
  width: 30px;
  transform: translateY(-50%);
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1.15;
  color: var(--row-color);
}

@media (max-width: 768px) {
  .schedule {
    margin-top: 40px;
    margin-bottom: 40px;
  }
  .schedule__chart {
    display: none;
  }
  .schedule__vchart {
    display: flex;
    padding: 16px 12px;
    background: #fff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: var(--radius-xl);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px rgba(15, 23, 42, 0.06);
  }
}
/* ── 当前月份列（会长 2026-09-23：「把当前月份列高亮」）──
   只此一条、放在所有行的容器里 ⇒ 天然是一整列，与行高无关；上下各多出 10px 吃掉首/末行的
   内边距。区间条是定位元素，天然画在它上面（不用 z-index 打架）。 */
.schedule__body {
  position: relative;
}
.schedule__now {
  position: absolute;
  top: -10px;
  bottom: -10px;
  z-index: 0;
  background: rgba(26, 115, 232, 0.09);
  pointer-events: none;
}
.schedule__axis span.is-now {
  color: var(--primary);
  font-weight: 700;
}
</style>
