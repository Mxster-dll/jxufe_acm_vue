<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useJson } from '../composables/useJson'
import RosterGroup from '../components/lanqiao/RosterGroup.vue'
import {
  MEDAL_TEXT,
  RANK_TEXT,
  LEVEL_CAT,
  LEVEL_TAG,
  MEDAL_RANK,
  medalClass,
  dateTextOf,
  yearOf,
  editionLabel,
  alignName,
  subjectGroups,
  sessionGroups
} from '../utils/awardGroups.js'

const route = useRoute()
const { data: competitions, loading: compLoading, error } = useJson('/data/competitions.json', {
  initial: []
})

// ==========================================================================
// 赛事元信息（含 xcpc 运行时合并页）
// competitions.json 只保留展示元信息：名称 / logo / 简介 / 详情卡 / mode / awards
// 获奖数据一律来自 /data/awards/<file>.json，由 comp.awards 列出
// ==========================================================================
const comp = computed(() => {
  const slug = route.params.slug
  const list = competitions.value || []
  if (slug === 'xcpc') {
    const icpc = list.find((c) => c.slug === 'icpc')
    const ccpc = list.find((c) => c.slug === 'ccpc')
    if (!icpc || !ccpc) return null
    return {
      slug: 'xcpc',
      name: 'xCPC 程序设计竞赛',
      subtitle: 'ICPC × CCPC —— 国际与中国大学生程序设计竞赛',
      image: icpc.image,
      mode: 'xcpc',
      intro: [],
      details: [],
      children: [icpc, ccpc],
      awards: ['icpc', 'ccpc']
    }
  }
  return list.find((c) => c.slug === slug)
})

// ── 获奖数据：按 comp.awards 逐个加载 ──
const awardsByFile = ref({})
const awardsLoading = ref(true)

watch(
  comp,
  async (c) => {
    awardsByFile.value = {}
    if (!c) {
      awardsLoading.value = false
      return
    }
    awardsLoading.value = true
    const pairs = await Promise.all(
      (c.awards || []).map(async (f) => {
        try {
          const res = await fetch(`/data/awards/${f}.json`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return [f, await res.json()]
        } catch (e) {
          console.error(`加载 /data/awards/${f}.json 失败:`, e)
          return [f, []]
        }
      })
    )
    awardsByFile.value = Object.fromEntries(pairs)
    awardsLoading.value = false
  },
  { immediate: true }
)

const loading = computed(() => compLoading.value || awardsLoading.value)

/** 本次页面涉及的全部获奖记录（xcpc 合并页含 icpc + ccpc 两份） */
const awards = computed(() => (comp.value?.awards || []).flatMap((f) => awardsByFile.value[f] || []))

// 展示常量与工具统一放在 utils/awardGroups.js，与单届详情页共用
const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''))

// ==========================================================================
// xcpc（ICPC / CCPC）：获奖记录表
// awards 只收录获奖记录，未获奖与网络预选赛不在数据源中
// ==========================================================================
const xcpcGroups = computed(() => {
  if (comp.value?.mode !== 'xcpc') return []
  const groups = []
  const map = new Map()
  for (const row of awards.value.filter((r) => r.competition_name).sort(byDateDesc)) {
    const key = `${row.date}|${row.competition_name}`
    if (!map.has(key)) {
      map.set(key, {
        date: row.date,
        dateText: dateTextOf(row.date, ''),
        title: row.competition_name,
        cat: LEVEL_CAT[row.medal_level] || 'reg',
        rows: []
      })
      groups.push(map.get(key))
    }
    const group = map.get(key)
    // 同一支队伍可能同时拿到邀请赛与省赛（「CCPC 全国邀请赛（南昌）暨江西省赛」在
    // 2026-05-24 就是同队同名同天两条：一条 invitational、一条 provincial），
    // 数据里是两行 —— 这里按队伍合并成一行，获奖栏渲染两枚胶囊。
    // 组合键带上成员，避免队名为空时不同的队伍被并到一起。
    const teamKey = `${row.team_name || ''}|${(row.members || []).join('、')}`
    let team = group.rows.find((t) => t.key === teamKey)
    if (!team) {
      team = { key: teamKey, team_name: row.team_name, members: row.members || [], awards: [] }
      group.rows.push(team)
    }
    team.awards.push({ medal: row.medal_type, level: row.medal_level })
  }
  return groups
})
const xcpcRows = computed(() => xcpcGroups.value.flatMap((g) => g.rows))

// ==========================================================================
// 天梯赛（国赛）：六列表 —— 日期 / 届数 / 队名 / 国赛 / 省赛 / 参赛成员
// 团队奖来自 awards/gplt-team.json，个人奖来自 awards/gplt-individual.json
// （个人奖只用于给成员姓名着色）
// ==========================================================================
const gpltGroups = computed(() => {
  if (comp.value?.mode !== 'gplt') return []
  const teams = awardsByFile.value['gplt-team'] || []
  const individuals = awardsByFile.value['gplt-individual'] || []

  const personalMap = new Map()
  for (const p of individuals) {
    const n = p.members && p.members[0]
    if (n && !personalMap.has(n)) personalMap.set(n, p.medal_type)
  }

  const bySession = new Map()
  for (const t of teams) {
    if (!bySession.has(t.session)) bySession.set(t.session, [])
    bySession.get(t.session).push(t)
  }

  return [...bySession.keys()]
    .sort((a, b) => b - a)
    .map((session) => {
      const list = bySession.get(session)
      const date = list.map((t) => t.date).filter(Boolean).sort()[0] || null
      const rows = list
        .slice()
        .sort((a, b) => (MEDAL_RANK[a.medal_type] ?? 9) - (MEDAL_RANK[b.medal_type] ?? 9))
        .map((t) => ({
          team_name: t.team_name,
          national: t.medal_type,
          provincial: null,
          members: (t.members || []).map((name) => ({
            name,
            medal: personalMap.get(name) || null
          }))
        }))
      return {
        session,
        edition: editionLabel(session),
        // 数据源无该届日期时留空（不推测年份）
        dateText: dateTextOf(date, ''),
        rows
      }
    })
})

/** 成员个人奖 → 姓名配色（无个人奖用默认色） */
function memberAwardClass(medal) {
  return medalClass(medal) || 'member-plain'
}

/** 合并后的一行里最好的那枚奖牌（卡片配色取它） */
function bestMedal(row) {
  return (
    (row.awards || [])
      .slice()
      .sort((a, b) => (MEDAL_RANK[a.medal] ?? 9) - (MEDAL_RANK[b.medal] ?? 9))[0]?.medal || ''
  )
}

// ==========================================================================
// 分组名单（蓝桥杯 / 百度之星）
// 届 → 国赛/省赛 两卡 → （蓝桥杯按 语言×组别 / 百度之星按场次日期）→ 奖等 → 姓名
// ==========================================================================
// css 用于沿用原有的环节卡配色钩子（lanqiao: lq-national/lq-provincial，
// baidu: lq-bd-final/lq-bd-preliminary）
// 赛事简称（用于届次标题）取自 competitions.json 的 shortName
const ROSTER_META = {
  lanqiao: {
    stages: [
      { level: 'national', label: '国赛', icon: 'fa-solid fa-trophy', css: 'national' },
      { level: 'provincial', label: '省赛', icon: 'fa-solid fa-medal', css: 'provincial' }
    ],
    awardText: RANK_TEXT,
    bySubject: true
  },
  baidu: {
    stages: [
      { level: 'national', label: '决赛', icon: 'fa-solid fa-trophy', css: 'bd-final' },
      { level: 'provincial', label: '初赛', icon: 'fa-solid fa-medal', css: 'bd-preliminary' }
    ],
    awardText: MEDAL_TEXT,
    bySubject: false
  }
}

const rosterYears = computed(() => {
  const meta = ROSTER_META[comp.value?.slug]
  if (comp.value?.mode !== 'roster' || !meta) return []

  const bySession = new Map()
  for (const r of awards.value) {
    if (!bySession.has(r.session)) bySession.set(r.session, [])
    bySession.get(r.session).push(r)
  }

  return [...bySession.keys()]
    .sort((a, b) => b - a)
    .map((session) => {
      const all = bySession.get(session)
      const year = yearOf(all.map((r) => r.date).filter(Boolean).sort()[0])
      const stages = meta.stages.map((st) => {
        const stageRows = all.filter((r) => r.medal_level === st.level)
        return {
          key: st.level,
          cssKey: st.css,
          label: st.label,
          icon: st.icon,
          total: stageRows.length,
          date: stageRows.map((r) => r.date).filter(Boolean).sort()[0] || '',
          groups: meta.bySubject
            ? subjectGroups(stageRows, meta.awardText)
            : sessionGroups(stageRows, meta.awardText)
        }
      })
      return {
        session,
        edition: editionLabel(session),
        year,
        total: all.length,
        stages
      }
    })
})

// ── 参赛历史小节标题 ──
const sectionTitle = computed(() => {
  const m = comp.value?.mode
  if (m === 'roster') return comp.value?.slug === 'baidu' ? '我校百度之星获奖名单' : '我校蓝桥杯获奖总名单'
  return '我校参赛历史'
})

const hasTableData = computed(() =>
  comp.value?.mode === 'xcpc' ? xcpcGroups.value.length > 0 : gpltGroups.value.length > 0
)

// ── 参赛历史视图模式：表格 / 卡片（桌面端默认表格，移动端默认卡片，localStorage 记忆）──
const viewMode = ref('table')
const VIEW_KEY = 'jufc-history-view'

onMounted(() => {
  let saved = null
  try {
    saved = localStorage.getItem(VIEW_KEY)
  } catch (e) {}
  viewMode.value =
    saved === 'table' || saved === 'card'
      ? saved
      : window.matchMedia('(max-width: 768px)').matches
        ? 'card'
        : 'table'
})

watch(viewMode, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch (e) {}
})

function setView(v) {
  viewMode.value = v
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

        <!-- 简介：xCPC 合并页 → ICPC / CCPC 分开介绍 -->
        <section v-if="comp.children && comp.children.length" class="comp-intro-block">
          <div v-for="child in comp.children" :key="child.slug" class="comp-intro">
            <img :src="child.image" :alt="child.name" class="comp-logo" />
            <div class="intro-text">
              <h2>{{ child.name }}</h2>
              <p v-for="(p, i) in child.intro" :key="i">{{ p }}</p>
            </div>
          </div>
        </section>
        <!-- 简介 -->
        <section v-else class="comp-intro">
          <img :src="comp.image" :alt="comp.name" class="comp-logo" />
          <div class="intro-text">
            <h2>竞赛简介</h2>
            <p v-for="(p, i) in comp.intro" :key="i">{{ p }}</p>
          </div>
        </section>

        <!-- 详情卡片：xCPC 合并页 → ICPC / CCPC 分开介绍 -->
        <section v-if="comp.children && comp.children.length" class="comp-details-block">
          <div v-for="child in comp.children" :key="child.slug" class="detail-group">
            <h3 class="detail-group-title">{{ child.name }}</h3>
            <div class="comp-details">
              <div
                v-for="(d, i) in child.details"
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
            </div>
          </div>
        </section>
        <!-- 详情卡片 -->
        <section v-else class="comp-details">
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
          <div class="history-toolbar">
            <h2 class="section-label"><i class="fas fa-timeline"></i> {{ sectionTitle }}</h2>
            <div v-if="hasTableData" class="view-toggle" role="group" aria-label="切换视图">
              <button type="button" class="view-btn" :class="{ active: viewMode === 'table' }" @click="setView('table')" title="表格视图"><i class="fa-solid fa-table-list"></i> 表格</button>
              <button type="button" class="view-btn" :class="{ active: viewMode === 'card' }" @click="setView('card')" title="卡片视图"><i class="fa-solid fa-table-cells-large"></i> 卡片</button>
            </div>
          </div>

          <!-- 分组名单（蓝桥杯 / 百度之星）：届 → 国赛/省赛两卡 → 分组 → 奖等 → 姓名 -->
          <template v-if="comp.mode === 'roster'">
            <p v-if="!rosterYears.length" class="empty">暂无获奖记录</p>
            <div v-else class="lq-list">
              <div v-for="y in rosterYears" :key="y.session" class="lq-year">
                <div class="lq-year-head">
                  <h3>{{ y.edition }}{{ comp.shortName }}（{{ y.year }}年）</h3>
                  <span class="lq-count">{{ y.total }} 人次</span>
                </div>
                <div v-for="st in y.stages" :key="st.key" class="lq-stage-card" :class="'lq-' + st.cssKey">
                  <div class="lq-stage-head">
                    <h4 class="lq-stage-title">
                      <i :class="st.icon"></i>
                      {{ st.label }}
                      <span v-if="st.date" class="lq-stage-date">{{ st.date }}</span>
                    </h4>
                    <span class="lq-count">{{ st.total }} 人次</span>
                  </div>
                  <RosterGroup v-if="st.groups.length" :groups="st.groups" />
                  <p v-else class="empty">本届无{{ st.label }}获奖记录</p>
                </div>
              </div>
            </div>
          </template>

          <p v-else-if="!hasTableData" class="empty">暂无参赛记录</p>
          <div v-else class="history-table-wrap" v-reveal="{ variant: 'fade-up', threshold: 0.01, rootMargin: '0px 0px 100px 0px' }">
            <table class="history-table" :class="{ 'view-hidden': viewMode !== 'table' }">
              <thead>
                <tr>
                  <template v-if="gpltGroups.length">
                    <th>日期</th>
                    <th>届数</th>
                    <th>队名</th>
                    <th>国赛</th>
                    <th>省赛</th>
                    <th>参赛成员</th>
                  </template>
                  <template v-else>
                    <th>日期</th>
                    <th>赛事</th>
                    <th>队名</th>
                    <th>成绩</th>
                    <th>参赛成员</th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <!-- 天梯赛式（团队奖）：按届分组，合并日期 / 届数格 -->
                <template v-if="gpltGroups.length">
                  <template v-for="g in gpltGroups" :key="g.session">
                    <tr v-for="(t, ti) in g.rows" :key="t.team_name">
                      <td v-if="ti === 0" class="cell-year" :rowspan="g.rows.length">{{ g.dateText }}</td>
                      <td v-if="ti === 0" class="cell-edition" :rowspan="g.rows.length">{{ g.edition }}</td>
                      <td class="cell-team">{{ t.team_name }}</td>
                      <td class="cell-award" :class="medalClass(t.national)">{{ RANK_TEXT[t.national] || '—' }}</td>
                      <td class="cell-award" :class="medalClass(t.provincial)">{{ t.provincial ? RANK_TEXT[t.provincial] : '—' }}</td>
                      <td class="cell-members">
                        <template v-if="t.members.length">
                          <span
                            v-for="(m, mi) in t.members"
                            :key="mi"
                            class="member-name"
                            :class="memberAwardClass(m.medal)"
                            :title="m.medal ? MEDAL_TEXT[m.medal] : '未获个人奖'"
                          >{{ alignName(m.name) }}<template v-if="mi < t.members.length - 1">、</template></span>
                        </template>
                        <span v-else class="member-name member-plain">—</span>
                      </td>
                    </tr>
                  </template>
                </template>
                <!-- xcpc：按场次分组，rowspan 合并日期 / 赛事列 -->
                <template v-else>
                  <template v-for="g in xcpcGroups" :key="g.date + '|' + g.title">
                    <tr v-for="(row, ri) in g.rows" :key="row.key" :class="'row-' + g.cat">
                      <td v-if="ri === 0" class="cell-year" :rowspan="g.rows.length">{{ g.dateText }}</td>
                      <td v-if="ri === 0" class="cell-title" :rowspan="g.rows.length">{{ g.title }}</td>
                      <td class="cell-team">{{ row.team_name || '—' }}</td>
                      <td class="cell-desc">
                        <span v-for="(a, ai) in row.awards" :key="ai" class="award-chip" :class="'chip-' + a.medal">{{ MEDAL_TEXT[a.medal] }}<i class="chip-tag">{{ LEVEL_TAG[a.level] || '' }}</i></span>
                      </td>
                      <td class="cell-members">
                        <template v-if="row.members && row.members.length">
                          <span
                            v-for="(m, mi) in row.members"
                            :key="mi"
                            class="member-name"
                          ><template v-if="mi > 0">、</template>{{ alignName(m) }}</span>
                        </template>
                        <span v-else class="member-name member-plain">—</span>
                      </td>
                    </tr>
                  </template>
                </template>
              </tbody>
            </table>

            <!-- 卡片视图（桌面/移动均可用；移动端默认，可切换） -->
            <div v-if="hasTableData" class="team-cards-mobile" :class="{ 'view-hidden': viewMode !== 'card' }">
              <!-- 天梯赛式 -->
              <div v-for="g in gpltGroups" :key="'m' + g.session" class="m-group">
                <div class="m-group-head">
                  <span class="m-edition">{{ g.edition }}</span>
                  <span class="m-date">{{ g.dateText }}</span>
                </div>
                <div v-for="t in g.rows" :key="t.team_name" class="m-team-card">
                  <div class="m-team-name">{{ t.team_name }}</div>
                  <div class="m-awards">
                    <span class="m-award" :class="medalClass(t.national)">
                      <i class="fa-solid fa-flag"></i> 国赛 {{ RANK_TEXT[t.national] || '—' }}
                    </span>
                    <span class="m-award" :class="medalClass(t.provincial)">
                      <i class="fa-solid fa-map-location-dot"></i> 省赛 {{ t.provincial ? RANK_TEXT[t.provincial] : '—' }}
                    </span>
                  </div>
                  <div class="m-members">
                    <template v-if="t.members.length">
                      <span
                        v-for="(m, mi) in t.members"
                        :key="mi"
                        class="member-name"
                        :class="memberAwardClass(m.medal)"
                        :title="m.medal ? MEDAL_TEXT[m.medal] : '未获个人奖'"
                      >{{ alignName(m.name) }}<template v-if="mi < t.members.length - 1">、</template></span>
                    </template>
                    <span v-else class="member-name member-plain">—</span>
                  </div>
                </div>
              </div>
              <!-- xcpc：按场次分组 -->
              <div v-for="g in xcpcGroups" :key="'mg' + g.date + '|' + g.title" class="m-group">
                <div class="m-group-head">
                  <span class="m-edition">{{ g.title }}</span>
                  <span class="m-date">{{ g.dateText }}</span>
                </div>
                <div v-for="row in g.rows" :key="'mr' + row.key" class="m-team-card m-team-card--event" :class="'tone-' + bestMedal(row)">
                  <div class="m-team-name">{{ row.team_name || '—' }}</div>
                  <div class="m-awards">
                    <span v-for="(a, ai) in row.awards" :key="ai" class="m-award" :class="'chip-' + a.medal"><i class="fa-solid fa-trophy"></i> {{ MEDAL_TEXT[a.medal] }} <span class="chip-tag">{{ LEVEL_TAG[a.level] || '' }}</span></span>
                  </div>
                  <div class="m-fields">
                    <p class="m-field"><strong>参赛成员：</strong>
                      <template v-if="row.members && row.members.length">
                        <span
                          v-for="(m, mi) in row.members"
                          :key="mi"
                          class="member-name"
                        ><template v-if="mi > 0">、</template>{{ alignName(m) }}</span>
                      </template>
                      <span v-else class="member-name member-plain">—</span>
                    </p>
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

/* xCPC 合并页：ICPC / CCPC 简介与详情分开介绍 */
.comp-intro-block {
  margin-bottom: var(--space-2xl);
}
.comp-intro-block .comp-intro {
  margin-bottom: var(--space-xl);
}
.comp-intro-block .comp-intro:last-child {
  margin-bottom: 0;
}
.comp-intro-block .comp-intro + .comp-intro {
  padding-top: var(--space-xl);
  border-top: 1px dashed rgba(0,0,0,0.1);
}
.comp-details-block {
  margin-bottom: var(--space-2xl);
}
.detail-group {
  margin-bottom: var(--space-xl);
}
.detail-group:last-child {
  margin-bottom: 0;
}
.detail-group .comp-details {
  margin-bottom: 0;
}
.detail-group-title {
  display: inline-block;
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text);
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-sm);
  border-bottom: 2px solid rgba(26,115,232,0.12);
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
/* 标题行 + 视图切换（表格/卡片） */
.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.history-toolbar .section-label {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}
/* .view-toggle / .view-btn / .view-hidden 已提到 styles/view-toggle.css（全局）——
   会长 2026-09-23 要求「荣誉显示」也复用同一套，两处样式从此同源，不要再拷回这里。 */

/* ── 蓝桥杯总名单（个人赛：姓名/科目/奖项，按年分组；每年国赛/省赛两个卡片）── */
.lq-list {
  width: 100%;
}
.lq-year {
  margin-bottom: var(--space-2xl);
}
/* 年份标题（非卡片，置于两个阶段卡片之上） */
.lq-year-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-sm);
}
.lq-year-head h3 {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--primary-dark);
}
.lq-count {
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
/* 阶段卡片：国赛/省赛各一张卡 */
.lq-stage-card {
  background: #fff;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-md);
  box-shadow: 0 2px 10px rgba(0,0,0,0.03);
}
.lq-stage-card.lq-national {
  border-left: 4px solid var(--accent);
}
.lq-stage-card.lq-provincial {
  border-left: 4px solid var(--primary);
}
/* 百度之星环节卡：决赛(accent,同国赛) / 初赛(primary,同省赛) */
.lq-stage-card.lq-bd-final {
  border-left: 4px solid var(--accent);
}
.lq-stage-card.lq-bd-preliminary {
  border-left: 4px solid var(--primary);
}
.lq-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  padding-bottom: var(--space-sm);
  margin-bottom: var(--space-sm);
  border-bottom: 2px solid rgba(26,115,232,0.12);
}
.lq-stage-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text);
}
.lq-stage-title i {
  font-size: 0.85rem;
  color: var(--primary);
  opacity: 0.8;
}
.lq-stage-card.lq-national .lq-stage-title i {
  color: var(--accent);
}
.lq-stage-card.lq-bd-final .lq-stage-title i {
  color: var(--accent);
}
.lq-stage-card.lq-bd-preliminary .lq-stage-title i {
  color: var(--primary);
}
.lq-stage-date {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  padding: 1px 10px;
  border-radius: var(--radius-full);
  background: rgba(0,0,0,0.04);
  white-space: nowrap;
}
/* 卡片视图：外层无框线（卡片自带边框，避免双重框线）。
   注意：不能用 JS 动态 class 控制（Vue 整体赋值 className 会抹掉 v-reveal 加的 is-visible），
   用 :has() 按"卡片视图可见"的结构状态判定 */
.history-table-wrap:has(.team-cards-mobile:not(.view-hidden)) {
  border: none;
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

/* ── 卡片视图（桌面/移动共用；显隐由 .view-hidden 控制）── */
.team-cards-mobile {
  width: 100%;
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
  transition: box-shadow var(--transition);
}
.m-team-card:hover {
  box-shadow: 0 6px 24px rgba(26,115,232,0.06);
}
/* 通用式参赛记录卡片：新闻页 award-card 样式（奖牌色左框线 + 渐变背景） */
.m-team-card--event {
  margin-bottom: var(--space-md);
  border: 1px solid rgba(0,0,0,0.05);
}
.m-team-card--event.tone-gold {
  border-left: 6px solid #d4a72c;
  background: linear-gradient(90deg, rgba(212,167,44,0.05), #fff 45%);
}
.m-team-card--event.tone-silver {
  border-left: 6px solid #a8a9ad;
  background: linear-gradient(90deg, rgba(168,169,173,0.07), #fff 45%);
}
.m-team-card--event.tone-bronze {
  border-left: 6px solid #cd7f32;
  background: linear-gradient(90deg, rgba(205,127,50,0.06), #fff 45%);
}
.m-team-card--event .m-team-name {
  color: var(--primary);
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
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
.m-award.chip-grand { background: rgba(198, 40, 40, 0.12); color: #c62828; border-color: rgba(198, 40, 40, 0.4); }
.m-award.chip-gold { background: rgba(199, 145, 0, 0.12); color: #b8860b; border-color: rgba(199, 145, 0, 0.4); }
.m-award.chip-silver { background: rgba(122, 139, 153, 0.13); color: #64717e; border-color: rgba(122, 139, 153, 0.4); }
.m-award.chip-bronze { background: rgba(184, 115, 51, 0.14); color: #a35e2b; border-color: rgba(184, 115, 51, 0.4); }
.m-award.chip-none { background: rgba(0,0,0,0.03); color: var(--text-muted); border-color: rgba(0,0,0,0.08); font-weight: 500; }
.m-award i {
  font-size: 0.7rem;
  opacity: 0.8;
}
/* 卡片字段行（新闻页 award-card 同款：label：value） */
.m-fields p {
  margin: 6px 0;
  font-size: var(--font-size-sm);
  color: var(--text-light);
  line-height: 1.8;
}
.m-fields strong {
  color: var(--text);
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
/* 赛事类别 → 表格行背景（淡色区分，同场多队整行同色） */
.history-table tbody tr.row-inv { background: rgba(30, 136, 229, 0.055); }
.history-table tbody tr.row-inv:hover { background: rgba(30, 136, 229, 0.11); }
.history-table tbody tr.row-reg { background: rgba(124, 77, 255, 0.055); }
.history-table tbody tr.row-reg:hover { background: rgba(124, 77, 255, 0.11); }
.history-table tbody tr.row-net { background: rgba(0, 172, 193, 0.055); }
.history-table tbody tr.row-net:hover { background: rgba(0, 172, 193, 0.11); }
.history-table tbody tr.row-prov { background: rgba(67, 160, 71, 0.06); }
.history-table tbody tr.row-prov:hover { background: rgba(67, 160, 71, 0.12); }
/* 成绩徽章：按奖项着色（金奖/银奖/铜奖），无奖项为中性灰 */
.award-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 700;
  white-space: nowrap;
}
.award-chip + .award-chip {
  margin-left: 6px;
}
.chip-tag {
  font-style: normal;
  font-weight: 500;
  font-size: 0.68rem;
  opacity: 0.75;
}
.chip-grand {
  background: rgba(198, 40, 40, 0.12);
  color: #c62828;
  border: 1px solid rgba(198, 40, 40, 0.4);
}
.chip-gold {
  background: rgba(199, 145, 0, 0.12);
  color: #b8860b;
  border: 1px solid rgba(199, 145, 0, 0.4);
}
.chip-silver {
  background: rgba(122, 139, 153, 0.13);
  color: #64717e;
  border: 1px solid rgba(122, 139, 153, 0.4);
}
.chip-bronze {
  background: rgba(184, 115, 51, 0.14);
  color: #a35e2b;
  border: 1px solid rgba(184, 115, 51, 0.4);
}
.chip-none {
  background: rgba(0,0,0,0.03);
  color: var(--text-muted);
  border: 1px solid rgba(0,0,0,0.08);
  font-weight: 500;
}
/* 奖牌颜色 */
.medal-grand {
  color: #d32f2f !important;
  font-weight: 700;
}
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
}
@media (max-width: 576px) {
  .page-hero h1 {
    font-size: 1.7rem;
  }
}
</style>
