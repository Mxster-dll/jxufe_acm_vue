#!/usr/bin/env node
/**
 * 获奖数据校验器
 * ---------------------------------------------------------------------------
 * 校验 public/data/awards/*.json 是否符合约定 schema，以及
 * competitions.json / events/index.json 的引用是否完整。
 *
 * 用法: node scripts/check_awards.mjs
 * 退出码：0 = 全部通过；1 = 存在问题
 *
 * 数据格式（详见 README「获奖数据格式」）：
 *   团队赛（icpc / ccpc）
 *     competition_name, medal_level, team_name, medal_type, members, coach_names, date
 *   天梯赛团队奖（gplt-team）
 *     session, team_name, medal_type, members, coach_names, date
 *   单人赛（gplt-individual / lanqiao / baidu / chuanzhi）
 *     session, members, medal_level, medal_type, coach_names, date
 *     其中 lanqiao 额外含 language, group（插在 members 之后）
 *
 * medal_type 取值：gold / silver / bronze；lanqiao 另允许 grand（特等奖，
 * 只有第五届国赛 陈天楚 这一条）。grand 与金/银/铜并列展示，不并入一等奖。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'public', 'data')
const AWARDS = path.join(DATA, 'awards')

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

const MEDAL_TYPES = ['gold', 'silver', 'bronze']
// 特等奖（grand）：只有蓝桥杯早期届次存在这一档（第五届国赛 陈天楚）。
// 按文件限定，刻意不并进 MEDAL_TYPES —— 其它赛事的 medal_type 仍只能是金/银/铜。
const GRAND_MEDAL_TYPES = ['grand', ...MEDAL_TYPES]
const XCPC_LEVELS = ['regional', 'invitational', 'provincial', 'final']
const SINGLE_LEVELS = ['provincial', 'national']
const LANGS = ['C++', 'Java', 'Python']
const GROUPS = ['A', 'B', '研究生组']

const SCHEMA = {
  'icpc.json': {
    keys: ['competition_name', 'medal_level', 'team_name', 'medal_type', 'members', 'coach_names', 'date'],
    levels: XCPC_LEVELS,
    team: true
  },
  'ccpc.json': {
    keys: ['competition_name', 'medal_level', 'team_name', 'medal_type', 'members', 'coach_names', 'date'],
    levels: XCPC_LEVELS,
    team: true
  },
  'gplt-team.json': {
    keys: ['session', 'team_name', 'medal_type', 'members', 'coach_names', 'date'],
    levels: null,
    team: true
  },
  'gplt-individual.json': {
    keys: ['session', 'members', 'medal_level', 'medal_type', 'coach_names', 'date'],
    levels: SINGLE_LEVELS,
    team: false
  },
  'lanqiao.json': {
    keys: ['session', 'members', 'language', 'group', 'medal_level', 'medal_type', 'coach_names', 'date'],
    levels: SINGLE_LEVELS,
    team: false,
    langs: LANGS,
    groups: GROUPS,
    medals: GRAND_MEDAL_TYPES
  },
  'baidu.json': {
    keys: ['session', 'members', 'medal_level', 'medal_type', 'coach_names', 'date'],
    levels: SINGLE_LEVELS,
    team: false
  },
  'chuanzhi.json': {
    keys: ['session', 'members', 'medal_level', 'medal_type', 'coach_names', 'date'],
    levels: SINGLE_LEVELS,
    team: false
  }
}

function validateRecords(file, rows) {
  const spec = SCHEMA[file]
  const problems = []
  const push = (i, msg) => problems.push(`[${i}] ${msg}`)

  rows.forEach((r, i) => {
    const keys = Object.keys(r)
    if (keys.length !== spec.keys.length || keys.some((k, j) => k !== spec.keys[j])) {
      push(i, `字段名/顺序不符: ${keys.join(',')}（期望 ${spec.keys.join(',')}）`)
      return
    }
    if (spec.team) {
      if (!r.team_name || typeof r.team_name !== 'string') push(i, `team_name 为空或非 string`)
    }
    if ('competition_name' in r && (!r.competition_name || typeof r.competition_name !== 'string'))
      push(i, `competition_name 为空或非 string`)
    if ('session' in r && !Number.isInteger(r.session)) push(i, `session 非 int: ${JSON.stringify(r.session)}`)
    if (spec.levels && !spec.levels.includes(r.medal_level))
      push(i, `medal_level 非法: ${JSON.stringify(r.medal_level)}`)
    if (!(spec.medals || MEDAL_TYPES).includes(r.medal_type))
      push(i, `medal_type 非法: ${JSON.stringify(r.medal_type)}`)
    if (!Array.isArray(r.members) || !r.members.length || !r.members.every((m) => typeof m === 'string' && m))
      push(i, `members 非法: ${JSON.stringify(r.members)}`)
    if (!Array.isArray(r.coach_names) || !r.coach_names.every((m) => typeof m === 'string'))
      push(i, `coach_names 非法: ${JSON.stringify(r.coach_names)}`)
    if (r.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) push(i, `date 非法: ${JSON.stringify(r.date)}`)
    if (spec.langs && r.language !== null && !spec.langs.includes(r.language))
      push(i, `language 非法: ${JSON.stringify(r.language)}`)
    if (spec.groups && r.group !== null && !spec.groups.includes(r.group))
      push(i, `group 非法: ${JSON.stringify(r.group)}`)
  })

  // date 升序，null 排末尾
  let prev = null
  for (const r of rows) {
    if (r.date === null) continue
    if (prev !== null && r.date < prev) {
      problems.push(`date 未按升序排列: ${prev} → ${r.date}`)
      break
    }
    prev = r.date
  }
  return problems
}

let failed = 0
console.log('=== awards/*.json ===')
const existing = fs.readdirSync(AWARDS).filter((f) => f.endsWith('.json')).sort()
for (const f of existing) {
  if (!SCHEMA[f]) {
    console.log(`  ?    ${f.padEnd(22)} 未在 schema 中登记`)
    failed++
    continue
  }
  const rows = readJSON(path.join(AWARDS, f))
  if (!Array.isArray(rows)) {
    console.log(`  ERR  ${f.padEnd(22)} 顶层不是数组`)
    failed++
    continue
  }
  const problems = validateRecords(f, rows)
  const dist = {}
  for (const r of rows) dist[r.medal_type] = (dist[r.medal_type] || 0) + 1
  console.log(
    `  ${problems.length ? 'ERR' : 'OK '}  ${f.padEnd(22)} ${String(rows.length).padStart(5)} 条  ` +
      Object.entries(dist).map(([k, v]) => `${k}=${v}`).join(' ')
  )
  problems.slice(0, 8).forEach((p) => console.log('         ' + p))
  failed += problems.length ? 1 : 0
}

console.log('\n=== competitions.json 引用 ===')
const comps = readJSON(path.join(DATA, 'competitions.json'))
const referenced = new Set()
for (const c of comps) {
  const list = c.awards || []
  const missing = list.filter((a) => {
    referenced.add(`${a}.json`)
    return !fs.existsSync(path.join(AWARDS, `${a}.json`))
  })
  const ok = missing.length === 0 && !!c.shortName
  console.log(
    `  ${ok ? 'OK ' : 'ERR'}  ${c.slug.padEnd(9)} mode=${String(c.mode).padEnd(7)} awards=[${list.join(', ')}]` +
      (c.shortName ? '' : '  缺少 shortName') +
      (missing.length ? `  缺失文件: ${missing.join(', ')}` : '')
  )
  if (!ok) failed++
}
const orphans = existing.filter((f) => !referenced.has(f))
if (orphans.length) {
  console.log(`  ERR  未被任何赛事引用的 awards 文件: ${orphans.join(', ')}`)
  failed++
}

console.log('\n=== sessions（年份 → 届数）===')
// 单届详情页 /competition/:slug/:year 靠它把 URL 的自然年换算成 awards 的 session
for (const c of comps) {
  const m = c.sessions || {}
  const keys = Object.keys(m)
  const bad = keys.filter((y) => !/^\d{4}$/.test(y) || !Number.isInteger(m[y]) || m[y] <= 0)
  if (bad.length) {
    console.log(`  ERR  ${c.slug}: sessions 非法项 ${bad.join(', ')}`)
    failed++
  } else {
    console.log(`  OK   ${c.slug.padEnd(9)} ${keys.length} 年${keys.length ? `（${keys[0]}→${m[keys[0]]} … ${keys[keys.length - 1]}→${m[keys[keys.length - 1]]}）` : ''}`)
  }
}

console.log('\n=== events/ 大事记数据（一年一个文件：cards + articles）===')
const CATS = ['inv', 'reg', 'prov', 'net', 'tts', 'lanqiao', 'chuanzhi', 'baidu', 'school', 'club', 'other']
const NODE_KEYS = ['kind', 'date', 'category', 'title', 'tagline', 'link']
const EVENTS_DIR = path.join(DATA, 'events')
const compBySlug = Object.fromEntries(comps.map((c) => [c.slug, c]))

const evProblems = []
const yearFiles = fs
  .readdirSync(EVENTS_DIR)
  .filter((f) => /^\d{4}\.json$/.test(f))
  .map((f) => f.replace('.json', ''))
  .sort((a, b) => b - a)

const yearData = {}
for (const y of yearFiles) {
  const d = readJSON(path.join(EVENTS_DIR, `${y}.json`))
  if (!d || Array.isArray(d) || !Array.isArray(d.cards) || typeof d.articles !== 'object') {
    evProblems.push(`${y}.json 顶层应为 { cards: [...], articles: {...} }`)
    yearData[y] = { cards: [], articles: {} }
    continue
  }
  yearData[y] = d
}

const validateCards = (nodes, where) => {
  nodes.forEach((n, i) => {
    const keys = Object.keys(n)
    if (keys.length !== NODE_KEYS.length || keys.some((k, j) => k !== NODE_KEYS[j]))
      evProblems.push(`${where}[${i}] 卡片字段名/顺序不符: ${keys.join(',')}（期望 ${NODE_KEYS.join(',')}）`)
    if (!['news', 'event'].includes(n.kind)) evProblems.push(`${where}[${i}] kind 非法: ${JSON.stringify(n.kind)}`)
    if (n.date !== null && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(n.date)) evProblems.push(`${where}[${i}] date 非法: ${JSON.stringify(n.date)}`)
    if (!CATS.includes(n.category)) evProblems.push(`${where}[${i}] category 非法: ${JSON.stringify(n.category)}`)
    if (!n.title) evProblems.push(`${where}[${i}] title 为空`)
    if (!n.link) evProblems.push(`${where}[${i}] link 为空`)
    else if (String(n.link).includes('/')) evProblems.push(`${where}[${i}] link 必须是纯 id（不含 /）: ${n.link}`)
  })
}

const allNewsSlugs = []
let cardTotal = 0
for (const y of yearFiles) {
  const { cards } = yearData[y]
  cardTotal += cards.length
  validateCards(cards, `${y}.json cards`)
  let seenNull = false
  let prev = null
  for (const n of cards) {
    if (n.date === null) {
      seenNull = true
      continue
    }
    if (seenNull || (prev !== null && n.date > prev)) {
      evProblems.push(`${y}.json cards date 未按倒序排列（${prev} → ${n.date}）`)
      break
    }
    prev = n.date
  }
  for (const n of cards) if (n.kind === 'news') allNewsSlugs.push(String(n.link))
  // articles：字段与顺序
  for (const [id, a] of Object.entries(yearData[y].articles)) {
    const keys = Object.keys(a)
    const expected = keys.includes('subtitle') ? ['title', 'date', 'subtitle', 'blocks'] : ['title', 'date', 'blocks']
    if (keys.join(',') !== expected.join(','))
      evProblems.push(`${y}.json articles["${id}"] 字段名/顺序不符: ${keys.join(',')}（期望 ${expected.join(',')}）`)
    if (!a.title) evProblems.push(`${y}.json articles["${id}"] title 为空`)
    if (a.date !== null && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(a.date)) evProblems.push(`${y}.json articles["${id}"] date 非法: ${JSON.stringify(a.date)}`)
    if (!Array.isArray(a.blocks) || !a.blocks.length) evProblems.push(`${y}.json articles["${id}"] blocks 缺失或为空`)
    // date 为 null 表示日期待考（与卡片一致），年份由所在文件给出
    if (a.date !== null && String(a.date).slice(0, 4) !== y) evProblems.push(`${y}.json articles["${id}"] 日期年份(${String(a.date).slice(0, 4)}) 与所在文件(${y}) 不一致`)
    // related block（大事记文章 → 竞赛介绍页）指向的赛事必须存在
    for (const b of a.blocks || []) {
      if (b.type !== 'related') continue
      if (!b.text || !b.to) evProblems.push(`${y}.json articles["${id}"] related block 缺 text/to`)
      const m = String(b.to || '').match(/^\/competition\/([^/]+)$/)
      if (!m) evProblems.push(`${y}.json articles["${id}"] related.to 形状非法: ${b.to}`)
      else if (!compBySlug[m[1]]) evProblems.push(`${y}.json articles["${id}"] related.to 指向未知赛事: ${b.to}`)
    }
  }
}

const topNodes = readJSON(path.join(EVENTS_DIR, 'top.json'))
validateCards(topNodes, 'top.json')
for (const n of topNodes) if (n.kind === 'news') allNewsSlugs.push(String(n.link))
const articleTotal = yearFiles.reduce((s, y) => s + Object.keys(yearData[y].articles).length, 0)

console.log(
  `  ${evProblems.length ? 'ERR' : 'OK '}  ${yearFiles.length} 个年份文件 + top.json(${topNodes.length})  ` +
    `共 ${cardTotal + topNodes.length} 张卡片、${articleTotal} 篇文章`
)
evProblems.slice(0, 10).forEach((p) => console.log('         ' + p))
if (evProblems.length) failed += 1 + evProblems.length

// 文章 id → 年份（供下方「卡片 ↔ 文章」一致性检查使用）。
// 没有索引文件：前端靠 id 前 4 位定位年份文件，这里把同样的规则校验一遍。
const derivedArticles = {}
for (const y of yearFiles) for (const id of Object.keys(yearData[y].articles)) derivedArticles[id] = y

const idProblems = []
for (const [id, y] of Object.entries(derivedArticles)) {
  if (!id.startsWith(y + '-')) idProblems.push(`文章 id 必须以所在年份开头（${y}.json 里的 "${id}"）`)
  if (id.includes('/')) idProblems.push(`文章 id 不能含 /: ${id}`)
}
console.log('\n=== 文章 id 能否自解析年份（前端靠 id 前 4 位定位文件）===')
console.log(`  ${idProblems.length ? 'ERR' : 'OK '}  ${Object.keys(derivedArticles).length} 个文章 id`)
idProblems.slice(0, 8).forEach((p) => console.log('         ' + p))
if (idProblems.length) failed += idProblems.length

console.log('\n=== 卡片 ↔ 文章 的一致性 ===')
const artProblems = []
const cardArticles = [...topNodes, ...yearFiles.flatMap((y) => yearData[y].cards)]
const linkedIds = new Set()
for (const n of cardArticles) {
  const id = String(n.link)
  linkedIds.add(id)
  const year = derivedArticles[id]
  if (!year) {
    artProblems.push(`卡片 link 在年份文件里找不到对应文章: ${id}（${n.title}）`)
    continue
  }
  const a = yearData[year].articles[id]
  // news：卡片标题与文章标题必须一致；战报/赛事的卡片是短标签、文章是官方全称，故意不同
  if (n.kind === 'news' && a.title !== n.title) artProblems.push(`${id} title 不一致: 卡片=${JSON.stringify(n.title)} 文章=${JSON.stringify(a.title)}`)
  if (a.date !== n.date) artProblems.push(`${id} date 不一致: 卡片=${n.date} 文章=${a.date}`)
}
const orphanIds = Object.keys(derivedArticles).filter((id) => !linkedIds.has(id))
const dupNews = allNewsSlugs.filter((s, i) => allNewsSlugs.indexOf(s) !== i)
if (dupNews.length) artProblems.push(`新闻在时间轴里重复出现: ${[...new Set(dupNews)].join(', ')}`)
console.log(
  `  ${artProblems.length ? 'ERR' : 'OK '}  卡片引用 ${linkedIds.size} 篇文章（全部存在）  ` +
    `/ 无卡片入口的文章 ${orphanIds.length} 篇（参赛未获奖场次，保留但不上时间轴）`
)
artProblems.slice(0, 10).forEach((p) => console.log('         ' + p))
if (artProblems.length) failed += artProblems.length

console.log(failed ? `\n校验未通过：${failed} 处问题` : '\n全部通过。')
process.exit(failed ? 1 : 0)
