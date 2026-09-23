<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useJson } from '../composables/useJson'
import RosterGroup from '../components/lanqiao/RosterGroup.vue'
import {
  MEDAL_TEXT,
  RANK_TEXT,
  medalClass,
  fmtCnDate,
  editionLabel,
  subjectGroups
} from '../utils/awardGroups.js'

const route = useRoute()
const { data: competitions } = useJson('/data/competitions.json', { initial: [] })

const comp = computed(() => (competitions.value || []).find((c) => c.slug === route.params.slug))

// 该届获奖记录
// 路由参数是自然年 <year>，而 awards 以 session（届数）标识届次；
// 年份 → 届数 的对照表就在 competitions.json 的 sessions 字段里（无需额外请求）。
const loading = ref(true)
const error = ref(false)
const records = ref([])

const session = computed(() => {
  const c = comp.value
  const year = route.params.year
  if (!c || !year) return null
  return c.sessions?.[String(year)] ?? null
})

watch(
  [comp, () => route.params.year],
  async ([c, year]) => {
    loading.value = true
    error.value = false
    records.value = []
    if (!c || !year) {
      loading.value = false
      return
    }
    try {
      const lists = await Promise.all(
        (c.awards || []).map((f) =>
          fetch(`/data/awards/${f}.json`)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
        )
      )
      records.value = lists.flat()
    } catch (e) {
      console.error(`加载 /competition/${c.slug}/${year} 失败:`, e)
      error.value = true
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

const rows = computed(() =>
  session.value == null ? [] : records.value.filter((r) => r.session === session.value)
)

const isGplt = computed(() => comp.value?.slug === 'gplt')
const isLanqiao = computed(() => comp.value?.slug === 'lanqiao')

// 天梯赛团队奖的数据源只收录国赛，没有 medal_level 字段；其余赛事按 medal_level 分国赛/省赛
const nationalRows = computed(() =>
  isGplt.value ? rows.value : rows.value.filter((r) => r.medal_level === 'national')
)
const provincialRows = computed(() =>
  isGplt.value ? [] : rows.value.filter((r) => r.medal_level === 'provincial')
)

const teamsOf = (list) => list.filter((r) => r.team_name)
const personalOf = (list) => list.filter((r) => !r.team_name && r.members && r.members.length)

const nationalTeams = computed(() => teamsOf(nationalRows.value))
const provincialTeams = computed(() => teamsOf(provincialRows.value))
const nationalPersonal = computed(() => personalOf(nationalRows.value))
const provincialPersonal = computed(() => personalOf(provincialRows.value))
const hasNational = computed(() => nationalRows.value.length > 0)
const hasProvincial = computed(() => provincialRows.value.length > 0)
const noAward = computed(() => !!comp.value && !hasNational.value && !hasProvincial.value)

/** 届次标题：第十一届团体程序设计天梯赛 / 第十七届蓝桥杯 / 第二十二届百度之星 */
const pageTitle = computed(() => {
  const c = comp.value
  if (!c) return ''
  const short = c.shortName || c.name
  const label = editionLabel(session.value)
  return label ? `${label}${short}` : short
})

const firstDate = (list) => list.map((r) => r.date).filter(Boolean).sort()[0] || null

/** 举办日期：蓝桥杯省赛 / 总决赛分列，其余赛事取该届日期 */
const dateText = computed(() => {
  if (isLanqiao.value) {
    const parts = []
    const p = fmtCnDate(firstDate(provincialRows.value))
    const n = fmtCnDate(firstDate(nationalRows.value))
    if (p) parts.push('省赛 ' + p)
    if (n) parts.push('总决赛 ' + n)
    return parts.join(' · ') || '日期待考'
  }
  const d = firstDate(rows.value)
  return d ? new Date(d).toLocaleDateString('zh-CN') : '日期待考'
})

/** 团队奖文案：天梯赛国赛沿用「全国团队X等奖」措辞 */
function teamAwardText(t) {
  const rank = RANK_TEXT[t.medal_type] || MEDAL_TEXT[t.medal_type] || ''
  return isGplt.value ? `全国团队${rank}` : rank
}

/** 个人奖文案：天梯赛沿用「个人X等奖」措辞 */
function personalAwardText(p) {
  const rank = RANK_TEXT[p.medal_type] || MEDAL_TEXT[p.medal_type] || ''
  return isGplt.value ? `个人${rank}` : rank
}

/** 蓝桥杯个人奖按 语言 × 组别 分组 */
const personalGroups = (list) => subjectGroups(list, RANK_TEXT)

/** 奖牌色样式（复用 old 的 award-gold / award-silver / award-bronze） */
function awardClass(medal) {
  return medalClass(medal).replace('medal-', 'award-')
}
</script>

<template>
  <main class="event-page container-fluid">
    <!-- 装饰光斑 -->
    <div class="decorative-orb decorative-orb--primary" style="width:500px;height:500px;top:-200px;right:-150px;opacity:0.06"></div>
    <div class="decorative-orb decorative-orb--accent" style="width:350px;height:350px;bottom:15%;left:-120px;opacity:0.04"></div>

    <div class="container event-inner">
      <!-- Loading / Error -->
      <div v-if="loading" class="skeleton-list">
        <div class="skeleton" style="height:60px;width:60%;border-radius:var(--radius-md);margin:0 auto var(--space-md);"></div>
        <div class="skeleton" style="height:24px;width:40%;border-radius:var(--radius-md);margin:0 auto var(--space-xl);"></div>
        <div v-for="n in 6" :key="n" class="skeleton" style="height:80px;border-radius:var(--radius-md);margin-bottom:var(--space-md);"></div>
      </div>
      <p v-else-if="error" class="hint">加载失败</p>
      <p v-else-if="!comp || session == null" class="hint">未找到该届比赛</p>

      <template v-else>
        <!-- 标题区 -->
        <header class="event-hero">
          <p class="event-label">COMPETITION EVENT</p>
          <h1>{{ pageTitle }}</h1>
          <div class="header-divider"></div>
          <p class="event-subtitle">
            <i class="fa-regular fa-calendar"></i> 举办日期：{{ dateText }}
          </p>
        </header>

        <!-- 无获奖记录 -->
        <section v-if="noAward" class="no-award">
          <i class="fa-regular fa-face-meh"></i>
          <p>本届无我校获奖记录</p>
        </section>

        <template v-else>
          <!-- 国赛获奖情况 -->
          <section class="award-section" :class="isLanqiao ? 'lq-award-card lq-national' : ''">
            <h2 class="section-label"><i class="fa-solid fa-trophy"></i> 国赛获奖情况<span v-if="isLanqiao && firstDate(nationalRows)" class="lq-stage-date">{{ fmtCnDate(firstDate(nationalRows)) }}</span></h2>

            <p v-if="!hasNational" class="empty">本届无获奖记录</p>
            <template v-else>
              <!-- 团队奖 -->
              <div v-if="nationalTeams.length" class="team-grid">
                <div v-for="(t, i) in nationalTeams" :key="i" class="team-card">
                  <span class="award-badge" :class="awardClass(t.medal_type)">{{ teamAwardText(t) }}</span>
                  <h4>{{ t.team_name }}</h4>
                  <p v-if="t.members && t.members.length" class="team-members"><span class="label">成员</span>{{ t.members.join('、') }}</p>
                </div>
              </div>

              <!-- 个人奖 -->
              <div v-if="nationalPersonal.length" class="personal-wrap">
                <!-- 蓝桥杯：按 语言 × 组别 分组名单 -->
                <template v-if="isLanqiao">
                  <RosterGroup :groups="personalGroups(nationalPersonal)" />
                </template>
                <!-- 其他赛事：表格 + 移动端卡片 -->
                <template v-else>
                  <h3 class="sub-label"><i class="fa-solid fa-user"></i> 个人奖</h3>
                  <div class="table-wrap">
                    <table class="personal-table">
                      <thead>
                        <tr><th>姓名</th><th>奖项</th><th>成绩</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="(p, i) in nationalPersonal" :key="i">
                          <td>{{ p.members[0] }}</td>
                          <td :class="awardClass(p.medal_type)">{{ personalAwardText(p) }}</td>
                          <td class="cell-score">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <!-- 移动端：双列卡片 -->
                  <div class="personal-grid">
                    <div v-for="(p, i) in nationalPersonal" :key="'g' + i" class="p-chip">
                      <span class="p-name" :class="awardClass(p.medal_type)">{{ p.members[0] }}</span>
                      <span class="p-award">{{ personalAwardText(p) }}</span>
                      <span class="p-score">—</span>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </section>

          <!-- 省赛获奖情况 -->
          <section class="award-section" :class="isLanqiao ? 'lq-award-card lq-provincial' : ''">
            <h2 class="section-label"><i class="fa-solid fa-medal"></i> 省赛获奖情况<span v-if="isLanqiao && firstDate(provincialRows)" class="lq-stage-date">{{ fmtCnDate(firstDate(provincialRows)) }}</span></h2>

            <p v-if="!hasProvincial" class="empty">本届无获奖记录</p>
            <template v-else>
              <!-- 团队奖 -->
              <div v-if="provincialTeams.length" class="team-grid">
                <div v-for="(t, i) in provincialTeams" :key="i" class="team-card">
                  <span class="award-badge" :class="awardClass(t.medal_type)">{{ teamAwardText(t) }}</span>
                  <h4>{{ t.team_name }}</h4>
                  <p v-if="t.members && t.members.length" class="team-members"><span class="label">成员</span>{{ t.members.join('、') }}</p>
                </div>
              </div>

              <!-- 个人奖 -->
              <div v-if="provincialPersonal.length" class="personal-wrap">
                <template v-if="isLanqiao">
                  <RosterGroup :groups="personalGroups(provincialPersonal)" />
                </template>
                <template v-else>
                  <h3 class="sub-label"><i class="fa-solid fa-user"></i> 个人奖</h3>
                  <div class="table-wrap">
                    <table class="personal-table">
                      <thead>
                        <tr><th>姓名</th><th>奖项</th><th>成绩</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="(p, i) in provincialPersonal" :key="i">
                          <td>{{ p.members[0] }}</td>
                          <td :class="awardClass(p.medal_type)">{{ personalAwardText(p) }}</td>
                          <td class="cell-score">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="personal-grid">
                    <div v-for="(p, i) in provincialPersonal" :key="'g' + i" class="p-chip">
                      <span class="p-name" :class="awardClass(p.medal_type)">{{ p.members[0] }}</span>
                      <span class="p-award">{{ personalAwardText(p) }}</span>
                      <span class="p-score">—</span>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </section>
        </template>

        <div class="event-links">
          <RouterLink to="/all-action" class="back-link">
            <i class="fa-solid fa-arrow-left"></i> 返回大事记
          </RouterLink>
          <RouterLink :to="`/competition/${comp.slug}`" class="intro-link">
            查看{{ comp.name || '该赛事' }}介绍 <i class="fa-solid fa-arrow-right"></i>
          </RouterLink>
        </div>
      </template>
    </div>
  </main>
</template>

<style scoped>
/* ==========================================================================
   单届比赛详情页（风格与大事记详情页/竞赛详情页统一）
   ========================================================================== */
.event-page {
  position: relative;
  overflow: clip;
  min-height: 100vh;
  margin-top: calc(-1 * var(--header-height));
  padding: calc(var(--header-height) + 60px) 0 var(--space-3xl);
  background:
    radial-gradient(ellipse 600px 400px at 80% 5%, rgba(26,115,232,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 400px 300px at 15% 90%, rgba(255,152,0,0.03) 0%, transparent 60%),
    linear-gradient(175deg, #f8fafc 0%, #fff 35%, #fff 100%);
}
.event-inner {
  position: relative;
  z-index: 1;
  width: 90%;
  margin: 0 auto;
  max-width: 960px;
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
.event-hero {
  text-align: center;
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid rgba(0,0,0,0.08);
}
.event-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 4px;
  color: var(--primary);
  font-weight: 700;
  margin-bottom: 8px;
}
.event-hero h1 {
  font-size: 2.2rem;
  font-weight: 700;
  color: var(--primary-dark);
  line-height: var(--line-height-tight);
  margin-bottom: var(--space-md);
}
.header-divider {
  width: 60px;
  height: 3px;
  margin: 0 auto var(--space-md);
  border-radius: 2px;
  background: linear-gradient(90deg, var(--primary), var(--accent));
}
.event-subtitle {
  font-size: var(--font-size-base);
  color: var(--text-muted);
}
.event-subtitle i {
  color: var(--primary);
  margin-right: 4px;
}

/* ── 参赛规模 ── */
.scale-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl);
  margin-bottom: var(--space-2xl);
  background: linear-gradient(135deg, rgba(26,115,232,0.06), rgba(26,115,232,0.02));
  border: 1px solid rgba(26,115,232,0.12);
  border-radius: var(--radius-lg);
}
.scale-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: #fff;
  font-size: 1.1rem;
}
.scale-text h3 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--primary-dark);
  margin-bottom: 4px;
}
.scale-text p {
  font-size: var(--font-size-base);
  color: var(--text);
  line-height: 1.6;
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

.award-section {
  margin-bottom: var(--space-2xl);
}
/* 蓝桥杯详情页：国赛/省赛各套一张卡片（与总页风格一致） */
.award-section.lq-award-card {
  background: #fff;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg) var(--space-sm);
  box-shadow: 0 2px 10px rgba(0,0,0,0.03);
}
.award-section.lq-award-card.lq-national {
  border-left: 4px solid var(--accent);
}
.award-section.lq-award-card.lq-provincial {
  border-left: 4px solid var(--primary);
}
.award-section.lq-award-card .section-label {
  margin-bottom: var(--space-md);
  border-bottom: 2px solid rgba(26,115,232,0.12);
  color: var(--text);
  text-transform: none;
  letter-spacing: 0;
  font-size: var(--font-size-base);
}
.award-section.lq-award-card .section-label i {
  color: var(--primary);
}
.award-section.lq-award-card.lq-national .section-label i {
  color: var(--accent);
}
/* 节标题内的比赛日期徽章（蓝桥杯：省赛/国赛各自日期） */
.lq-stage-date {
  margin-left: auto;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  padding: 1px 10px;
  border-radius: var(--radius-full);
  background: rgba(0,0,0,0.04);
  white-space: nowrap;
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-lg) 0;
  font-size: var(--font-size-sm);
}

/* ── 无获奖记录 ── */
.no-award {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-2xl) 0;
}
.no-award i {
  font-size: 2.5rem;
  opacity: 0.3;
  display: block;
  margin-bottom: var(--space-md);
}
.no-award p {
  font-size: var(--font-size-base);
}

/* ── 高校奖 ── */
.uni-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}
.uni-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: linear-gradient(135deg, rgba(255,152,0,0.08), rgba(255,152,0,0.02));
  border: 1px solid rgba(255,152,0,0.2);
  border-radius: var(--radius-full);
  font-weight: 700;
  font-size: var(--font-size-sm);
  color: #8a5a00;
}
.uni-chip i { color: #c79100; }

/* ── 团队奖 ── */
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
.team-card {
  padding: var(--space-lg);
  background: #fff;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: var(--radius-lg);
  box-shadow: 0 2px 10px rgba(0,0,0,0.03);
}
.team-card h4 {
  margin: var(--space-sm) 0 var(--space-xs);
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text);
}
.award-badge {
  display: inline-block;
  padding: 3px 12px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 700;
}
.award-grand { background: rgba(198,40,40,0.1); color: #d32f2f; }
.award-gold { background: rgba(199,145,0,0.1); color: #c79100; }
.award-silver { background: rgba(122,139,153,0.12); color: #7a8b99; }
.award-bronze { background: rgba(184,115,51,0.1); color: #b87333; }
.award-excellent { background: rgba(150,140,110,0.1); color: #8d8560; }

.team-members {
  font-size: var(--font-size-sm);
  color: var(--text-light);
  line-height: 1.7;
}
.team-members .label {
  display: inline-block;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-right: 6px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--bg-light);
}

/* ── 个人奖 ── */
.sub-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text);
  margin-bottom: var(--space-md);
}
.sub-label i { color: var(--primary); }

.table-wrap {
  overflow-x: auto;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(0,0,0,0.06);
}
.personal-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  font-size: var(--font-size-sm);
}
.personal-table thead {
  background: linear-gradient(135deg, rgba(26,115,232,0.04), rgba(26,115,232,0.01));
}
.personal-table th {
  padding: 12px 16px;
  text-align: center;
  font-weight: 700;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  border-bottom: 2px solid rgba(26,115,232,0.1);
}
.personal-table td {
  padding: 10px 16px;
  text-align: center;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  color: var(--text);
}
.personal-table tbody tr:last-child td { border-bottom: none; }
.personal-table tbody tr:hover { background: rgba(26,115,232,0.02); }
.cell-score {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--primary);
}

/* ── 移动端个人奖卡片（≤768px 替代表格）── */
.personal-grid {
  display: none;
}
.p-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}
.p-name {
  font-weight: 700;
  flex-shrink: 0;
}
.p-award {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  flex: 1;
  text-align: center;
}
.p-score {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--primary);
  font-size: var(--font-size-xs);
}

/* ── 底部链接 ── */
.event-links {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-top: var(--space-lg);
  flex-wrap: wrap;
}
.back-link,
.intro-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: var(--font-size-sm);
  transition: all var(--transition-spring);
}
.back-link {
  border: 1px solid rgba(26,115,232,0.15);
  color: var(--primary);
}
.back-link:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  transform: translateX(-4px);
  box-shadow: 0 4px 16px rgba(26,115,232,0.2);
}
.intro-link {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: #fff;
  box-shadow: 0 4px 14px rgba(26,115,232,0.25);
}
.intro-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(26,115,232,0.3);
}

/* ── 响应式 ── */
@media (max-width: 768px) {
  .event-page { padding: calc(var(--header-height) + 30px) 0 var(--space-2xl); }
  .event-hero h1 { font-size: 1.7rem; }
  .scale-card { flex-direction: column; text-align: center; }
  .team-grid { grid-template-columns: 1fr; }
  /* 个人奖：表格切双列卡片 */
  .table-wrap { display: none; }
  .personal-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
}
</style>
