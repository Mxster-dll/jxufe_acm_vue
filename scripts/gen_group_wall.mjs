/**
 * gen_group_wall.mjs —— 「协会成员头像墙」的数据生成器
 *
 * 输入（都在 public/data/ 下，手写或由别的生成器产出）：
 *   group_members.json  QQ 群 110 人 + 站点 33 位优秀成员 + 6 位负责人，去重后 138 人
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

import { buildHonorPills } from '../src/utils/honorPills.js'
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

  // 4. 手写荣誉：三处合并、按 text 去重，且先过掉已被胶囊覆盖的
  const seen = new Set(tags.map((t) => t.text))
  const manual = [
    ...(Array.isArray(m.honors) ? m.honors : []),
    ...(m.realName ? siteHonors.get(m.realName) || [] : []),
  ]
  for (const entry of normalizeHonors(stripCoveredHonors(manual))) {
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
const messageOf = (m) =>
  heroMessages.get(shownNameOf(m)) ||
  (m.realName ? heroMessages.get(String(m.realName).trim()) : '') ||
  heroMessages.get(cleanNick(m.name)) ||
  ''

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
