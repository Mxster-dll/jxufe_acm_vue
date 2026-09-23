/**
 * gen_group_wall.mjs —— 「协会成员头像墙」的数据生成器
 *
 * 输入（都在 public/data/ 下，手写或由别的生成器产出）：
 *   group_members.json  QQ 群 110 人 + 站点 33 位优秀成员 + 6 位负责人，去重后 138 人
 *   wall_rules.json     入墙规则（会长维护）：people[] 无条件入墙 + scoreThreshold 分数达标自动入墙
 *   duties.json         协会职务胶囊（19 人 / 26 条，来自两份干事名单）
 *   members.json        优秀成员的荣誉
 *   leaders.json        负责人的荣誉
 *   awards/*.json       站点的结构化获奖数据 → 自动汇总成比赛战绩胶囊
 *   hero_wall.json      主仓库手写的留言（**只读**）→ 按姓名并入，对不上就不写
 *
 * 输出（都是生成物，请勿手改）：
 *   group_wall.manifest.json   { source, count, images[] }        —— 墙上铺哪些图
 *   group_wall.json            { tiles: { 文件名: 文案 } }         —— 每格的姓名/副题/标签
 *
 * 为什么不复用首页那份 hero_wall.json：
 *   那份是**手写**的 33 人（优秀成员），而这里是 138 人、且内容全部可推导
 *   （职务来自名单、战绩来自 awards、荣誉来自两份站点名单），所以整份重生成。
 *   形状与 hero_wall.json 完全一致，故 HeroAvatarWall 组件不用改就能吃：
 *   只需传 :manifest-url / :copy-url / :thumbs-base 三个 prop。
 *
 * 标签口径（顺序即显示顺序，2026-09-22 会长裁定）：
 *   会长身份（金）→ 协会职务（绿）→ 比赛战绩胶囊（蓝）→ 手写荣誉（按类型分色）
 *   卡片只有 360×132，故最多 6 枚，超出补一枚「…」（more，灰色虚线）。
 *
 * 荣誉来源三合一张表并按 text 去重（与头像墙组件的口径一致）：
 *   group_members.json 的 honors + members.json 的 honors + leaders.json 的 achievements。
 *   其中**已被自动汇总覆盖**的竞赛条目会先过掉（口径与判定见 src/utils/honorCoverage.js）——
 *   否则同一块奖牌会在卡上出现两遍、把 6 枚的位置全占了。
 *
 * 顺序：名单按身份排序（群主/管理员/成员…），优秀成员又是追加在末尾的，
 *   不打乱就会在墙上连成一片。故用**固定种子**的 LCG 洗牌 —— 输出可复现，
 *   也不依赖 Math.random()（那会让每次 build 产生不同的文件）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildHonorPills, collectRecords, MANUAL_PILLS } from '../src/utils/honorPills.js'
import { rankMembers } from '../src/utils/honorRanking.js'
import { normalizeHonors } from '../src/utils/honorType.js'
import { stripCoveredHonors } from '../src/utils/honorCoverage.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'public/data')
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8')

const AWARD_FILES = ['icpc', 'ccpc', 'gplt-team', 'gplt-individual', 'lanqiao', 'baidu']

/** 卡片最多放几枚标签；超出补「…」 */
const MAX_TAGS = 6

/** 群昵称里的不可见字符：控制符 / 盲文空白 / 韩文填充 / 零宽与变体选择符 */
const BLANK_RE = /[\p{C}\u2800\u3164\uffa0\u115f\u1160\u180e\ufe00-\ufe0f]/gu

const cleanNick = (text) => String(text ?? '').replace(BLANK_RE, '').trim()

/** 显示名三层回退：displayName → realName → 清洗过的群昵称 → 「成员 <QQ>」 */
const shownNameOf = (m) =>
  String(m.displayName || '').trim() ||
  String(m.realName || '').trim() ||
  cleanNick(m.name) ||
  (m.qq ? `成员 ${m.qq}` : '成员')

/** 固定种子的 LCG（与组件里那套同源：s = s*1103515245 + 12345 mod 2^31） */
function shuffle(list, seed = 20260922) {
  const arr = [...list]
  let s = seed >>> 0
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------- 读数据 ----------
const group = readJson(path.join(DATA, 'group_members.json'))
const members = group.members || []

/* ── 入墙规则：公开数据文件 public/data/wall_rules.json（会长维护）──
   本脚本**不再硬编码任何人名**（2026-09-23 会长裁定）。规则两块，每次 predev/prebuild 自动应用：
     people[]        —— 无条件入墙：其他协会的会长、主仓库头像墙上的人、临时补的人…
     scoreThreshold  —— 分数达到该值的人自动入墙（分数由 honorRanking.js 算出，见下面那段）
   为什么不写进 group_members.json：那份由工作区的 qq-group-avatars/build_site_assets.py
   从群名单派生，手改会被下次重新生成刷掉；而本生成器每次构建都跑，规则不会被刷掉。
   头像直接引用站内已有的图（不重复存一份）；缩略图由 scripts/gen_group_wall_thumbs.ps1
   按 tiles 的 `full` 出（它按 mtime 跳过已存在的）。
   ⚠ 作者墙上第 4 位「多喜长安」**不要写进 rules**：他就是我们的 2024学年会长衷铭川，
     人已经在墙上，再加一次会变成两张卡；他的留言走 HERO_WALL_ALIAS 挂到真名上。 */
const rules = (() => {
  try {
    return readJson(path.join(DATA, 'wall_rules.json'))
  } catch {
    console.warn('[group-wall] 读不到 public/data/wall_rules.json —— 按「只有群成员」生成')
    return {}
  }
})()
const SCORE_THRESHOLD = Number(rules.scoreThreshold) || 0
const rulePeople = (Array.isArray(rules.people) ? rules.people : []).filter((p) => p && p.name)

/** 规则名单里的人：按真名与墙上现有的人去重，已经在墙上的只留原记录（不新增第二张卡） */
const wallKeys = new Set(members.map((m) => String(m.realName || m.name || '').trim()))
for (const p of rulePeople) {
  const key = String(p.name).trim()
  if (!key || wallKeys.has(key)) continue
  wallKeys.add(key)
  members.push({
    name: key,
    realName: key, // 荣誉/战绩/职务都按真名匹配；规则里的人用它自己当匹配键
    className: String(p.className || '').trim(),
    photo: String(p.photo || '').trim(),
    thumb: String(p.photo || '').trim(),
    role: String(p.role || '成员'),
    roleKey: String(p.roleKey || 'member'),
    ...(p.title ? { title: String(p.title) } : {}),
    ...(p.displayName ? { displayName: String(p.displayName) } : {}),
    ...(p.from ? { fromRule: String(p.from) } : {}),
  })
}
const duties = readJson(path.join(DATA, 'duties.json'))
const membersJson = readJson(path.join(DATA, 'members.json'))
const leadersJson = readJson(path.join(DATA, 'leaders.json'))

const awards = {}
for (const f of AWARD_FILES) awards[f] = readJson(path.join(DATA, `awards/${f}.json`))
const competitions = readJson(path.join(DATA, 'competitions.json'))

const pillsByName = buildHonorPills({ awards, competitions })

/** 站点两份名单的荣誉：按真名索引（与墙上的 realName 对齐） */
const siteHonors = new Map()
const addSite = (name, list) => {
  if (!name) return
  if (!siteHonors.has(name)) siteHonors.set(name, [])
  siteHonors.get(name).push(...(Array.isArray(list) ? list : []))
}
for (const m of membersJson) addSite(m.name, m.honors)
for (const l of leadersJson) addSite(l.name, l.achievements)

/** 站点名单里的班级/头像：墙上那份是群昵称侧整理的，只有 36 人有班级，补全一下。
    `----` 是匿名同学故意留的占位（别把「----」当班级写进副题）。 */
const siteClass = new Map()
const sitePhoto = new Map()
for (const m of membersJson) {
  if (m.name && m.class && m.class !== '----') siteClass.set(m.name, String(m.class))
  if (m.name && m.photo) sitePhoto.set(m.name, String(m.photo))
}
for (const l of leadersJson) {
  if (l.name && l.class && l.class !== '----') siteClass.set(l.name, String(l.class))
  // leaders 的字段名是 avatar（站点既有数据的字段名不统一，见 AGENTS.md）
  if (l.name && l.avatar) sitePhoto.set(l.name, String(l.avatar))
}

/** 一个成员「洗干净的手写荣誉」：group_members 的 honors + 站点两份名单的荣誉，
    先过掉已被自动汇总覆盖的竞赛条目，再归一化出类型。
    **标签与打分共用这一份** —— 否则同一块奖牌会在卡上显示两遍、在分值里算两遍
    （口径与判定见 src/utils/honorCoverage.js）。 */
const manualHonorsOf = (m) =>
  normalizeHonors(
    stripCoveredHonors([
      ...(Array.isArray(m.honors) ? m.honors : []),
      ...(m.realName ? siteHonors.get(m.realName) || [] : []),
    ])
  )

// ---------- 逐人组标签 ----------
const tagsOf = (m) => {
  const tags = []

  // 1. 会长身份（金色）：只由 leaders 那 6 人生成，与「协会职务」是两回事
  if (m.title) tags.push({ text: String(m.title), type: 'leader' })

  // 2. 协会职务（绿色）：duties.json 按年份升序，同一年只取带职务的那条（生成器已保证）
  const duty = m.realName ? duties.people?.[m.realName] : null
  if (Array.isArray(duty)) for (const d of duty) if (d?.text) tags.push({ text: String(d.text), type: 'honor' })

  // 3. 比赛战绩胶囊（蓝色 + stat）：来自 awards 的自动汇总
  const pills = m.realName ? pillsByName.get(m.realName) : null
  if (Array.isArray(pills)) for (const p of pills) tags.push({ text: p, type: 'contest' })

  // 4. 手写荣誉：三处合并、按 text 去重，且先过掉已被胶囊覆盖的（与打分共用 manualHonorsOf）
  const seen = new Set(tags.map((t) => t.text))
  for (const entry of manualHonorsOf(m)) {
    if (!entry.text || seen.has(entry.text)) continue
    seen.add(entry.text)
    tags.push(entry)
  }

  if (tags.length <= MAX_TAGS) return tags
  return [...tags.slice(0, MAX_TAGS - 1), { text: '…', type: 'more' }]
}

// ---------- 组装 ----------
/** public/ 下这个站内绝对路径存在吗（生成时判一次，免得墙上出现碎图） */
const existsInPublic = (url) => {
  try {
    return fs.existsSync(path.join(ROOT, 'public', String(url).replace(/^\//, '')))
  } catch {
    return false
  }
}

/** 头像原图。`file` 一律用群归档里的缩略图名（缩略图生成器按 tiles 的 `full` 出图，
    名字对不对得上不重要），`full` 才是需要修的那个：
      1. 原图路径失效 → 退回站点名单里的照片（WIP 那轮给优秀成员用的是拼音名
         `excellent_member/<拼音>.png`，主仓库里没有这些文件，12 人中招）；
      2. 本来就是占位图（群主「无名」= 陈煜仕，当前会长）→ 同样换成站点照片，
         现任会长在墙上是一块空白太显眼。
    两者的原图都能从 members.json 的 photo / leaders.json 的 avatar 找到（按真名）。 */
const imageOf = (m) => {
  const thumb = path.basename(String(m.thumb || ''))
  const photo = String(m.photo || '').trim()
  const site = m.realName ? sitePhoto.get(m.realName) : null
  if (site && photo !== site && (m.blank || !photo || !existsInPublic(photo))) {
    return { file: thumb, full: site, repaired: true }
  }
  return { file: thumb, full: photo, repaired: false }
}

/* ── 「分数 ≥ scoreThreshold 的人自动入墙」────────────────────────────
   会长 2026-09-23：「我们不是有显示排名分数吗，我希望你设定一个阈值，分数高于 xxx 的自动入墙」。
   分数口径与优秀成员页的「卡片显示顺序」**逐字一致**（同一个 honorRanking.js、同一份洗过的
   手写荣誉、同一个 MANUAL_PILLS），所以这里算出的分数与页面上看到的名次永远对得上。
   候选池 = 墙上每个人 + 站点两份名单（万一有人不在群里、也不在墙上，但拿了奖、又有头像，
   这条规则会把他带进墙来）。**今天它不会新增任何人** —— 群里 81 位有真名的人已经覆盖了
   全部 ≥5 分的人；它是给后续数据（新人拿奖、别的协会的人转入）留的自动入口。 */
const scoreKeyOf = (m) => String(m.realName || m.name || '').trim()
const scorePool = new Map()
for (const m of members) {
  const key = scoreKeyOf(m)
  if (key && !scorePool.has(key)) scorePool.set(key, { name: key, honors: manualHonorsOf(m) })
}
for (const p of [...membersJson, ...leadersJson]) {
  const key = String(p?.name || '').trim()
  if (!key || scorePool.has(key)) continue
  scorePool.set(key, { name: key, honors: manualHonorsOf({ name: key, realName: key }) })
}
const { byName: scoreByName } = rankMembers({
  members: [...scorePool.values()],
  recordsByName: collectRecords({ awards, competitions }),
  manualPills: MANUAL_PILLS,
})

const addedByScore = []
const skippedByScore = []
if (SCORE_THRESHOLD > 0) {
  const onWall = new Set(members.map(scoreKeyOf))
  for (const [name, row] of scoreByName) {
    if (row.total < SCORE_THRESHOLD || onWall.has(name)) continue
    const photo = String(sitePhoto.get(name) || '').trim()
    // 没有可用头像的人上不了墙（缩略图生成器要拿原图出图），跳过并记一笔
    if (!photo || !existsInPublic(photo)) {
      skippedByScore.push(`${name} ${row.total.toFixed(1)} 分`)
      continue
    }
    onWall.add(name)
    const site = [...membersJson, ...leadersJson].find((p) => String(p?.name || '') === name)
    members.push({
      name,
      realName: name,
      // 「不愿透露姓名的同学」的对外显示名写在站点名单里，必须带过来 ——
      // 否则按分数自动入墙会把他的真名写进 tiles，等于绕过匿名机制
      ...(site?.displayName ? { displayName: String(site.displayName) } : {}),
      className: siteClass.get(name) || '',
      photo,
      thumb: path.basename(photo),
      role: '成员',
      roleKey: 'member',
      fromScore: Number(row.total.toFixed(2)),
    })
    addedByScore.push(`${name} ${row.total.toFixed(1)} 分`)
  }
}

let repaired = 0

/* ── 留言：并入主仓库 hero_wall.json 里已有的那几条（只读，不改它）──
   会长 2026-09-23 裁定：按姓名自动匹配，「能对上几个算几个」。
   对不上就留空 —— 组件对空留言一个字符都不渲染（作者自己的口径：墙上没留言的是绝大多数，
   写一句「这位成员还没有留言」只是噪音）。
   匹配键取「显示名 → 真名 → 清洗后的群昵称」：作者那几条留言里既有真名（陈菁雅、黄简鑫）
   也有网名（Thea、多喜长安），而网名正好是我们墙上显示的群昵称。 */
const heroMessages = new Map()
try {
  const hero = readJson(path.join(DATA, 'hero_wall.json'))
  for (const t of Object.values(hero?.tiles || {})) {
    const name = String(t?.name || '').trim()
    const msg = String(t?.message || '').trim()
    if (name && msg && !heroMessages.has(name)) heroMessages.set(name, msg)
  }
} catch {
  // hero_wall.json 不存在也不影响：留言留空即可，其它字段照旧
}
/** hero_wall 里用网名、而我们的主键是真名的人（目前只有一个，见 EXTRA_MEMBERS 注释） */
const HERO_WALL_ALIAS = { 衷铭川: '多喜长安' }

/** 按「显示名 → 真名 → 清洗后的群昵称 → 别名」依次找留言；找不到返回空串 */
const messageOf = (m) => {
  const real = String(m.realName || '').trim()
  const keys = [shownNameOf(m), real, cleanNick(m.name), HERO_WALL_ALIAS[real], HERO_WALL_ALIAS[shownNameOf(m)]]
  for (const k of keys) {
    const hit = k ? heroMessages.get(k) : ''
    if (hit) return hit
  }
  return ''
}

const items = shuffle(members).map((m) => {
  const img = imageOf(m)
  if (img.repaired) repaired++
  const message = messageOf(m)
  return {
    file: img.file,
    tile: {
      name: shownNameOf(m),
      line: String(m.className || '').trim() || (m.realName ? siteClass.get(m.realName) || '' : ''),
      full: img.full,
      tags: tagsOf(m),
      // 只有主仓库写过的留言才落这个字段；没有就整个字段不写，不在 JSON 里堆空串
      ...(message ? { message } : {}),
    },
  }
})

const missing = items.filter((x) => !x.tile.full || !existsInPublic(x.tile.full))
if (missing.length) {
  console.warn(`[group-wall] ${missing.length} 人的原图仍不可用（缩略图失败时会露出碎图）：`)
  for (const x of missing.slice(0, 10)) console.warn(`             ${x.tile.name} → ${x.tile.full || '(空)'}`)
}
if (repaired) console.log(`[group-wall] ${repaired} 人的原图修正为站点名单里的照片（路径失效或占位图）`)
if (rulePeople.length) console.log(`[group-wall] 规则名单 ${rulePeople.length} 人（wall_rules.json 的 people[]）`)
console.log(
  `[group-wall] 分数阈值 ${SCORE_THRESHOLD} 分：` +
    (addedByScore.length ? `新增 ${addedByScore.length} 人 → ${addedByScore.join('、')}` : '无新增（墙上的人已覆盖全部达标者）') +
    (skippedByScore.length ? `；${skippedByScore.length} 人达标但无头像被跳过（${skippedByScore.join('、')}）` : '')
)

const now = new Date().toISOString()
writeJson(path.join(DATA, 'group_wall.manifest.json'), {
  _note: '生成物，请勿手改。由 scripts/gen_group_wall.mjs 从 group_members.json 生成。',
  generated_at: now,
  source: '/images/group_members/full/',
  count: items.length,
  images: items.map((x) => x.file),
})
writeJson(path.join(DATA, 'group_wall.json'), {
  _note:
    '生成物，请勿手改。key 是缩略图文件名，value 是悬浮卡片的内容（同 hero_wall.json 的形状）。' +
    '由 scripts/gen_group_wall.mjs 生成：职务来自 duties.json、战绩来自 awards/、' +
    '荣誉来自 group_members.json + members.json + leaders.json、' +
    '留言按姓名并入主仓库 hero_wall.json（对不上就没有这个字段）。',
  generated_at: now,
  tiles: Object.fromEntries(items.map((x) => [x.file, x.tile])),
})

const tagTally = items.reduce((s, x) => s + x.tile.tags.length, 0)
const typeTally = {}
for (const x of items) for (const t of x.tile.tags) typeTally[t.type || '(无类型)'] = (typeTally[t.type || '(无类型)'] || 0) + 1
console.log(
  `[group-wall] ${items.length} 人 / ${tagTally} 枚标签 → group_wall.manifest.json + group_wall.json`
)
console.log('[group-wall] 标签分类：' + Object.entries(typeTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '))
