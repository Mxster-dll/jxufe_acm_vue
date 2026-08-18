<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useJson } from '../composables/useJson'

const route = useRoute()
const { data: competitions, loading, error } = useJson('/data/competitions.json', {
  initial: []
})

const comp = computed(
  () => (competitions.value || []).find((c) => c.slug === route.params.slug)
)

// 举办时间数据：/data/events/<slug>.json（与大事记共用同一数据源）
const events = ref([])
watch(
  () => route.params.slug,
  async (slug) => {
    if (!slug) return
    try {
      const res = await fetch(`/data/events/${slug}.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      events.value = (await res.json()).events || []
    } catch (e) {
      console.error(`加载 /data/events/${slug}.json 失败:`, e)
      events.value = []
    }
  },
  { immediate: true }
)

// 将按年分组的 history 展平为表格行（按年份降序）
const historyRows = computed(() => {
  if (!comp.value?.history) return []
  const sorted = [...comp.value.history].sort((a, b) => Number(b.year) - Number(a.year))
  return sorted.flatMap((g) =>
    (g.entries || []).map((e) => ({ year: g.year, ...e }))
  )
})

// 日期列：优先取该年份的赛事举办时间（date），缺省回退为年份
function rowDate(row) {
  const evs = (events.value || []).filter((e) => String(e.year) === String(row.year))
  if (!evs.length) return row.year
  const hit =
    evs.find(
      (e) =>
        e.title &&
        (row.title.includes(e.title) || e.title.includes(row.title))
    ) || evs[0]
  return hit.date || row.year
}

// ==========================================================================
// 天梯赛式参赛历史表（队名/国赛/省赛/成员奖牌色）：
// 由 events（届数+日期）与 editions（获奖明细）数据驱动，无需在 competitions.json 重复维护
// ==========================================================================
const useTeamTable = ref(false)
const eventsList = ref([])
const editionsByYear = ref({})

watch(
  comp,
  async (c) => {
    useTeamTable.value = false
    if (!c) return
    // mode=history：参赛历史由 competitions.json 全量维护（ICPC/CCPC 等），
    // 不使用天梯赛式单届表（editions 文件仅作年度汇总详情页，供大事记时间轴跳转）
    if (c.mode === 'history') {
      console.log('该赛事使用通用参赛历史表（mode=history）:', c.slug)
      return
    }
    try {
      const evRes = await fetch(`/data/events/${c.slug}.json`)
      if (!evRes.ok) throw new Error(`HTTP ${evRes.status}`)
      const evData = await evRes.json()
      const evs = evData.events || []
      if (!evs.length) throw new Error('无届次数据')
      // 探测是否存在单届详情数据（editions/<slug>/<year>.json）
      const probe = await fetch(`/data/editions/${c.slug}/${evs[0].year}.json`)
      if (!probe.ok) throw new Error(`HTTP ${probe.status}`)
      const map = {}
      await Promise.all(
        evs.map(async (ev) => {
          try {
            const r = await fetch(`/data/editions/${c.slug}/${ev.year}.json`)
            if (r.ok) map[String(ev.year)] = await r.json()
          } catch (e) {
            console.error(`加载 /data/editions/${c.slug}/${ev.year}.json 失败:`, e)
          }
        })
      )
      eventsList.value = evs
      editionsByYear.value = map
      useTeamTable.value = true
    } catch (e) {
      console.error('该赛事无单届详情数据，使用通用参赛历史表:', e)
      useTeamTable.value = false
    }
  },
  { immediate: true }
)

// 日期 → yyyy.mm.dd（无日期回退为年份）
function dateTextOf(date, year) {
  if (!date) return String(year)
  const [y, m, d] = String(date).split('-')
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`
}

// 队名归一化（去空格，兼容"JXUFE_IM_1 队"与"JXUFE_IM_1队"）
function normName(name) {
  return (name || '').replace(/\s+/g, '')
}

// 奖项 → 等级（"全国团队一等奖"/"分省团队一等奖" → "一等奖"）
function awardLevel(award) {
  if (!award) return ''
  return award.replace(/^(全国|分省)(团队|高校)/, '')
}

// 奖项 → 排名（用于队伍/成员按奖次排序；未获奖排最后）
function awardRank(award) {
  if (!award) return 4
  if (/一等奖|金奖|冠军/.test(award)) return 1
  if (/二等奖|银奖|亚军/.test(award)) return 2
  if (/三等奖|铜奖|季军/.test(award)) return 3
  return 4
}

// 届数简称（"第十一届团体程序设计天梯赛" → "第十一届"）
function editionShort(title, ed) {
  if (ed?.edition) return ed.edition
  const m = (title || '').match(/第[一二三四五六七八九十百]+届/)
  return m ? m[0] : title || ''
}

// 汇总各届获奖团队（国赛 ∪ 省赛），成员按个人奖标注
const teamRows = computed(() => {
  if (!useTeamTable.value) return []
  const rows = []
  const evs = [...(eventsList.value || [])].sort((a, b) => Number(b.year) - Number(a.year))
  for (const ev of evs) {
    const ed = editionsByYear.value[String(ev.year)]
    if (!ed) continue
    const nationalTeams = ed.national?.teams || []
    const provincialTeams = ed.provincial?.teams || []
    const personalMap = {}
    for (const p of ed.national?.personal || []) personalMap[p.name] = p.award

    const byName = new Map()
    for (const t of nationalTeams) {
      byName.set(normName(t.name), {
        name: t.name,
        national: t.award,
        provincial: null,
        members: (t.members || '')
          .split('、')
          .filter(Boolean)
          .map((n) => ({ name: n, award: personalMap[n] || '' }))
      })
    }
    for (const t of provincialTeams) {
      const k = normName(t.name)
      if (byName.has(k)) byName.get(k).provincial = t.award
      else byName.set(k, { name: t.name, national: null, provincial: t.award, members: [] })
    }
    let teams = [...byName.values()]
    if (!teams.length) continue
    // 队伍按奖次排名：先国赛再省赛，未获奖排后
    teams.sort(
      (a, b) =>
        awardRank(a.national) - awardRank(b.national) ||
        awardRank(a.provincial) - awardRank(b.provincial)
    )
    // 成员按个人奖次排名：一/二/三等奖在前，未获奖在后（同级保持原顺序）
    for (const t of teams) {
      t.members.sort((a, b) => awardRank(a.award) - awardRank(b.award))
    }
    rows.push({
      year: ev.year,
      edition: editionShort(ev.title, ed),
      dateText: dateTextOf(ev.date, ev.year),
      teams
    })
  }
  return rows
})

// 成员个人奖 → 奖牌色（未获奖为浅灰，与银奖拉开区分度）
function memberAwardClass(m) {
  if (!m.award) return 'member-plain'
  if (/一等奖|金牌/.test(m.award)) return 'medal-gold'
  if (/二等奖|银牌/.test(m.award)) return 'medal-silver'
  if (/三等奖|铜牌/.test(m.award)) return 'medal-bronze'
  return 'member-plain'
}

// 两字姓名中间插入全角空格，与三字姓名对齐（仅显示，不影响数据）
function alignName(name) {
  return /^[\u4e00-\u9fff]{2}$/.test(name || '')
    ? name[0] + '\u3000' + name[1]
    : name
}

// 奖牌颜色
function medalClass(desc) {
  if (!desc) return ''
  if (/金牌|🥇|一等/.test(desc)) return 'medal-gold'
  if (/银牌|🥈|二等/.test(desc)) return 'medal-silver'
  if (/铜牌|🥉|三等/.test(desc)) return 'medal-bronze'
  if (/铁牌/.test(desc)) return 'medal-iron'
  return ''
}

// 赛事等级
function entryLevel(entry) {
  return entry.level || '国家级'
}
</script>

<template>
  <main class="comp-page container-fluid">
    <!-- 装饰光斑 -->
    <div class="decorative-orb decorative-orb--primary" style="width:500px;height:500px;top:-200px;right:-150px;opacity:0.06"></div>
    <div class="decorative-orb decorative-orb--accent" style="width:350px;height:350px;bottom:10%;left:-120px;opacity:0.04"></div>

    <div class="container comp-inner">
      <!-- Loading / Error -->
      <div v-if="loading" class="skeleton-list">
        <div v-for="n in 3" :key="n" class="skeleton" style="height:200px;border-radius:var(--radius-xl);margin-bottom:var(--space-lg);"></div>
      </div>
      <p v-else-if="error" class="hint">加载失败</p>
      <p v-else-if="!comp" class="hint">未找到该竞赛</p>

      <template v-else>
        <!-- 标题区 -->
        <header class="page-hero">
          <p class="page-label">COMPETITION DETAIL</p>
          <h1>{{ comp.name }}</h1>
          <p v-if="comp.subtitle" class="page-subtitle">{{ comp.subtitle }}</p>
        </header>

        <!-- 简介 -->
        <section class="comp-intro">
          <img :src="comp.image" :alt="comp.name" class="comp-logo" />
          <div class="intro-text">
            <h2>竞赛简介</h2>
            <p v-for="(p, i) in comp.intro" :key="i">{{ p }}</p>
          </div>
        </section>

        <!-- 详情卡片 -->
        <section class="comp-details">
          <div
            v-for="(d, i) in comp.details"
            :key="d.title"
            v-reveal="'scale-in'"
            :style="{ '--reveal-index': i }"
            class="detail-card"
          >
            <div class="detail-icon">
              <i :class="`fas ${d.icon}`"></i>
            </div>
            <h3>{{ d.title }}</h3>
            <p v-for="(line, idx) in d.lines" :key="idx">{{ line }}</p>
          </div>
        </section>

        <!-- 参赛历史 -->
        <section class="comp-history">
          <h2 class="section-label"><i class="fas fa-timeline"></i> 我校参赛历史</h2>
          <p v-if="!historyRows.length && !teamRows.length" class="empty">暂无参赛记录</p>
          <div v-else class="history-table-wrap" v-reveal="'fade-up'">
            <table class="history-table" :class="teamRows.length ? 'team-table-desktop' : ''">
              <thead>
                <tr>
                  <template v-if="teamRows.length">
                    <th>日期</th>
                    <th>届数</th>
                    <th>队名</th>
                    <th>国赛</th>
                    <th>省赛</th>
                    <th>参赛成员</th>
                  </template>
                  <template v-else>
                    <th>日期</th>
                    <th>等级</th>
                    <th>赛事</th>
                    <th>成绩</th>
                    <th>参赛成员</th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <!-- 天梯赛式：按届分组，合并相同年份/届数的格子 -->
                <template v-if="teamRows.length">
                  <template v-for="g in teamRows" :key="g.year">
                    <tr v-for="(t, ti) in g.teams" :key="t.name">
                      <td v-if="ti === 0" class="cell-year" :rowspan="g.teams.length">{{ g.dateText }}</td>
                      <td v-if="ti === 0" class="cell-edition" :rowspan="g.teams.length">{{ g.edition }}</td>
                      <td class="cell-team">{{ t.name }}</td>
                      <td class="cell-award" :class="medalClass(t.national)">{{ awardLevel(t.national) || '—' }}</td>
                      <td class="cell-award" :class="medalClass(t.provincial)">{{ awardLevel(t.provincial) || '—' }}</td>
                      <td class="cell-members">
                        <template v-if="t.members.length">
                          <span
                            v-for="(m, mi) in t.members"
                            :key="mi"
                            class="member-name"
                            :class="memberAwardClass(m)"
                            :title="m.award || '未获个人奖'"
                          >{{ alignName(m.name) }}<template v-if="mi < t.members.length - 1">、</template></span>
                        </template>
                        <span v-else class="member-name">—</span>
                      </td>
                    </tr>
                  </template>
                </template>
                <!-- 通用式 -->
                <template v-else>
                  <tr v-for="(row, i) in historyRows" :key="i">
                    <td class="cell-year">{{ rowDate(row) }}</td>
                    <td class="cell-level" :class="'level-' + entryLevel(row).replace('级','')">{{ entryLevel(row) }}</td>
                    <td class="cell-title">{{ row.title }}</td>
                    <td class="cell-desc" :class="medalClass(row.desc)">{{ row.desc }}</td>
                    <td class="cell-members">{{ row.members || '—' }}</td>
                  </tr>
                </template>
              </tbody>
            </table>

            <!-- 移动端：每队一张卡片（≤768px 时替代六列表格） -->
            <div v-if="teamRows.length" class="team-cards-mobile">
              <div v-for="g in teamRows" :key="'m' + g.year" class="m-group">
                <div class="m-group-head">
                  <span class="m-edition">{{ g.edition }}</span>
                  <span class="m-date">{{ g.dateText }}</span>
                </div>
                <div v-for="t in g.teams" :key="t.name" class="m-team-card">
                  <div class="m-team-name">{{ t.name }}</div>
                  <div class="m-awards">
                    <span class="m-award" :class="medalClass(t.national)">
                      <i class="fa-solid fa-flag"></i> 国赛 {{ awardLevel(t.national) || '—' }}
                    </span>
                    <span class="m-award" :class="medalClass(t.provincial)">
                      <i class="fa-solid fa-map-location-dot"></i> 省赛 {{ awardLevel(t.provincial) || '—' }}
                    </span>
                  </div>
                  <div class="m-members">
                    <template v-if="t.members.length">
                      <span
                        v-for="(m, mi) in t.members"
                        :key="mi"
                        class="member-name"
                        :class="memberAwardClass(m)"
                        :title="m.award || '未获个人奖'"
                      >{{ alignName(m.name) }}<template v-if="mi < t.members.length - 1">、</template></span>
                    </template>
                    <span v-else class="member-name member-plain">—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <RouterLink to="/contest" class="back-link">
          <i class="fa-solid fa-arrow-left"></i> 返回竞赛信息
        </RouterLink>
      </template>
    </div>
  </main>
</template>

<style scoped>
/* ==========================================================================
   竞赛详情页
   ========================================================================== */
.comp-page {
  position: relative;
  overflow: clip;
  min-height: 100vh;
  margin-top: calc(-1 * var(--header-height));
  padding: calc(var(--header-height) + 40px) 0 var(--space-3xl);
  background:
    radial-gradient(ellipse 600px 400px at 80% 5%, rgba(26,115,232,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 400px 300px at 15% 90%, rgba(255,152,0,0.03) 0%, transparent 60%),
    linear-gradient(175deg, #f8fafc 0%, #fff 35%, #fff 100%);
}
.comp-inner {
  position: relative;
  z-index: 1;
  width: 90%;
  margin: 0 auto;
}

.hint {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-3xl) 0;
  font-size: var(--font-size-lg);
}
.skeleton-list {
  max-width: 700px;
  margin: 0 auto;
}

/* ── 标题区 ── */
.page-hero {
  text-align: center;
  margin-bottom: 56px;
}
.page-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 4px;
  color: var(--primary);
  font-weight: 700;
  margin-bottom: 6px;
}
.page-hero h1 {
  font-size: 2.8rem;
  font-weight: 700;
  color: var(--primary-dark);
  line-height: var(--line-height-tight);
  margin-bottom: 12px;
}
.page-subtitle {
  font-size: var(--font-size-lg);
  color: var(--text-muted);
}

/* ── 小节标签 ── */
.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.section-label i { color: var(--primary); }

/* ── 简介 ── */
.comp-intro {
  display: flex;
  align-items: flex-start;
  gap: var(--space-xl);
  margin-bottom: var(--space-2xl);
}
.comp-logo {
  width: 180px;
  height: auto;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
}
.intro-text {
  flex: 1;
}
.intro-text h2 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--text);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-sm);
  border-bottom: 2px solid rgba(26,115,232,0.12);
}
.intro-text p {
  margin-bottom: var(--space-md);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--text-light);
}

/* ── 详情卡片 ── */
.comp-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-2xl);
}
.detail-card {
  text-align: center;
  padding: var(--space-xl) var(--space-lg);
  background: #fff;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: var(--radius-xl);
  box-shadow: 0 2px 12px rgba(0,0,0,0.03);
  transition: transform var(--transition-spring), box-shadow var(--transition), border-color var(--transition);
}
.detail-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 28px rgba(26,115,232,0.07);
  border-color: rgba(26,115,232,0.12);
}
.detail-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto var(--space-md);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(26,115,232,0.08), rgba(26,115,232,0.03));
}
.detail-icon i {
  font-size: 1.4rem;
  color: var(--primary);
}
.detail-card h3 {
  margin-bottom: var(--space-sm);
  color: var(--text);
  font-size: var(--font-size-lg);
  font-weight: 700;
}
.detail-card p {
  color: var(--text-light);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

/* ── 参赛历史 ── */
.comp-history {
  margin-bottom: var(--space-xl);
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-xl) 0;
  font-size: var(--font-size-sm);
}
.history-table-wrap {
  overflow-x: auto;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(0,0,0,0.06);
}
.history-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  font-size: var(--font-size-sm);
}
.history-table thead {
  background: linear-gradient(135deg, rgba(26,115,232,0.04), rgba(26,115,232,0.01));
}
.history-table th {
  padding: 14px 16px;
  text-align: center;
  font-weight: 700;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  border-bottom: 2px solid rgba(26,115,232,0.1);
  white-space: nowrap;
}
.history-table th:first-child {
  padding-left: 24px;
}
.history-table td {
  padding: 14px 16px;
  text-align: center;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  color: var(--text);
  vertical-align: middle;
}
.history-table td:first-child {
  padding-left: 24px;
}
.history-table tbody tr {
  transition: background var(--transition-fast);
}
.history-table tbody tr:hover {
  background: rgba(26,115,232,0.02);
}
.history-table tbody tr:last-child td {
  border-bottom: none;
}
.cell-year {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--primary);
  white-space: nowrap;
  width: 1%;
}
.cell-edition {
  font-weight: 700;
  white-space: nowrap;
  width: 1%;
}
.cell-team {
  font-weight: 600;
  white-space: nowrap;
}
.cell-award {
  font-weight: 600;
  white-space: nowrap;
  font-size: 0.78rem;
}
.member-name {
  white-space: nowrap;
}
/* 未获个人奖：浅灰，与银奖(中灰蓝)明显区分 */
.member-plain {
  color: #a8b0b8;
  font-weight: 400;
}

/* ── 移动端参赛历史卡片（≤768px 替代六列表格）── */
.team-cards-mobile {
  display: none;
}
.m-group {
  margin-bottom: var(--space-lg);
}
.m-group-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 2px 10px;
  border-bottom: 2px solid rgba(26,115,232,0.12);
  margin-bottom: var(--space-sm);
}
.m-edition {
  font-weight: 700;
  color: var(--primary-dark);
  font-size: var(--font-size-base);
}
.m-date {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--primary);
}
.m-team-card {
  background: #fff;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-sm);
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
.m-team-name {
  font-weight: 700;
  color: var(--text);
  font-size: var(--font-size-base);
  margin-bottom: var(--space-sm);
}
.m-awards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: var(--space-sm);
}
.m-award {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 12px;
  border-radius: var(--radius-full);
  background: rgba(26,115,232,0.05);
  border: 1px solid rgba(26,115,232,0.08);
  font-size: var(--font-size-xs);
  font-weight: 700;
}
.m-award i {
  font-size: 0.7rem;
  opacity: 0.8;
}
.m-members {
  font-size: var(--font-size-sm);
  line-height: 1.9;
  color: var(--text-light);
}
.cell-level {
  white-space: nowrap;
  font-weight: 650;
  font-size: 0.78rem;
  width: 1%;
}
.level-国际 {
  color: #c79100;
}
.level-国家 {
  color: var(--primary);
}
.level-省 {
  color: #7a8b99;
}
.cell-title {
  font-weight: 600;
}
.cell-desc {
  color: var(--text-light);
}
/* 奖牌颜色 */
.medal-gold {
  color: #c79100 !important;
  font-weight: 700;
}
.medal-silver {
  color: #7a8b99 !important;
  font-weight: 600;
}
.medal-bronze {
  color: #b87333 !important;
  font-weight: 600;
}
.medal-iron {
  color: #999 !important;
}
.cell-members {
  color: var(--text-light);
  font-size: var(--font-size-sm);
}

/* ── 返回链接 ── */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-lg);
  padding: 10px 24px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(26,115,232,0.15);
  color: var(--primary);
  font-weight: 600;
  font-size: var(--font-size-sm);
  transition: all var(--transition-spring);
}
.back-link:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  transform: translateX(-4px);
  box-shadow: 0 4px 16px rgba(26,115,232,0.2);
}

/* ── 响应式 ── */
@media (max-width: 768px) {
  .comp-page {
    padding: calc(var(--header-height) + 30px) 0 var(--space-2xl);
  }
  .page-hero h1 {
    font-size: 2rem;
  }
  .comp-intro {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .comp-logo {
    width: 140px;
  }
  /* 参赛历史：表格切卡片 */
  .team-table-desktop {
    display: none;
  }
  .team-cards-mobile {
    display: block;
  }
}
@media (max-width: 576px) {
  .page-hero h1 {
    font-size: 1.7rem;
  }
}
</style>
