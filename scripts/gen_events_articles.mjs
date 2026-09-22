#!/usr/bin/env node
/**
 * 大事记「赛事卡片」文章生成器
 * ---------------------------------------------------------------------------
 * 大事记（public/data/events/）与竞赛数据（competitions.json + awards/）是
 * 两个完全独立的部分：大事记自带一份获奖内容，允许与竞赛页重复。
 *
 * 本脚本把每张「赛事卡片」link 指向的 id 生成一篇自给自足的 article，
 * 内容来自 scripts/source/（生成器专用输入，不参与运行时）：
 *   source/editions/gplt/<年>.json    天梯赛：国赛/省赛 × 高校奖/团队奖/个人奖 + scale
 *   source/editions/lanqiao/<年>.json 蓝桥杯：国赛/省赛 × 个人奖（含科目/排名）
 *   source/baidu.json                 百度之星：决赛/初赛场次 × 获奖名单（含排名）
 *
 * 同时把历史遗留的文章 id（icpc__icpc2026__icpc2026invitational-shenyang）
 * 重命名为 <年>-<月>-<日>-<赛事>-<地名>，并把所有卡片的 link 去掉路由前缀，
 * 使 link 恒等于该年文件 articles 里的一个 key（无任何例外）。
 *
 * 幂等：重复运行结果一致。
 *
 * 用法: node scripts/gen_events_articles.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const EV = path.join(ROOT, 'public', 'data', 'events')
const SRC = path.join(import.meta.dirname, 'source')
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const writeJSON = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8')

const comps = readJSON(path.join(ROOT, 'public', 'data', 'competitions.json'))
const compBySlug = Object.fromEntries(comps.map((c) => [c.slug, c]))

const yearFiles = fs
  .readdirSync(EV)
  .filter((f) => /^\d{4}\.json$/.test(f))
  .map((f) => f.replace('.json', ''))
  .sort()

// ─────────────────────────────── 工具 ───────────────────────────────

/** '2026-07-29' → '2026-7-29'；'2011-05' → '2011-5'；'2011' → '2011' */
function datePart(date, fallbackYear = '') {
  const m = String(date ?? '').match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/)
  if (!m) return String(fallbackYear)
  const [, y, mo, d] = m
  if (!mo) return y
  if (!d) return `${y}-${Number(mo)}`
  return `${y}-${Number(mo)}-${Number(d)}`
}

/** 奖项文本 → 奖牌色 tone（用于 awards block） */
function toneOf(award) {
  const s = String(award ?? '')
  if (/特等|金|一等|冠军/.test(s)) return 'gold'
  if (/银|二等|亚军/.test(s)) return 'silver'
  if (/铜|三等|季军/.test(s)) return 'bronze'
  return ''
}

const AWARD_ORDER = ['特等奖', '一等奖', '二等奖', '三等奖', '优秀奖']
/** 把奖次文本归到 AWARD_ORDER 的档位；归不进去的原样返回 */
function awardRank(award) {
  const s = String(award ?? '').replace(/^个人|^团队|^分省团队|^全国团队/, '')
  const i = AWARD_ORDER.findIndex((x) => s.includes(x))
  return i < 0 ? String(award ?? '') : AWARD_ORDER[i]
}
const awardIndex = (a) => {
  const i = AWARD_ORDER.indexOf(awardRank(a))
  return i < 0 ? AWARD_ORDER.length : i
}

/** 按奖次档位分组 → [{ award, names: [] }]，档位从高到低 */
function groupByAward(rows, nameOf) {
  const map = new Map()
  for (const r of rows) {
    const k = awardRank(r.award)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(nameOf(r))
  }
  return [...map.entries()]
    .sort((a, b) => awardIndex(a[0]) - awardIndex(b[0]))
    .map(([award, names]) => ({ award, names }))
}

/** 蓝桥杯科目 → 组别标签：'C/C++程序设计大学B组' → 'C++ · B组' */
const LANG_MAP = { 'C/C++': 'C++', Java: 'Java', Python: 'Python' }
const GROUP_MAP = { 大学A组: 'A', 大学B组: 'B', 本科B组: 'B', 本科组: '本科', 大学组: '大学', 研究生组: '研究生' }
function subjectLabel(subject) {
  const m = String(subject ?? '').match(/^(.*?)程序设计(.+)$/)
  if (!m) return String(subject || '其他')
  const lang = LANG_MAP[m[1]] ?? m[1]
  const g = GROUP_MAP[m[2]]
  return `${lang} · ${g ? (/^[AB]$/.test(g) ? g + '组' : g) : m[2]}`
}

const teamCard = (t) => ({
  title: String(t.name ?? '').trim(),
  tone: toneOf(t.award),
  fields: [
    { label: '奖项', value: String(t.award ?? '') },
    ...(t.members ? [{ label: '成员', value: String(t.members) }] : [])
  ]
})
const uniCard = (u) => ({ title: String(u), tone: toneOf(u), fields: [] })

/** 个人奖统计表：headers 三列，left 让末列长名单左对齐 */
function personalTable(rows, { nameOf, headers = ['奖项', '人数', '获奖名单'] } = {}) {
  const groups = groupByAward(rows, nameOf)
  return {
    type: 'table',
    headers,
    rows: groups.map((g) => [g.award, `${g.names.length} 人`, g.names.join('、')]),
    left: true
  }
}

const heading = (text, icon) => ({ type: 'heading', text, ...(icon ? { icon } : {}) })
const related = (slug) => {
  const c = compBySlug[slug]
  return { type: 'related', text: `查看「${c?.shortName || c?.name || slug}」竞赛介绍`, to: `/competition/${slug}` }
}

// ─────────────────────── ① link 去前缀 + id 重命名 ───────────────────────

/** legacy 文章 id → 新 id：<年>-<月>-<日>-<赛事>-<地名> */
function newArticleId(id, date) {
  const ym = datePart(date)
  if (!ym) return id
  let d
  if (id.includes('__')) {
    const [family, , third] = id.split('__')
    if (family === 'icpc' || family === 'ccpc') d = third.replace(new RegExp(`^${family}\\d{4}`), '')
    else d = third // provincial__gx__gxcpc9th → gxcpc9th
  } else {
    d = id.replace(/^(icpc|ccpc)-?/, (m) => (m.endsWith('-') ? '' : '')).replace(/^\d{4}/, '')
    d = id.startsWith('ccpc-') ? id.slice(5).replace(/^\d{4}-/, '') : d
  }
  d = d.replace(/^[-_]+/, '').replace(/icpc(\d{4})/gi, '').replace(/^[-_]+/, '')
  const fam = id.includes('__') ? id.split('__')[0] : id.startsWith('ccpc') ? 'ccpc' : 'icpc'
  const seg = fam === 'provincial' ? '' : `${fam}-`
  return `${ym}-${seg}${d}`.replace(/-+/g, '-')
}

/**
 * 只重命名「历史遗留」id：
 *   icpc__icpc2026__icpc2026invitational-shenyang （双下划线三段式）
 *   icpc2021shanghai / ccpc-2025-changchun          （裸赛事名+年份）
 * 已经是 <年>-<月>-<日>-... 或 <年>-<slug>-<阶段> 的 id 一律不动（保证幂等）。
 */
const isLegacy = (id) => id.includes('__') || /^(icpc|ccpc)-?\d{4}[A-Za-z_-]/.test(id)

const renames = new Map()
let stage1 = { links: 0, ids: 0 }

// 先算重命名映射（基于当前 articles 的 date）
for (const y of yearFiles) {
  const d = readJSON(path.join(EV, `${y}.json`))
  for (const [id, a] of Object.entries(d.articles)) {
    if (!isLegacy(id)) continue
    const nid = newArticleId(id, a.date)
    if (nid !== id) renames.set(id, nid)
  }
}

// 唯一性检查
{
  const seen = new Map()
  for (const y of yearFiles) {
    const d = readJSON(path.join(EV, `${y}.json`))
    for (const id of Object.keys(d.articles)) {
      const fin = renames.get(id) ?? id
      if (seen.has(fin)) throw new Error(`id 冲突: ${fin} ← ${seen.get(fin)} / ${id}`)
      seen.set(fin, id)
    }
  }
}

// 应用重命名 + 去 link 前缀
for (const y of yearFiles) {
  const file = path.join(EV, `${y}.json`)
  const d = readJSON(file)
  const arts = {}
  for (const [id, a] of Object.entries(d.articles)) {
    const nid = renames.get(id) ?? id
    arts[nid] = a
    if (nid !== id) stage1.ids++
  }
  d.articles = arts
  for (const c of d.cards) {
    const before = c.link
    // 去掉路由前缀，再把重命名过的 id 换成新 id
    let id = String(c.link).replace(/^\/(action|contest-news)\//, '')
    id = renames.get(id) ?? id
    c.link = id
    if (c.link !== before) stage1.links++
  }
  writeJSON(file, d)
}

// top.json
{
  const file = path.join(EV, 'top.json')
  const tops = readJSON(file)
  for (const c of tops) {
    const before = c.link
    let id = String(c.link).replace(/^\/(action|contest-news)\//, '')
    id = renames.get(id) ?? id
    c.link = id
    if (c.link !== before) stage1.links++
  }
  writeJSON(file, tops)
}

console.log(`① link 去前缀 + id 重命名：重命名 ${stage1.ids} 条 id，改写 ${stage1.links} 张卡片 link`)
console.log(`   剩余带前缀的 link：${countPrefixed()}`)

function countPrefixed() {
  let n = 0
  for (const y of yearFiles) {
    for (const c of readJSON(path.join(EV, `${y}.json`)).cards) if (c.link.includes('/')) n++
  }
  for (const c of readJSON(path.join(EV, 'top.json'))) if (c.link.includes('/')) n++
  return n
}

// ─────────────────── ② 赛事卡片 → 独立文章 ───────────────────

const gpltSrc = {}
for (const f of fs.readdirSync(path.join(SRC, 'editions', 'gplt'))) {
  const e = readJSON(path.join(SRC, 'editions', 'gplt', f))
  gpltSrc[String(e.year)] = e
}
const lanqiaoSrc = {}
for (const f of fs.readdirSync(path.join(SRC, 'editions', 'lanqiao'))) {
  const e = readJSON(path.join(SRC, 'editions', 'lanqiao', f))
  lanqiaoSrc[String(e.year)] = e
}
const baiduSrc = readJSON(path.join(SRC, 'baidu.json'))

/** 天梯赛：一届一张卡，国赛 + 省赛全列 */
function buildGplt(year, card) {
  const e = gpltSrc[String(year)]
  if (!e) return null
  const blocks = []
  if (e.scale) blocks.push({ type: 'text', paras: [e.scale] })
  for (const [stageKey, label, icon] of [
    ['national', '国赛获奖情况', 'fa-trophy'],
    ['provincial', '省赛获奖情况', 'fa-medal']
  ]) {
    const st = e[stageKey] || {}
    const uni = st.university || [], teams = st.teams || [], personal = st.personal || []
    if (!uni.length && !teams.length && !personal.length) continue
    blocks.push(heading(label, icon))
    if (uni.length) blocks.push({ type: 'awards', heading: '高校奖', cards: uni.map(uniCard) })
    if (teams.length) blocks.push({ type: 'awards', heading: '团队奖', cards: teams.map(teamCard) })
    if (personal.length)
      blocks.push(personalTable(personal, { nameOf: (p) => `${p.name}（${p.score}）`, headers: ['奖项', '人数', '姓名（成绩）'] }))
  }
  blocks.push(related('gplt'))
  return { title: card.title, date: card.date, blocks }
}

/** 蓝桥杯：一届两张卡（省赛 / 国赛），各写各的 */
function buildLanqiao(year, card) {
  const e = lanqiaoSrc[String(year)]
  if (!e) return null
  const isProvincial = /省赛/.test(card.title)
  const st = (isProvincial ? e.provincial : e.national) || {}
  const personal = st.personal || []
  const label = isProvincial ? '省赛获奖情况' : '国赛获奖情况'
  const blocks = []
  if (e.scale) blocks.push({ type: 'text', paras: [e.scale] })
  blocks.push(heading(label, isProvincial ? 'fa-medal' : 'fa-trophy'))
  if (!personal.length) blocks.push({ type: 'text', paras: ['本届暂无获奖记录。'] })
  else {
    // 按 组别 × 奖次 分组，行 = (组别, 奖项, 人数, 名单)
    const byGroup = new Map()
    for (const p of personal) {
      const g = subjectLabel(p.score)
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g).push(p)
    }
    blocks.push({
      type: 'table',
      headers: ['组别', '奖项', '人数', '获奖名单'],
      left: true,
      rows: [...byGroup.entries()].flatMap(([g, rows]) =>
        groupByAward(rows, (p) => p.name).map((x) => [g, x.award, `${x.names.length} 人`, x.names.join('、')])
      )
    })
  }
  blocks.push(related('lanqiao'))
  return { title: card.title, date: card.date, blocks }
}

/** 百度之星：一届若干张卡（决赛 / 初赛·第N场） */
function buildBaidu(year, card) {
  const y = (baiduSrc.years || []).find((x) => String(x.year) === String(year))
  if (!y) return null
  const isFinal = /决赛/.test(card.title)
  const m = card.title.match(/初赛·第(.+?)场/)
  let stage = null, group = null
  for (const s of y.stages || []) {
    if (isFinal && s.key === 'final') stage = s
    if (!isFinal && s.key === 'preliminary') stage = s
  }
  if (m && stage) group = (stage.groups || []).find((g) => g.label === `第${m[1]}场`) || null
  if (isFinal && stage) group = (stage.groups || [])[0] || null
  const blocks = []
  const label = isFinal ? '决赛获奖情况' : `初赛·${group?.label || ''}获奖情况`
  blocks.push(heading(label, isFinal ? 'fa-trophy' : 'fa-medal'))
  const rows = group?.rows || []
  if (!rows.length) blocks.push({ type: 'text', paras: ['本场暂无获奖记录。'] })
  else
    blocks.push(
      personalTable(rows, { nameOf: (r) => `${r.name}（#${r.rank}）`, headers: ['奖项', '人数', '获奖名单（排名）'] })
    )
  if (group?.rows?.[0]?.src) blocks.push({ type: 'text', paras: [`来源：${group.rows[0].src}`] })
  blocks.push(related('baidu'))
  return { title: card.title, date: card.date, blocks }
}

const BUILDERS = { gplt: buildGplt, lanqiao: buildLanqiao, baidu: buildBaidu }

/**
 * 判断一张卡片是不是「赛事卡片」，并给出 (slug, 竞赛年份)。
 *   首次运行：link 还是 /competition/<slug>/<年>
 *   再次运行：link 已是纯 id，且它指向的文章带 related block（生成器的标记）
 * 两种情况都能识别，因此脚本可重复运行。
 */
function competitionRef(card, fileYear, articles) {
  const m = String(card.link).match(/^\/competition\/([^/]+)\/(\d{4})$/)
  if (m) return { slug: m[1], year: String(card.date || fileYear).slice(0, 4) }
  const a = articles[card.link]
  const rel = (a?.blocks || []).find((b) => b.type === 'related')
  const m2 = String(rel?.to || '').match(/^\/competition\/([^/]+)$/)
  if (m2) return { slug: m2[1], year: String(a.date || fileYear).slice(0, 4) }
  return null
}

let generated = 0
const missed = []
for (const y of yearFiles) {
  const file = path.join(EV, `${y}.json`)
  const d = readJSON(file)
  for (const c of d.cards) {
    const ref = competitionRef(c, y, d.articles)
    if (!ref) continue
    const { slug, year: cy } = ref
    const build = BUILDERS[slug]
    if (!build) { missed.push(`${slug}/${cy}`); continue }
    const art = build(cy, c)
    if (!art) { missed.push(`${slug}/${cy}`); continue }
    const nid = competitionArticleId(c, cy, slug)
    c.link = nid
    d.articles[nid] = art
    generated++
  }
  writeJSON(file, d)
}

function competitionArticleId(card, year, slug) {
  let stage = ''
  if (slug === 'lanqiao') stage = /省赛/.test(card.title) ? 'provincial' : 'national'
  else if (slug === 'baidu') {
    const m = card.title.match(/初赛·第(.+?)场/)
    stage = /决赛/.test(card.title) ? 'final' : m ? `preliminary-${m[1]}` : 'preliminary'
  }
  const base = datePart(card.date, year)
  return [base, slug, stage].filter(Boolean).join('-')
}

console.log(`② 赛事卡片文章：生成/刷新 ${generated} 篇${missed.length ? `，未匹配 ${missed.length}：${missed.join(', ')}` : ''}`)
console.log(`   剩余带前缀的 link：${countPrefixed()}`)

const arts = yearFiles.reduce((s, y) => s + Object.keys(readJSON(path.join(EV, `${y}.json`)).articles).length, 0)
const cards = yearFiles.reduce((s, y) => s + readJSON(path.join(EV, `${y}.json`)).cards.length, 0)
console.log(`\n现在 events/：${yearFiles.length} 年 / ${cards} 张卡片 / ${arts} 篇文章`)
