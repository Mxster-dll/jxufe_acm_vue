<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { lanqiaoGroup } from '../utils/lanqiaoGroup'
import RosterGroup from '../components/lanqiao/RosterGroup.vue'

const route = useRoute()
const edition = ref(null)
const loading = ref(true)
const error = ref(false)

// 加载该届比赛数据：/data/editions/<slug>/<year>.json
watch(
  () => [route.params.slug, route.params.year],
  async ([slug, year]) => {
    if (!slug || !year) return
    loading.value = true
    error.value = false
    try {
      const res = await fetch(`/data/editions/${slug}/${year}.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      edition.value = await res.json()
    } catch (e) {
      console.error(`加载 /data/editions/${slug}/${year}.json 失败:`, e)
      error.value = true
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

// 比赛日期格式化：'2025-06-15' → '2025年6月15日'；'2010-05' → '2010年5月'；空 → ''
function fmtLqDate(d) {
  if (!d) return ''
  const m = String(d).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!m) return d
  return m[3] ? `${m[1]}年${+m[2]}月${+m[3]}日` : `${m[1]}年${+m[2]}月`
}

// 举办日期（未知时回退显示“日期待考”；蓝桥杯省赛/国赛各一场、日期分列）
const dateText = computed(() => {
  if (!edition.value) return '日期待考'
  if (edition.value.slug === 'lanqiao' && edition.value.dates) {
    const p = fmtLqDate(edition.value.dates.provincial)
    const n = fmtLqDate(edition.value.dates.national)
    const parts = []
    if (p) parts.push('省赛 ' + p)
    if (n) parts.push('总决赛 ' + n)
    if (parts.length) return parts.join(' · ')
    return '日期待考'
  }
  if (!edition.value.date) return '日期待考'
  return new Date(edition.value.date).toLocaleDateString('zh-CN')
})

const hasNational = computed(() => {
  const n = edition.value?.national
  return !!n && (n.university?.length || n.teams?.length || n.personal?.length)
})
const hasProvincial = computed(() => {
  const p = edition.value?.provincial
  return !!p && (p.university?.length || p.teams?.length || p.personal?.length)
})
const noAward = computed(
  () => !!edition.value && !hasNational.value && !hasProvincial.value
)

// 奖项等级 → 配色（与参赛历史表格的奖牌色一致；优秀奖为浅金灰）
function awardClass(award) {
  if (!award) return ''
  if (/一等奖|金奖|冠军/.test(award)) return 'award-gold'
  if (/二等奖|银奖|亚军/.test(award)) return 'award-silver'
  if (/三等奖|铜奖|季军/.test(award)) return 'award-bronze'
  if (/优秀奖/.test(award)) return 'award-excellent'
  return ''
}

// ── 蓝桥杯（个人赛）：按 C/C++·Java·Python × A/B 级 × 奖等 分组名单 ──
const isLanqiao = computed(() => edition.value?.slug === 'lanqiao')
const nationalGroups = computed(() =>
  isLanqiao.value ? lanqiaoGroup(edition.value?.national?.personal || []) : []
)
const provincialGroups = computed(() =>
  isLanqiao.value ? lanqiaoGroup(edition.value?.provincial?.personal || []) : []
)
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
      <p v-else-if="!edition" class="hint">未找到该届比赛</p>

      <template v-else>
        <!-- 标题区 -->
        <header class="event-hero">
          <p class="event-label">COMPETITION EVENT</p>
          <h1>{{ edition.title }}</h1>
          <div class="header-divider"></div>
          <p class="event-subtitle">
            <i class="fa-regular fa-calendar"></i> 举办日期：{{ dateText }}
          </p>
        </header>

        <!-- 参赛规模 -->
        <section class="scale-card">
          <div class="scale-icon"><i class="fa-solid fa-users"></i></div>
          <div class="scale-text">
            <h3>参赛规模</h3>
            <p>{{ edition.scale }}</p>
          </div>
        </section>

        <!-- 无获奖记录 -->
        <section v-if="noAward" class="no-award">
          <i class="fa-regular fa-face-meh"></i>
          <p>本届无我校获奖记录</p>
        </section>

        <template v-else>
          <!-- 国赛获奖情况 -->
          <section class="award-section" :class="isLanqiao ? 'lq-award-card lq-national' : ''">
            <h2 class="section-label"><i class="fa-solid fa-trophy"></i> 国赛获奖情况<span v-if="isLanqiao && edition.dates?.national" class="lq-stage-date">{{ fmtLqDate(edition.dates.national) }}</span></h2>

            <p v-if="!hasNational" class="empty">本届无获奖记录</p>
            <template v-else>
              <!-- 高校奖 -->
              <div v-if="edition.national.university?.length" class="uni-row">
                <span class="uni-chip" v-for="(u, i) in edition.national.university" :key="i">
                  <i class="fa-solid fa-school"></i> {{ u }}
                </span>
              </div>

              <!-- 团队奖 -->
              <div v-if="edition.national.teams?.length" class="team-grid">
                <div v-for="(t, i) in edition.national.teams" :key="i" class="team-card">
                  <span class="award-badge" :class="awardClass(t.award)">{{ t.award }}</span>
                  <h4>{{ t.name }}</h4>
                  <p class="team-members"><span class="label">成员</span>{{ t.members }}</p>
                </div>
              </div>

              <!-- 个人奖 -->
              <div v-if="edition.national.personal?.length" class="personal-wrap">
                <!-- 蓝桥杯：分组名单（C/C++·Java·Python × A/B × 奖等） -->
                <template v-if="isLanqiao">
                  <RosterGroup :groups="nationalGroups" />
                </template>
                <!-- 其他赛事：表格 + 移动端卡片 -->
                <template v-else>
                  <h3 class="sub-label"><i class="fa-solid fa-user"></i> 个人奖</h3>
                  <div class="table-wrap">
                    <table class="personal-table">
                      <thead>
                        <tr><th>姓名</th><th>奖项</th><th>{{ edition.slug === 'lanqiao' ? '科目' : '成绩' }}</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="(p, i) in edition.national.personal" :key="i">
                          <td>{{ p.name }}</td>
                          <td :class="awardClass(p.award)">{{ p.award }}</td>
                          <td class="cell-score">{{ p.score }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <!-- 移动端：双列卡片 -->
                  <div class="personal-grid">
                    <div v-for="(p, i) in edition.national.personal" :key="'g' + i" class="p-chip">
                      <span class="p-name" :class="awardClass(p.award)">{{ p.name }}</span>
                      <span class="p-award">{{ p.award.replace(/^个人/, '') }}</span>
                      <span class="p-score">{{ p.score }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </section>

          <!-- 省赛获奖情况 -->
          <section class="award-section" :class="isLanqiao ? 'lq-award-card lq-provincial' : ''">
            <h2 class="section-label"><i class="fa-solid fa-medal"></i> 省赛获奖情况<span v-if="isLanqiao && edition.dates?.provincial" class="lq-stage-date">{{ fmtLqDate(edition.dates.provincial) }}</span></h2>

            <p v-if="!hasProvincial" class="empty">本届无获奖记录</p>
            <template v-else>
              <!-- 高校奖 -->
              <div v-if="edition.provincial.university?.length" class="uni-row">
                <span class="uni-chip" v-for="(u, i) in edition.provincial.university" :key="i">
                  <i class="fa-solid fa-school"></i> {{ u }}
                </span>
              </div>

              <!-- 团队奖 -->
              <div v-if="edition.provincial.teams?.length" class="team-grid">
                <div v-for="(t, i) in edition.provincial.teams" :key="i" class="team-card">
                  <span class="award-badge" :class="awardClass(t.award)">{{ t.award }}</span>
                  <h4>{{ t.name }}</h4>
                </div>
              </div>

              <!-- 个人奖（蓝桥杯等个人赛：姓名/奖项/科目） -->
              <div v-if="edition.provincial.personal?.length" class="personal-wrap">
                <!-- 蓝桥杯：分组名单 -->
                <template v-if="isLanqiao">
                  <RosterGroup :groups="provincialGroups" />
                </template>
                <!-- 其他赛事：表格 + 移动端卡片 -->
                <template v-else>
                  <h3 class="sub-label"><i class="fa-solid fa-user"></i> 个人奖</h3>
                  <div class="table-wrap">
                    <table class="personal-table">
                      <thead>
                        <tr><th>姓名</th><th>奖项</th><th>科目</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="(p, i) in edition.provincial.personal" :key="i">
                          <td>{{ p.name }}</td>
                          <td :class="awardClass(p.award)">{{ p.award }}</td>
                          <td class="cell-score">{{ p.score }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <!-- 移动端：双列卡片 -->
                  <div class="personal-grid">
                    <div v-for="(p, i) in edition.provincial.personal" :key="'g' + i" class="p-chip">
                      <span class="p-name" :class="awardClass(p.award)">{{ p.name }}</span>
                      <span class="p-award">{{ p.award.replace(/^个人/, '') }}</span>
                      <span class="p-score">{{ p.score }}</span>
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
          <RouterLink :to="`/competition/${edition.slug}`" class="intro-link">
            查看{{ edition.name || '该赛事' }}介绍 <i class="fa-solid fa-arrow-right"></i>
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
