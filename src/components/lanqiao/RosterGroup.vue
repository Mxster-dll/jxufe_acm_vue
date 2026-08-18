<script setup>
// 蓝桥杯分组名单渲染（赛事总页 / 单届详情页共用）：
// 组标题（C/C++·Java·Python × A/B）→ 奖等行（奖等徽章 + 姓名表格，天梯赛式框线）
import { LANGS, lqAwardTone } from '../../utils/lanqiaoGroup'

const props = defineProps({
  groups: { type: Array, default: () => [] },
})

const LANQ_NAME = Object.fromEntries(LANGS)

// 姓名数组 → 表格行（每行 6 人）
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}
</script>

<template>
  <div v-for="g in props.groups" :key="g.lang + g.level" class="lq-group">
    <h5 class="lq-group-title"><i class="fa-solid fa-code"></i> {{ LANQ_NAME[g.lang] }} <span class="lq-group-level">· {{ g.level }}组</span></h5>
    <div v-for="(aw, ai) in g.awards" :key="ai" class="lq-award-row">
      <span class="lq-award-tag" :class="lqAwardTone(aw.award)">{{ aw.award }}</span>
      <div class="lq-table-wrap">
        <table class="lq-name-table">
          <tbody>
            <tr v-for="(row, ri) in chunk(aw.persons, 6)" :key="ri">
              <td v-for="(p, ni) in row" :key="ni" class="lq-name-cell">
                <span v-if="p.rank != null" class="lq-rank-pill">#{{ p.rank }}</span>{{ p.name }}
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
.lq-award-tag.medal-gold { background: rgba(199,145,0,0.1); color: #c79100; }
.lq-award-tag.medal-silver { background: rgba(122,139,153,0.12); color: #7a8b99; }
.lq-award-tag.medal-bronze { background: rgba(184,115,51,0.1); color: #b87333; }
.lq-award-tag.lq-excellent { background: rgba(150,140,110,0.1); color: #8d8560; }
/* 姓名表格：天梯赛式框线（外框 + 行分隔线，白底圆角） */
.lq-table-wrap {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: var(--radius-md);
  overflow-x: auto;
  background: var(--card-bg, #fff);
}
.lq-name-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.lq-name-table td {
  padding: 4px 6px;
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.lq-name-table tr:last-child td {
  border-bottom: none;
}
/* 排名胶囊（蓝桥杯 Finder 数据：省赛=省内组排名、国赛=全国组排名） */
.lq-rank-pill {
  display: inline-block;
  margin-right: 4px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: rgba(57, 73, 171, 0.1);
  color: var(--primary-dark);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.5;
  vertical-align: 1px;
}
</style>
