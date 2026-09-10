<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useJson } from '../composables/useJson'
import { lanqiaoGroup } from '../utils/lanqiaoGroup'
import RosterGroup from '../components/lanqiao/RosterGroup.vue'

const route = useRoute()
const { data: competitions, loading, error } = useJson('/data/competitions.json', {
  initial: []
})

// xCPC 合并页（slug=xcpc）：由 ICPC + CCPC 合成——参赛历史合并显示，
// 简介与详情卡通过 comp.children 分开介绍；其余竞赛按原 slug 查找
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
      mode: 'history',
      intro: [],
      details: [],
      children: [icpc, ccpc],
      history: [...(icpc.history || []), ...(ccpc.history || [])],
    }
  }
  return list.find((c) => c.slug === slug)
})

// 举办时间数据：/data/events/<slug>.json（与大事记共用同一数据源）；
// xCPC 合并页同时加载 icpc + ccpc 两份事件数据用于日期匹配
const events = ref([])
watch(
  () => route.params.slug,
  async (slug) => {
    if (!slug) return
    try {
      const slugs = slug === 'xcpc' ? ['icpc', 'ccpc'] : [slug]
      const all = []
      for (const s of slugs) {
        const res = await fetch(`/data/events/${s}.json`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        all.push(...((await res.json()).events || []))
      }
      events.value = all
    } catch (e) {
      console.error(`加载 /data/events/${slug}.json 失败:`, e)
      events.value = []
    }
  },
  { immediate: true }
)

// 将按年分组的 history 展平为表格行：
//  - xcpc（ICPC/CCPC）只保留获奖项：去掉网络预选赛与未获奖（medals 为空）
//  - 严格按赛事举办日期降序（无日期条目按当年年末兜底，保证同年后置）
const historyRows = computed(() => {
  if (!comp.value?.history) return []
  const isXcpc = ['icpc', 'ccpc', 'xcpc'].includes(comp.value.slug)
  const rows = comp.value.history.flatMap((g) =>
    (g.entries || []).map((e) => ({ year: g.year, ...e }))
  )
  const filtered = isXcpc
    ? rows.filter(
        (r) =>
          !(r.title || '').includes('网络预选赛') &&
          Array.isArray(r.medals) &&
          r.medals.length > 0
      )
    : rows
  return [...filtered].sort((a, b) => rowSortKey(b).localeCompare(rowSortKey(a)))
})

// 排序键：优先取 events/<slug>.json 中匹配赛事的举办日期（YYYY-MM-DD 可直接字符串比较），
// 无匹配赛事或无日期时回退为“年份-12-31”，保证同年内有日期的条目排前
function rowSortKey(row) {
  const evs = (events.value || []).filter((e) => String(e.year) === String(row.year))
  const hit = evs.find(
    (e) => e.title && (row.title.includes(e.title) || e.title.includes(row.title))
  )
  const d = (hit && hit.date) || row.year
  const s = String(d)
  return s.includes('-') ? s : `${s}-12-31`
}

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

// 通用参赛史（mode=history）天梯赛式分组：
// 按 (年份, 场次) 分组，同场多队 rowspan 合并"日期/赛事"列；
// 组内按排名升序（rank 缺失/无效排最后，同分稳定保持原顺序）
const groupedHistoryRows = computed(() => {
  const groups = []
  const map = new Map()
  for (const row of historyRows.value) {
    const key = row.year + '|' + row.title
    if (!map.has(key)) {
      const dt = rowDate(row)
      map.set(key, {
        year: row.year,
        title: row.title,
        dateText: dt && String(dt).includes('-') ? dateTextOf(dt, row.year) : dt,
        rows: [],
      })
      groups.push(map.get(key))
    }
    map.get(key).rows.push(row)
  }
  for (const g of groups) {
    g.rows.sort((a, b) => {
      const ra = a.rank != null ? Number(a.rank) : Infinity
      const rb = b.rank != null ? Number(b.rank) : Infinity
      if (ra === rb) return 0
      return ra < rb ? -1 : 1
    })
  }
  return groups
})

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
    // mode=lanqiao：蓝桥杯为个人赛，总名单来自 /data/lanqiao.json（按年份分组）
    if (c.mode === 'lanqiao') {
      console.log('该赛事使用蓝桥杯总名单（mode=lanqiao）:', c.slug)
      try {
        const res = await fetch('/data/lanqiao.json')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        lanqiaoData.value = await res.json()
      } catch (e) {
        console.error('加载 /data/lanqiao.json 失败:', e)
        lanqiaoData.value = null
      }
      return
    }
    // mode=baidu：百度之星为个人赛，我校获奖名单来自 /data/baidu.json（按年份分组）
    if (c.mode === 'baidu') {
      console.log('该赛事使用百度之星获奖名单（mode=baidu）:', c.slug)
      try {
        const res = await fetch('/data/baidu.json')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        baiduData.value = await res.json()
      } catch (e) {
        console.error('加载 /data/baidu.json 失败:', e)
        baiduData.value = null
      }
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

// 成员字符串 → 姓名数组（去空）
function splitMembers(members) {
  return (members || '').split('、').filter(Boolean)
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

// ── 赛事类别（成绩着色）：邀请赛 / 区域赛·全国赛 / 网络赛 / 省赛 ──
// catOf(title)：按场次标题判定类别（兼办场次如"全国邀请赛（南昌）暨江西省赛"归邀请赛）
function catOf(title) {
  const t = title || ''
  if (t.includes('网络预选赛')) return 'net'
  if (t.includes('全国邀请赛')) return 'inv'
  if (t.includes('亚洲区域赛') || t.includes('全国赛')) return 'reg'
  if (t.includes('省赛') || t.includes('区赛')) return 'prov'
  return 'reg'
}

// 奖牌 tier（invitational/regional/provincial/final）→ 类别；缺失按场次标题兜底
function tierClass(tier, title) {
  if (tier === 'invitational') return 'inv'
  if (tier === 'provincial') return 'prov'
  if (tier === 'net' || tier === '网络预选赛') return 'net'
  if (tier === 'regional' || tier === 'final') return 'reg'
  return catOf(title)
}

// 类别中文标签（徽章上的小字）：邀请赛 / 区域赛 / 网络赛 / 省赛
function tierTag(tier, title) {
  const c = tierClass(tier, title)
  return { inv: '邀请赛', reg: '区域赛', net: '网络赛', prov: '省赛' }[c] || ''
}

// 奖牌字符串（金奖/银奖/铜奖）→ 奖牌色徽章类
function medalChipClass(medal) {
  if (!medal) return 'chip-none'
  if (/金奖/.test(medal)) return 'chip-gold'
  if (/银奖/.test(medal)) return 'chip-silver'
  if (/铜奖/.test(medal)) return 'chip-bronze'
  return 'chip-none'
}

// 卡片左边框色调（新闻页 award-card 样式）：按队伍最高奖项金/银/铜，无奖无 tone
function cardTone(row) {
  const medals = row.medals || []
  if (!medals.length) return ''
  if (medals.some((m) => /金奖/.test(m.medal))) return 'tone-gold'
  if (medals.some((m) => /银奖/.test(m.medal))) return 'tone-silver'
  if (medals.some((m) => /铜奖/.test(m.medal))) return 'tone-bronze'
  return ''
}

// ── 参赛历史视图模式：表格 / 卡片 ──
// 桌面端默认表格、移动端默认卡片；用户切换后记住选择（localStorage）
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

// ── 蓝桥杯总名单（mode=lanqiao）：/data/lanqiao.json ──
const lanqiaoData = ref(null)

// 隐藏优秀奖：总名单不展示优秀奖（数据源保留，仅展示层过滤）
function hideExcellent(rows) {
  return (rows || []).filter((r) => !/优秀奖/.test(r.award || ''))
}

// 每年名单预分组（C/C++·Java·Python × A/B 级 × 奖等），省赛/国赛各一组
const lanqiaoYears = computed(() => {
  if (!lanqiaoData.value?.years) return []
  return lanqiaoData.value.years.map((y) => {
    const provincial = hideExcellent(y.provincial)
    const national = hideExcellent(y.national)
    return {
      year: y.year,
      edition: y.edition,
      dates: y.dates || {},
      provincial,
      national,
      provincialGroups: lanqiaoGroup(provincial),
      nationalGroups: lanqiaoGroup(national),
    }
  })
})

// 比赛日期格式化：'2025-06-15' → '2025年6月15日'；'2010-05' → '2010年5月'；空 → ''
function fmtLqDate(d) {
  if (!d) return ''
  const m = String(d).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!m) return d
  return m[3] ? `${m[1]}年${+m[2]}月${+m[3]}日` : `${m[1]}年${+m[2]}月`
}

// 蓝桥杯每年分组（国赛在上、省赛在下）
const lqStages = [
  ['national', '国赛'],
  ['provincial', '省赛'],
]

// ── 百度之星获奖名单（mode=baidu）：/data/baidu.json ──
const baiduData = ref(null)

// 环节元信息（决赛在上、初赛在下；视觉与蓝桥杯 国赛/省赛 两卡一致）
const BAIDU_STAGE_META = {
  final: { label: '决赛', icon: 'fa-trophy' },
  preliminary: { label: '初赛', icon: 'fa-medal' },
}
const BAIDU_AWARD_RANK = { 金奖: 0, 银奖: 1, 铜奖: 2 }

// 行数组 → 奖等行（{ award, persons:[{name, rank, title}] }），按 金→银→铜、奖内按公告序号升序
function rollRows(rows) {
  const byAward = new Map()
  for (const r of rows || []) {
    const award = r.award || '未标注'
    if (!byAward.has(award)) byAward.set(award, [])
    byAward.get(award).push({
      name: r.name,
      rank: r.rank != null ? Number(r.rank) : null,
      title: r.src || '',
    })
  }
  return [...byAward.entries()]
    .map(([award, persons]) => ({
      award,
      persons: persons
        .slice()
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
    }))
    .sort((a, b) => (BAIDU_AWARD_RANK[a.award] ?? 9) - (BAIDU_AWARD_RANK[b.award] ?? 9))
}

// 每年名单：决赛/初赛两卡（空环节保留，页面提示"暂无名单"）
const baiduYears = computed(() => {
  if (!baiduData.value?.years) return []
  return baiduData.value.years.map((y) => {
    const stages = (y.stages || []).map((st) => {
      const meta = BAIDU_STAGE_META[st.key] || { label: st.key, icon: 'fa-trophy' }
      const groups = (st.groups || []).map((g) => ({
        label: g.label,
        date: g.date,
        awards: rollRows(g.rows),
      }))
      const total = groups.reduce(
        (s, g) => s + g.awards.reduce((s2, a) => s2 + a.persons.length, 0),
        0
      )
      return { key: st.key, label: meta.label, icon: meta.icon, groups, total }
    })
    return {
      year: y.year,
      edition: y.edition,
      stages,
      total: stages.reduce((s, st) => s + st.total, 0),
    }
  })
})

// 竞赛详情页"参赛历史/获奖名单"小节标题
const sectionTitle = computed(() => {
  const m = comp.value?.mode
  if (m === 'lanqiao') return '我校蓝桥杯获奖总名单'
  if (m === 'baidu') return '我校百度之星获奖名单'
  return '我校参赛历史'
})
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
            <div v-if="historyRows.length || teamRows.length" class="view-toggle" role="group" aria-label="切换视图">
              <button type="button" class="view-btn" :class="{ active: viewMode === 'table' }" @click="setView('table')" title="表格视图"><i class="fa-solid fa-table-list"></i> 表格</button>
              <button type="button" class="view-btn" :class="{ active: viewMode === 'card' }" @click="setView('card')" title="卡片视图"><i class="fa-solid fa-table-cells-large"></i> 卡片</button>
            </div>
          </div>

          <!-- 蓝桥杯总名单（个人赛：按年 → 国/省 两卡 → C/C++·Java·Python × A/B → 奖等 → 姓名表格） -->
          <template v-if="comp.mode === 'lanqiao'">
            <p v-if="!lanqiaoData" class="empty">名单加载中…</p>
            <template v-else>
              <div class="lq-list">
                <div v-for="y in lanqiaoYears" :key="y.year" class="lq-year">
                  <div class="lq-year-head">
                    <h3>第{{ y.edition }}届蓝桥杯（{{ y.year }}年）</h3>
                    <span class="lq-count">{{ y.provincial.length + y.national.length }} 人次</span>
                  </div>
                  <div v-for="(st, si) in lqStages" :key="si" class="lq-stage-card" :class="'lq-' + st[0]">
                    <div class="lq-stage-head">
                      <h4 class="lq-stage-title">
                        <i :class="st[0] === 'national' ? 'fa-solid fa-trophy' : 'fa-solid fa-medal'"></i>
                        {{ st[1] }}
                        <span v-if="y.dates && y.dates[st[0]]" class="lq-stage-date">{{ fmtLqDate(y.dates[st[0]]) }}</span>
                      </h4>
                      <span class="lq-count">{{ y[st[0]].length }} 人次</span>
                    </div>
                    <RosterGroup v-if="y[st[0]].length" :groups="st[0] === 'national' ? y.nationalGroups : y.provincialGroups" />
                    <p v-else class="empty">本届无{{ st[1] }}获奖记录</p>
                  </div>
                </div>
              </div>
            </template>
          </template>

          <!-- 百度之星获奖名单（个人赛：按年 → 决赛/初赛两卡 → 场次/组别分组 → 奖等 → 姓名表格，样式同蓝桥杯总名单） -->
          <template v-else-if="comp.mode === 'baidu'">
            <p v-if="!baiduData" class="empty">名单加载中…</p>
            <template v-else>
              <div class="lq-list">
                <div v-for="y in baiduYears" :key="y.year" class="lq-year">
                  <div class="lq-year-head">
                    <h3>第{{ y.edition }}届百度之星（{{ y.year }}年）</h3>
                    <span class="lq-count">{{ y.total }} 人次</span>
                  </div>
                  <div v-for="st in y.stages" :key="st.key" class="lq-stage-card" :class="'lq-bd-' + st.key">
                    <div class="lq-stage-head">
                      <h4 class="lq-stage-title">
                        <i class="fa-solid" :class="st.icon"></i>
                        {{ st.label }}
                      </h4>
                      <span class="lq-count">{{ st.total }} 人次</span>
                    </div>
                    <RosterGroup v-if="st.groups.length" :groups="st.groups" />
                    <p v-else class="empty">本届暂无{{ st.label }}获奖名单</p>
                  </div>
                </div>
              </div>
            </template>
          </template>

          <p v-else-if="!historyRows.length && !teamRows.length" class="empty">暂无参赛记录</p>
          <div v-else class="history-table-wrap" v-reveal="{ variant: 'fade-up', threshold: 0.01, rootMargin: '0px 0px 100px 0px' }">
            <table class="history-table" :class="{ 'view-hidden': viewMode !== 'table' }">
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
                    <th>赛事</th>
                    <th>队名</th>
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
                <!-- 通用式（天梯赛式排版：按场次分组，rowspan 合并日期/赛事列） -->
                <template v-else>
                  <template v-for="g in groupedHistoryRows" :key="g.year + '|' + g.title">
                    <tr v-for="(row, ri) in g.rows" :key="g.year + '-' + ri" :class="'row-' + catOf(g.title)">
                      <td v-if="ri === 0" class="cell-year" :rowspan="g.rows.length">{{ g.dateText }}</td>
                      <td v-if="ri === 0" class="cell-title" :rowspan="g.rows.length">{{ g.title }}</td>
                      <td class="cell-team">{{ row.name || '—' }}</td>
                      <td class="cell-desc">
                        <template v-if="row.medals && row.medals.length">
                          <span
                            v-for="(md, mi) in row.medals"
                            :key="mi"
                            class="award-chip"
                            :class="medalChipClass(md.medal)"
                          >{{ md.medal }}<i class="chip-tag">{{ tierTag(md.tier, row.title) }}</i></span>
                        </template>
                        <span
                          v-else
                          class="award-chip chip-none"
                        >{{ row.desc }}</span>
                      </td>
                      <td class="cell-members">
                        <template v-if="row.members">
                          <span
                            v-for="(m, mi) in splitMembers(row.members)"
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
            <div v-if="teamRows.length || groupedHistoryRows.length" class="team-cards-mobile" :class="{ 'view-hidden': viewMode !== 'card' }">
              <!-- 天梯赛式 -->
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
              <!-- 通用式（按场次分组） -->
              <div v-for="g in groupedHistoryRows" :key="'mg' + g.year + '|' + g.title" class="m-group">
                <div class="m-group-head">
                  <span class="m-edition">{{ g.title }}</span>
                  <span class="m-date">{{ g.dateText }}</span>
                </div>
                <div v-for="(row, ri) in g.rows" :key="'mr' + ri" class="m-team-card m-team-card--event" :class="cardTone(row)">
                  <div class="m-team-name">{{ row.name || '—' }}</div>
                  <div class="m-awards">
                    <template v-if="row.medals && row.medals.length">
                      <span
                        v-for="(md, mi) in row.medals"
                        :key="mi"
                        class="m-award"
                        :class="medalChipClass(md.medal)"
                      ><i class="fa-solid fa-trophy"></i> {{ md.medal }} <span class="chip-tag">{{ tierTag(md.tier, row.title) }}</span></span>
                    </template>
                    <span v-else class="m-award chip-none"><i class="fa-solid fa-trophy"></i> {{ row.desc }}</span>
                  </div>
                  <div class="m-fields">
                    <p v-if="row.rank" class="m-field"><strong>排名：</strong>{{ row.rank }}/{{ row.teamCount }}</p>
                    <p class="m-field"><strong>参赛成员：</strong>
                      <template v-if="row.members">
                        <span
                          v-for="(m, mi) in splitMembers(row.members)"
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
.view-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: rgba(26, 115, 232, 0.06);
  border: 1px solid rgba(26, 115, 232, 0.12);
  border-radius: var(--radius-full);
}
.view-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.view-btn:hover {
  color: var(--primary);
}
.view-btn.active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(26, 115, 232, 0.25);
}
/* 视图显隐：表格/卡片二选一展示 */
.view-hidden {
  display: none !important;
}

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
