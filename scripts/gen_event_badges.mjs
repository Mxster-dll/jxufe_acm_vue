/**
 * gen_event_badges.mjs —— 大事记卡片右上角「奖牌角标」的数据生成器
 *
 * 为什么有这个文件（2026-09-23 会长要求「查看历史代码，把大事记页面事件卡片
 * 右上角的奖牌胶囊还原」）：
 *   旧站（integration 分支 src/views/AllActionView.vue）的卡片右上角有一枚角标，
 *   内容是**当场比赛的奖牌计数**（旧数据样例：`"summary": "🥉1"`），颜色按最高奖项
 *   定（`badgeTone()` → gold / silver / bronze）。旧实现直接读旧数据里的 summary 字段。
 *   新数据层（主仓库 e5da23a 起）的 `events/<年>.json` 的 cards[] 只有
 *   `{ kind, date, category, title, tagline, link }`，既没有奖牌字段、也不允许加
 *   （knowledge.md 明写「字段顺序必须是 kind, date, category, title, tagline, link」）。
 *   故这里从 `awards/*.json` 反算 —— 那是全站奖牌的唯一真源。
 *
 * 为什么在构建期生成、而不是让页面自己算：
 *   awards 七个文件共 3103 条（lanqiao.json 一个就 2862 条），大事记页首屏只需要
 *   十几枚角标，为它多拉几百 KB 不划算。生成物只有几 KB。
 *
 * 匹配口径（卡片 → 获奖记录），逐条都有数据依据：
 *   1. 系列由 `category` 决定：inv / reg / prov / net → xCPC；tts → 天梯赛；
 *      lanqiao → 蓝桥杯；baidu → 百度之星；chuanzhi → 传智杯。
 *      school / club / other 不是竞赛节点，不产生角标。
 *   2. 层级（medal_level）由 category 或标题关键词定：
 *      xCPC 看 category（inv→invitational，reg→regional|final，prov→provincial）；
 *      蓝桥杯 / 百度之星看标题（含「省赛」「初赛」→ provincial，否则 national）。
 *      没有层级的记录（`gplt-team.json` 压根没有 medal_level 字段，其 20 条全是
 *      全国团队奖）视为国家级。
 *   3. 届次：xCPC 的 awards 没有届数字段、competitions.json 里 icpc/ccpc 的
 *      sessions 也是空的，故**按日期精确匹配**（卡片 date 与获奖行 date 同源，
 *      都是比赛当天）；天梯赛 / 蓝桥杯 / 百度之星按年份反查 competitions.json 的
 *      sessions（gplt 2016:1…2026:11、lanqiao 2010:1…2026:17、baidu 2023:19…2026:22）。
 *   4. 层级过滤是必需的：同一场比赛的邀请赛与省赛是两批记录 —— CCPC 全国邀请赛
 *      （南昌）暨江西省赛在 2026-05-24 有两支队伍各有 invitational 与 provincial
 *      各一条（同队同名同天），卡片 category 为 inv（标题含「全国邀请赛」），
 *      不过滤就会把省赛奖也算进这枚角标。天梯赛卡片若标题写「省赛」，直接不产生
 *      角标 —— 分省团队奖在源数据里就没有成员名单，本会也没有可用的省级获奖数据。
 *   5. **天梯赛（category = tts）整类不生成角标**（会长 2026-09-23：「大事记中，
 *      天梯赛不显示获奖胶囊，因为正文有」）：天梯赛卡片的 tagline 本身就是奖牌账
 *      （「国赛：团体🥇1🥈1🥉1、个人🥇1🥈13🥉18 / 省赛：团体🥇2🥈1」），
 *      右上角再挂一枚当场计数属于同一件事说两遍，且那枚只统计国家级、与正文数字对不上。
 *   6. **冠亚季军按 🏆 统计**（会长 2026-09-24）：获奖行带 `rank` 且属于前三名时，
 *      并进 grand 桶 —— 角标只显示 🏆N，不按金银铜分开数。判据是 contestTaxonomy.js 的
 *      `isTrophyRank()`（全站唯一一份，别在别处重写 `rank <= 3`）。
 *
 * 输出：`public/data/event_badges.json`
 *   { _note, generated_at, count, badges: { "<card.link>": "🥇1🥈2" } }
 *   只写有奖牌的卡片（计数为 0 的不写）—— 旧实现也只对获奖场次显示角标，
 *   而且「未获奖」不该出现在时间轴上。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'public/data')

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

import { MEDAL_EMOJI, MEDAL_ORDER, isTrophyRank } from '../src/utils/contestTaxonomy.js'

/** category → 系列（与 src/views/AllActionView.vue 的 CAT_LABEL 同源） */
const CAT_FAMILY = {
  inv: 'xcpc',
  reg: 'xcpc',
  prov: 'xcpc',
  net: 'xcpc',
  tts: 'gplt',
  lanqiao: 'lanqiao',
  baidu: 'baidu',
  chuanzhi: 'chuanzhi'
}

/** 系列 → awards 文件名（不含 .json） */
const FAMILY_FILES = {
  xcpc: ['icpc', 'ccpc'],
  gplt: ['gplt-team', 'gplt-individual'],
  lanqiao: ['lanqiao'],
  baidu: ['baidu'],
  chuanzhi: ['chuanzhi']
}

/**
 * competitions.json 的 slug → 系列。
 * 注意**不能**拿 CAT_FAMILY 代用：那边的键是卡片 category（天梯赛是 `tts`），
 * 而这里要的是数据文件的 slug（`gplt`）—— 混用会让届次索引整个建不起来
 * （实测：天梯赛角标全丢，因为 sessionIndex['gplt'] 是 undefined）。
 */
const SLUG_FAMILY = {
  icpc: 'xcpc',
  ccpc: 'xcpc',
  gplt: 'gplt',
  lanqiao: 'lanqiao',
  baidu: 'baidu',
  chuanzhi: 'chuanzhi'
}

/**
 * 卡片 → 要计入的 medal_level 集合。
 *   null   = 这张卡片不产生角标（没有可用数据，或根本不是竞赛节点）
 *   ['national'] 等 = 只数这些层级；记录缺 medal_level 时视为国家级（gplt-team）
 */
function levelsOf(card) {
  const cat = card.category
  const title = card.title || ''
  // CCPC 女生专场在 awards 里是 provincial（2021-10-31 / 2022-11-27 各 1 条铜），
  // 卡片 category 却是 inv（标题含「邀请赛」时才算，女生专场没有）→ 必须单独判
  if (CAT_FAMILY[cat] === 'xcpc' && /女生|专场/.test(title)) return ['provincial']
  if (cat === 'inv') return ['invitational']
  if (cat === 'reg') return ['regional', 'final']
  if (cat === 'prov') return ['provincial']
  if (cat === 'net') return null // 网络赛在 awards 里没有记录（只收录获奖，未获奖不入库）
  if (!CAT_FAMILY[cat]) return null
  // 天梯赛：分省团队奖在源数据里无成员名单，本会也没有省级获奖数据 → 不产生角标
  if (cat === 'tts') return /省/.test(title) ? null : ['national']
  // 蓝桥杯 / 百度之星：标题写「省赛」「初赛」的是省级，其余按国家级
  return /省赛|初赛|省选/.test(title) ? ['provincial'] : ['national']
}

/** competitions.json 的 sessions（{ 年份: 届数 }）→ 反查表 { 系列: { 年份: 届数 } } */
function buildSessionIndex(competitions) {
  const index = {}
  for (const comp of competitions) {
    const family = SLUG_FAMILY[comp.slug]
    if (!family) continue
    for (const [year, session] of Object.entries(comp.sessions || {})) {
      // xCPC 的 icpc / ccpc 都是空表；真填了也不影响（xCPC 走日期匹配）
      index[family] = index[family] || {}
      index[family][String(year)] = Number(session)
    }
  }
  return index
}

const yearOf = (date) => String(date || '').slice(0, 4)

function main() {
  const competitions = readJson(path.join(DATA, 'competitions.json'), [])
  const sessionIndex = buildSessionIndex(competitions)

  // 一次读齐所有 awards 文件，记录带上是哪个文件来的（便于报错定位）
  const rowsByFamily = {}
  for (const [family, files] of Object.entries(FAMILY_FILES)) {
    const rows = []
    for (const name of files) {
      const list = readJson(path.join(DATA, 'awards', `${name}.json`), [])
      if (!Array.isArray(list)) continue
      for (const row of list) rows.push({ ...row, _file: name })
    }
    rowsByFamily[family] = rows
  }

  // 年份 → 该年的卡片（年份来自文件名，events/<年>.json）
  const eventsDir = path.join(DATA, 'events')
  const yearFiles = fs
    .readdirSync(eventsDir)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .sort()

  const badges = {}
  /** 卡片 link → 最高档位（grand/gold/silver/bronze）。页面用它决定角标配色，
      不再从 emoji 文本反推 —— 那是「基本类型偏执」：换一套 emoji 就静默失效。 */
  const tiers = {}
  const stats = { cards: 0, contest: 0, badges: 0, skipped: 0, gpltSkipped: 0 }
  const misses = []

  for (const file of yearFiles) {
    const year = file.replace('.json', '')
    const data = readJson(path.join(eventsDir, file), {})
    for (const card of data.cards || []) {
      stats.cards += 1
      const family = CAT_FAMILY[card.category]
      if (!family || !card.link) continue
      /* 天梯赛卡片不生成角标（会长 2026-09-23：「大事记中，天梯赛不显示获奖胶囊，因为正文有」）。
         天梯赛卡片的 tagline 本身就是一份奖牌账（例：「国赛：团体🥇1🥈1🥉1、个人🥇1🥈13🥉18
         省赛：团体🥇2🥈1」）—— 右上角再挂一枚当场计数，是同一件事说两遍，
         而且角标只统计国家级、数字还对不上正文那份（正文含省赛）。 */
      if (card.category === 'tts') {
        stats.gpltSkipped += 1
        continue
      }
      stats.contest += 1
      const levels = levelsOf(card)
      if (!levels) {
        stats.skipped += 1
        continue
      }
      // 少数卡片没有具体日期（如 2018 第三届天梯赛，源数据 date 为 null），
      // 此时退回年份文件给出的年份 —— 届次按年份反查，年份是够用的
      const cardYear = yearOf(card.date) || year
      const rows = rowsByFamily[family] || []
      let pool
      if (family === 'xcpc') {
        // 同一天可能有两场（2026-05-24 的 CCPC 南昌与秦皇岛、2025-05-25 的长春/东北/桂林），
        // 只按日期匹配会让两场拿到同一枚角标 —— 卡片标题与 awards 的 competition_name
        // 是同源字符串，逐字相同，故以「日期 + 赛事名」为准；标题对不上任何一条时才退回当日全量。
        const sameDay = rows.filter((row) => row.date === card.date)
        const byTitle = sameDay.filter((row) => row.competition_name === card.title)
        pool = byTitle.length ? byTitle : sameDay
      } else {
        const session = sessionIndex[family]?.[cardYear]
        pool = session == null ? [] : rows.filter((row) => Number(row.session) === session)
      }
      const hits = pool.filter((row) => !row.medal_level || levels.includes(row.medal_level))
      const counts = {}
      for (const row of hits) {
        /* 冠亚季军并进 grand 桶（= 用 🏆 统计）。会长 2026-09-24：
           「冠亚季军在大事记卡片右上角的统计中都是被奖杯的 icon 统计」——
           与特等奖同一个奖杯，不再按金银铜分开数（冠军队的奖牌仍是金牌，
           那是 awards 里 medal_type 的事，这枚角标只说「当场拿了几个奖杯级结果」）。 */
        const key = isTrophyRank(row.rank) ? 'grand' : row.medal_type
        counts[key] = (counts[key] || 0) + 1
      }
      const text = MEDAL_ORDER.filter((m) => counts[m]).map((m) => MEDAL_EMOJI[m] + counts[m]).join('')
      if (text) {
        badges[card.link] = text
        tiers[card.link] = MEDAL_ORDER.find((m) => counts[m]) // 已按高→低排好
        stats.badges += 1
      } else {
        misses.push(`${year} ${card.date} [${card.category}] ${card.title}`)
      }
    }
  }

  const sorted = Object.fromEntries(Object.keys(badges).sort().map((k) => [k, badges[k]]))
  const out = {
    _note:
      '大事记卡片右上角的奖牌角标（生成物，请勿手改）。由 scripts/gen_event_badges.mjs 从 ' +
      'public/data/awards/*.json + competitions.json 反算；键为卡片 link，值为当场比赛的奖牌计数。' +
      '只收录有奖牌的场次。tiers 是同键的最高档位（供角标配色，别从 emoji 文本反推）。',
    generated_at: new Date().toISOString(),
    count: Object.keys(sorted).length,
    badges: sorted,
    tiers: Object.fromEntries(Object.keys(tiers).sort().map((k) => [k, tiers[k]])),
  }
  fs.writeFileSync(path.join(DATA, 'event_badges.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8')

  console.log(
    `事件角标：卡片 ${stats.cards} 张（竞赛节点 ${stats.contest}）→ 角标 ${stats.badges} 枚` +
      `，无奖牌 ${misses.length} 张，无数据跳过 ${stats.skipped} 张`
  )
  for (const miss of misses) console.log(`  · 无奖牌：${miss}`)
}

main()
