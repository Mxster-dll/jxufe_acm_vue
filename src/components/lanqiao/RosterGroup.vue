<script setup>
// 获奖分组名单渲染（竞赛详情页 / 单届详情页共用）：
// 组标题 → 奖等行（奖等徽章 + 姓名表格，天梯赛式框线）
// 组对象形态：{ label, icon?, date?, awards }
//   awards = [{ award: '一等奖' | '金奖' …, persons: [{ name, rank?, title? }] }]
// 分组、排序与奖等文案由 utils/awardGroups.js 计算，本组件只负责渲染
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { awardTone, isTrophyRank, rankText } from '../../utils/awardGroups.js'

const props = defineProps({
  groups: { type: Array, default: () => [] },
})

// 组显示标题（「语言 · 组别」已由分组逻辑拼好放进 label）
function groupTitle(g) {
  return g.label || ''
}
function groupIcon(g) {
  return g.icon || 'fa-code'
}
function groupKey(g) {
  return g.label || 'group'
}

// 每行最大列数按表格实际可用宽度动态计算（ResizeObserver 监听组件宽度）：
// 列宽目标 ≥112px（排名槽 64px + 姓名 ~48px，4 字姓名不省略），clamp 2..8。
// 页面 .lq-list 限宽 880px 时宽屏（≥1200）可用 ~743px → 6 列；
// 若限宽放开，可用宽度自然增长 → 最多 8 列。
const MAX_CELLS = ref(6)
const groupsEl = ref([])
let resizeObserver = null

function updateMaxCells() {
  const groupEl = groupsEl.value[0]
  if (!groupEl?.clientWidth) return
  // 表格 wrap 宽 ≈ 组宽 - 奖等徽章(~56px) - 行间距(10px) - 外框(2px)
  const wrapW = groupEl.clientWidth - 56 - 10 - 2
  const cols = Math.floor(wrapW / 112)
  MAX_CELLS.value = Math.max(2, Math.min(8, cols))
}
onMounted(() => {
  updateMaxCells()
  const groupEl = groupsEl.value[0]
  if (groupEl && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateMaxCells)
    resizeObserver.observe(groupEl)
  } else {
    window.addEventListener('resize', updateMaxCells)
  }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', updateMaxCells)
})

// 姓名数组 → 表格行（每行最多 MAX_CELLS 人）
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// 二字名中间插全角空格，与三字名等宽对齐（与 xcpc 参赛史表格的 alignName 一致）
function alignName(name) {
  if (name && name.length === 2) return name[0] + '\u3000' + name[1]
  return name
}
</script>

<template>
  <div v-for="g in props.groups" :key="groupKey(g)" class="lq-group" ref="groupsEl">
    <h5 class="lq-group-title"><i class="fa-solid" :class="groupIcon(g)"></i> {{ groupTitle(g) }}<span v-if="g.date" class="lq-group-date">{{ g.date }}</span></h5>
    <div v-for="(aw, ai) in g.awards" :key="ai" class="lq-award-row">
      <span class="lq-award-tag" :class="awardTone(aw.award)">{{ aw.award }}</span>
      <div class="lq-table-wrap">
        <table class="lq-name-table">
          <tbody>
            <tr v-for="(row, ri) in chunk(aw.persons, MAX_CELLS)" :key="ri">
              <td v-for="(p, ni) in row" :key="ni" class="lq-name-cell" :title="p.title || ''">
                <span class="lq-cell-inner">
                  <!-- 名次：前三名显示「冠军 / 亚军 / 季军」，其余 `#N`（口径在 utils/awardGroups.js） -->
                  <span v-if="rankText(p.rank)" class="lq-rank-slot">
                    <span class="lq-rank-pill" :class="{ 'is-trophy': isTrophyRank(p.rank) }">{{
                      rankText(p.rank)
                    }}</span>
                  </span>
                  <span class="lq-name">{{ alignName(p.name) }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lq-group {
  margin-bottom: var(--space-md);
}
.lq-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--primary-dark);
  margin-bottom: 6px;
}
.lq-group-title i {
  font-size: 0.8rem;
  color: var(--primary);
  opacity: 0.7;
}
.lq-group-level {
  color: var(--text-muted);
  font-weight: 600;
}
/* 通用形态组的日期角标（如百度之星各场次公示日期） */
.lq-group-date {
  margin-left: 8px;
  padding: 1px 10px;
  border-radius: var(--radius-full);
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  font-family: var(--font-mono);
  white-space: nowrap;
}
/* 奖等行：徽章 + 姓名表格 */
.lq-award-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 6px 0;
}
.lq-award-tag {
  flex-shrink: 0;
  min-width: 4.2em;
  padding: 1px 10px;
  margin-top: 2px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-align: center;
}
.lq-award-tag.medal-grand { background: rgba(198,40,40,0.1); color: #d32f2f; }
.lq-award-tag.medal-gold { background: rgba(199,145,0,0.1); color: #c79100; }
.lq-award-tag.medal-silver { background: rgba(122,139,153,0.12); color: #7a8b99; }
.lq-award-tag.medal-bronze { background: rgba(184,115,51,0.1); color: #b87333; }
.lq-award-tag.lq-excellent { background: rgba(150,140,110,0.1); color: #8d8560; }
/* 姓名表格：天梯赛式框线（外框 1px 圆角 + 行分隔线，另加列竖线成完整网格）。
   wrap 占满奖等行剩余宽度，表格 100% 宽 + fixed 布局：列宽随容器收缩，
   任何宽度下都不横向溢出、不出现滚动条（名字超宽时省略显示） */
.lq-table-wrap {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--card-bg, #fff);
}
/* 表格宽度 = wrap 宽度；fixed 布局下列宽均分、随容器收缩，
   内容（nowrap）超出单元格时由格内 flex 的 .lq-name 省略号裁切 */
.lq-name-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  background: #fff;
}
.lq-name-table td {
  padding: 6px 10px;
  font-size: var(--font-size-xs);
  color: var(--text);
  white-space: nowrap;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  border-right: 1px solid rgba(0, 0, 0, 0.04);
}
/* 末行去掉行分隔线（外框由 wrap 提供） */
.lq-name-table tr:last-child td {
  border-bottom: none;
}
/* 末列去掉竖线（外框由 wrap 提供） */
.lq-name-table td:last-child {
  border-right: none;
}
/* 格内布局：排名右对齐、姓名左对齐（flex 放内层，td 保持 table-cell 角色） */
.lq-cell-inner {
  display: flex;
  align-items: baseline;
  text-align: left;
}
.lq-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 排名（awards/*.json 的 rank 字段）：省赛 = 省内同科目组排名、国赛 = 全国同科目组排名；
   天梯赛个人 = 该届国赛全国名次。外层 slot 固定 44px 占位（位于格子最左侧），
   内层 pill 背景贴合文字宽度。前三名是「冠军 / 亚军 / 季军」（会长 2026-09-24），
   两个汉字比 `#12` 宽一点，故 slot 从 40px 放到 44px。 */
.lq-rank-slot {
  flex-shrink: 0;
  width: 44px;
  margin-right: 4px;
  display: inline-flex;
  justify-content: flex-end;
}
.lq-rank-pill {
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: rgba(57, 73, 171, 0.1);
  color: var(--primary-dark);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
  text-align: right;
}
/* 冠亚季军：走「奖杯」那一档的金色（--honor-leader），与普通 `#N` 的蓝底区分开 ——
   会长 2026-09-24 的口径是「冠亚季军与特等奖同属奖杯档」，大事记角标也按 🏆 统计。 */
.lq-rank-pill.is-trophy {
  background: rgba(161, 98, 7, 0.12);
  color: var(--honor-leader);
}
</style>
