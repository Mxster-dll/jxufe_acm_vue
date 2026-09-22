/**
 * 比赛战绩胶囊：从站点自身的竞赛数据聚合出每人的奖牌摘要。
 *
 * 为什么要有它：「优秀成员」「协会负责人」两页原先手写 ICPC / CCPC / 天梯赛 /
 * 蓝桥杯的荣誉条目，比赛一多就得手工维护、还容易漏。现在直接从站点已有的竞赛
 * 数据（public/data/editions/<slug>/<year>.json 与 public/data/baidu.json）汇总成
 * 一枚枚「xCPC 区域赛🥈2🥉1」式的胶囊，数据一更新页面自动跟上。
 *
 * 口径（2026-09 与会长逐条裁定，改动前先问）：
 *  - 四个系列：xCPC（ICPC + CCPC 合并）/ 天梯赛 / 百度之星 / 蓝桥杯
 *  - xCPC 的「区域赛 / 邀请赛」与「省赛」分成两枚胶囊，省赛单独一枚
 *  - 「暨X省赛」「暨X区赛」的邀请赛（如 ICPC全国邀请赛（南昌）暨江西省赛）：
 *    邀请赛与省赛【各计一次】
 *  - **省赛段只认江西省赛**（会长 2026-09 裁定）：其他省的省赛 / 区赛（广东、河南、
 *    广西、山东、吉林、东北、湖北、福建、河北、贵州…）不计入省赛段。数据里江西省赛
 *    以「XX全国邀请赛（南昌）暨江西省赛」的形式出现，故用「江西」二字判定；
 *    非江西的「暨X省赛」行仍照常计入【邀请赛】（那确实是邀请赛的奖牌），只是不再多计一次省赛。
 *  - 天梯赛：团体（只统计国赛团队奖；分省团队奖在数据里没有成员名单，无法归属到人）/ 个人
 *  - 百度之星：决赛 → 国赛、初赛 → 省赛（数据只有这两档，百度之星本身没有省赛）
 *  - 优秀奖不计入任何奖牌数（与站点展示层一致：CompetitionEventView.vue 与
 *    CompetitionDetailView.vue 都是在展示层过滤优秀奖，数据源保留）
 *  - CCPC 女生专场不并进计数分段，按「2021 CCPC女生专场 铜牌」单独列一条
 *  - 同一场团队奖，队内每人各计一枚（这正是「🥈2」的含义）
 *  - 零奖牌的档位不显示（如「区域赛🥈2🥉1」里没有 🥇）
 */

/** 有逐届获奖数据的四个系列（年份由 /data/events/<slug>.json 推出） */
const EDITION_SLUGS = ['icpc', 'ccpc', 'gplt', 'lanqiao']

/** 系列键 → 胶囊开头的名字 */
export const FAMILY_LABELS = {
  xcpc: 'xCPC',
  gplt: '天梯赛',
  baidu: '百度之星',
  lanqiao: '蓝桥杯',
}

const FAMILY_ORDER = ['xcpc', 'gplt', 'baidu', 'lanqiao']
const MEDAL_ORDER = ['gold', 'silver', 'bronze']
const MEDAL_EMOJI = { gold: '🥇', silver: '🥈', bronze: '🥉' }
const MEDAL_TEXT = { gold: '金牌', silver: '银牌', bronze: '铜牌' }

/** 分段顺序（xCPC 的省赛单独成胶囊，故不在此列） */
const SEGMENT_ORDER = {
  xcpc: ['区域赛', '邀请赛'],
  gplt: ['团体', '个人'],
  baidu: ['国赛', '省赛'],
  lanqiao: ['国赛', '省赛'],
}

/**
 * 手工兜底：站点数据里查不到的人（昵称），由人工折算。
 * vesper：CCPC湘潭邀请赛铜牌 → 邀请赛🥉1；江西省大学生程序设计大赛一等奖 → 省赛🥇1
 *
 * 注意「不愿透露姓名」与「查不到」是两件事（2026-09 会长裁定）：前者只是**显示**匿名 ——
 * 数据里照样写实名（members.json / leaders.json 的 `name`，本文件与排名都按它匹配），
 * 另给一个 `displayName` 决定页面显示什么。所以有真名的人一律不进这张表。
 */
export const MANUAL_PILLS = {
  vesper: ['xCPC 邀请赛🥉1', 'xCPC 省赛🥇1'],
}

const MEDAL_RULES = [
  ['gold', /特等|一等奖|金奖|金牌|冠军/],
  ['silver', /二等|银奖|银牌|亚军/],
  ['bronze', /三等|铜奖|铜牌|季军/],
]
/** 优秀奖：站点各页面一律不展示，这里也不计入奖牌数 */
const EXCELLENT_RE = /优秀奖/
/** CCPC 女生专场：单列，不并进计数分段 */
const GIRLS_RE = /女生|专场/
/**
 * 省赛段只认江西省赛（会长 2026-09 裁定：其他省的省赛不计）。
 * 数据里江西省赛一律写成「XX全国邀请赛（南昌）暨江西省赛」，故按「江西」判定；
 * 顺带也覆盖将来可能出现的独立「江西省赛」行。非江西的「暨X省赛」照常见 /邀请赛/ 分支，
 * 只是不再额外计一次省赛。
 */
const JIANGXI_RE = /江西/

/** 奖项文字 → 奖牌档位；优秀奖与未获奖返回 null */
export function medalOf(award) {
  const text = String(award || '')
  if (EXCELLENT_RE.test(text)) return null
  for (const [medal, re] of MEDAL_RULES) if (re.test(text)) return medal
  return null
}

/**
 * 团队奖项归到哪些分段。
 * 返回数组：因为「暨江西省赛」的邀请赛要同时落进「邀请赛」和「省赛」两段。
 * 分省团队奖（gplt/provincial/teams）返回空数组——那份数据没有 members 字段。
 * 省赛段只认江西省赛，其他省的省赛 / 区赛返回空数组（不进任何分段）。
 */
export function teamSegments(slug, level, award) {
  const text = String(award)
  if (slug === 'gplt') return level === 'national' ? ['团体'] : []
  if (GIRLS_RE.test(text)) return ['girls']
  if (level === 'provincial') return JIANGXI_RE.test(text) ? ['省赛'] : []
  if (/邀请赛/.test(text)) return JIANGXI_RE.test(text) ? ['邀请赛', '省赛'] : ['邀请赛']
  return ['区域赛']
}

/** 个人奖项归到哪个分段（仅天梯赛与蓝桥杯有个人成绩）；不归属返回 null */
export function personalSegment(slug, level) {
  if (slug === 'gplt') return level === 'national' ? '个人' : null
  if (slug === 'lanqiao') return level === 'national' ? '国赛' : '省赛'
  return null
}

/** 队内成员串（「万俊哲、张云菲、衷铭川」）→ 姓名数组 */
const splitMembers = (text) =>
  String(text || '')
    .split(/[、,，/]+/)
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * 把逐届数据展平成「姓名 → 获奖记录」。
 * @param {{ [slug: string]: object[] }} editions 每个系列的各年数据（无需保证顺序）
 * @param {object|null} baidu /data/baidu.json
 * @returns {Map<string, {family: string, segment: string, medal: string, year: string, award: string}[]>}
 */
export function collectRecords(editions = {}, baidu = null) {
  const index = new Map()
  const push = (name, record) => {
    if (!name) return
    if (!index.has(name)) index.set(name, [])
    index.get(name).push(record)
  }

  for (const slug of EDITION_SLUGS) {
    const family = slug === 'gplt' || slug === 'lanqiao' ? slug : 'xcpc'
    for (const edition of editions[slug] || []) {
      const year = String(edition?.year ?? '')
      for (const level of ['national', 'provincial']) {
        const block = edition?.[level] || {}
        for (const team of block.teams || []) {
          const medal = medalOf(team.award)
          if (!medal) continue
          for (const segment of teamSegments(slug, level, team.award)) {
            for (const name of splitMembers(team.members)) {
              push(name, { family, segment, medal, year, award: String(team.award || '') })
            }
          }
        }
        for (const person of block.personal || []) {
          const medal = medalOf(person.award)
          if (!medal) continue
          const segment = personalSegment(slug, level)
          if (!segment) continue
          push(person.name, { family, segment, medal, year, award: String(person.award || '') })
        }
      }
    }
  }

  // 百度之星：个人赛，stages 只有 final / preliminary
  for (const year of baidu?.years || []) {
    for (const stage of year.stages || []) {
      for (const group of stage.groups || []) {
        for (const row of group.rows || group.persons || []) {
          const award = String(row.award || group.award || '')
          const medal = medalOf(award)
          if (!medal) continue
          push(row.name, {
            family: 'baidu',
            segment: stage.key === 'final' ? '国赛' : '省赛',
            medal,
            year: String(year.year ?? ''),
            award,
          })
        }
      }
    }
  }

  return index
}

/** 「区域赛🥈2🥉1」——零奖牌的档位不写 */
function segmentText(segment, counts) {
  const medals = MEDAL_ORDER.filter((m) => counts[m] > 0)
    .map((m) => MEDAL_EMOJI[m] + counts[m])
    .join('')
  return medals ? segment + medals : ''
}

/** 一个人的获奖记录 → 胶囊文本数组（顺序：xCPC 区域赛/邀请赛 → xCPC 省赛 → 天梯赛 → 百度之星 → 蓝桥杯 → 女生专场） */
export function recordsToPills(records = []) {
  const counts = { xcpc: {}, gplt: {}, baidu: {}, lanqiao: {} }
  const girls = []

  for (const r of records) {
    if (r.segment === 'girls') {
      girls.push(r)
      continue
    }
    const bySegment = counts[r.family]
    if (!bySegment) continue
    if (!bySegment[r.segment]) bySegment[r.segment] = { gold: 0, silver: 0, bronze: 0 }
    bySegment[r.segment][r.medal] += 1
  }

  const pills = []
  for (const family of FAMILY_ORDER) {
    const bySegment = counts[family]
    if (!Object.keys(bySegment).length) continue
    const body = SEGMENT_ORDER[family]
      .map((segment) => (bySegment[segment] ? segmentText(segment, bySegment[segment]) : ''))
      .filter(Boolean)
      .join(' ')
    if (body) pills.push(`${FAMILY_LABELS[family]} ${body}`)
    // xCPC 省赛单独一枚胶囊，紧跟其后
    if (family === 'xcpc' && bySegment['省赛']) {
      pills.push(`${FAMILY_LABELS.xcpc} ${segmentText('省赛', bySegment['省赛'])}`)
    }
  }
  // 女生专场：按年份列出具体记录，不做奖牌计数
  for (const r of girls.slice().sort((a, b) => String(a.year).localeCompare(String(b.year)))) {
    pills.push(`${r.year} CCPC女生专场 ${MEDAL_TEXT[r.medal]}`)
  }
  return pills
}

/**
 * 纯函数：数据 → 「姓名 → 胶囊文本数组」。核验脚本与页面共用同一份逻辑。
 * @param {{ editions?: object, baidu?: object|null }} sources
 */
export function buildHonorPills({ editions = {}, baidu = null } = {}) {
  const pills = new Map()
  for (const [name, records] of collectRecords(editions, baidu)) {
    const list = recordsToPills(records)
    if (list.length) pills.set(name, list)
  }
  for (const [name, list] of Object.entries(MANUAL_PILLS)) {
    if (!pills.has(name)) pills.set(name, [...list])
  }
  return pills
}

const DATA_ROOT = '/data'

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
  return res.json()
}

/** 各年的 editions 文件（年份取自 events/<slug>.json，与站点其它页面同一套推导方式） */
async function loadEditions(slug) {
  const events = await fetchJson(`${DATA_ROOT}/events/${slug}.json`).catch(() => null)
  const years = [...new Set((events?.events || []).map((e) => String(e.year)))]
  const editions = await Promise.all(
    years.map((year) => fetchJson(`${DATA_ROOT}/editions/${slug}/${year}.json`).catch(() => null))
  )
  return editions.filter(Boolean)
}

let recordsCache = null
let pillsCache = null

/**
 * 加载并缓存「姓名 → 获奖记录」原始索引。
 * 排名（honorRanking.js）与胶囊共用这一份缓存，整站只请求一次。
 * 任何一份数据取不到都只影响对应赛事，不会让页面报错。
 */
export function loadHonorRecords() {
  if (!recordsCache) {
    recordsCache = Promise.all([
      Promise.all(EDITION_SLUGS.map(loadEditions)),
      fetchJson(`${DATA_ROOT}/baidu.json`).catch(() => null),
    ])
      .then(([sets, baidu]) =>
        collectRecords(
          Object.fromEntries(EDITION_SLUGS.map((slug, i) => [slug, sets[i]])),
          baidu
        )
      )
      .catch((err) => {
        console.error('比赛战绩数据加载失败:', err)
        return new Map()
      })
  }
  return recordsCache
}

/**
 * 加载并缓存「姓名 → 胶囊」索引（两个页面共用同一份缓存）。
 * 由上面的原始记录派生，保证胶囊与排名永远同一口径。
 */
export function loadHonorPills() {
  if (!pillsCache) {
    pillsCache = loadHonorRecords().then((records) => {
      const pills = new Map()
      for (const [name, list] of records) {
        const texts = recordsToPills(list)
        if (texts.length) pills.set(name, texts)
      }
      for (const [name, list] of Object.entries(MANUAL_PILLS)) {
        if (!pills.has(name)) pills.set(name, [...list])
      }
      return pills
    })
  }
  return pillsCache
}

/** 供核验脚本/调试用：清掉缓存后重新加载 */
export function resetHonorPills() {
  recordsCache = null
  pillsCache = null
}
