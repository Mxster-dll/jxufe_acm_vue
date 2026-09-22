/**
 * 比赛战绩胶囊：从站点的 awards 数据（public/data/awards/*.json）聚合出每人的奖牌摘要。
 *
 * 为什么要有它：「优秀成员」「协会负责人」两页原先手写 ICPC / CCPC / 天梯赛 /
 * 蓝桥杯的荣誉条目，比赛一多就得手工维护、还容易漏。现在直接从 awards/<file>.json
 * 汇总成一枚枚「xCPC 区域赛🥈2🥉1」式的胶囊，数据一更新页面自动跟上。
 *
 * 【与 PR #12 那版的区别】旧版读 /data/editions/<slug>/<year>.json 与 /data/baidu.json，
 * 那两处在主仓库的新数据层（e5da23a）里已被删除，取数会 404 —— 本文件是照新数据层重写的。
 * 字段映射（2026-09 逐一实测对账，见下）：
 *   edition.year          → 有 session 用 competitions.json 的 sessions 反查年份，否则 date 前四位
 *   team.members 顿号串    → members[] 姓名数组
 *   award 中文文本         → medal_type（grand/gold/silver/bronze，已结构化）+ medal_level
 * 行数对账（新层 vs 旧 editions）：icpc 32 = 32；ccpc 45 = 旧 43 + 新层多出的 2 条 2026-05-24
 * 江西省赛 provincial 行；gplt/lanqiao/baidu 见各节注释。差异全部已解释，无静默丢失。
 *
 * 口径（2026-09 与会长逐条裁定，改动前先问）：
 *  - 四个系列：xCPC（ICPC + CCPC 合并）/ 天梯赛 / 百度之星 / 蓝桥杯。
 *    **chuanzhi.json 有意不汇总**：该文件当前为空，且传智杯的荣誉一直是手写条目；
 *    若将来它有了数据，加进 AWARD_FILES 之前先确认手写条目的去留，否则会重复显示。
 *  - xCPC 的「区域赛 / 邀请赛」与「省赛」分成两枚胶囊，省赛单独一枚
 *  - 「暨X省赛」的邀请赛（如 ICPC全国邀请赛（南昌）暨江西省赛）：邀请赛与省赛【各计一次】
 *  - **省赛段只认江西省赛**（会长 2026-09 裁定）：其他省的省赛 / 区赛（广东、河南、
 *    广西、山东、吉林、东北、湖北、福建、河北、贵州…）不计入省赛段，只计邀请赛。
 *  - 天梯赛：团体（只统计国赛团队奖；分省团队奖在数据里没有成员名单，无法归属到人）/ 个人
 *  - 百度之星：决赛（medal_level=national）→ 国赛、初赛（provincial）→ 省赛
 *  - 优秀奖不计入任何奖牌数（新 awards 层根本不收优秀奖，天然满足；旧层是数据源保留、
 *    展示层过滤 —— 效果相同，但数据里「有没有」变了，这是有意的）
 *  - CCPC 女生专场不并进计数分段，按「2021 CCPC女生专场 铜牌」单独列一条
 *  - **特等奖（grand）是独立一档**（2026-09 会长裁定）：单独计数、前面显示 🏆，
 *    不并入金牌；分值见 honorRanking.js 的 MEDAL_BASE.grand。全站当前只有一条
 *    （第五届蓝桥杯国赛 陈天楚），是 e5da23a 建新数据层时按「一等/二等/三等」映射
 *    丢掉的，已用 PR #13 补回并加了校验白名单。
 *  - 同一场团队奖，队内每人各计一枚（这正是「🥈2」的含义）
 *  - 零奖牌的档位不显示（如「区域赛🥈2🥉1」里没有 🥇）
 */

const DATA_ROOT = '/data'

/**
 * 参与汇总的 awards 文件。文件本身就区分了团队赛与个人赛
 * （gplt-team / gplt-individual 是同一届的两个文件），不用再靠 level 猜。
 */
const AWARD_FILES = ['icpc', 'ccpc', 'gplt-team', 'gplt-individual', 'lanqiao', 'baidu']

/** awards 文件 → 胶囊里的系列键 */
const FAMILY_OF_FILE = {
  icpc: 'xcpc',
  ccpc: 'xcpc',
  'gplt-team': 'gplt',
  'gplt-individual': 'gplt',
  lanqiao: 'lanqiao',
  baidu: 'baidu',
}

/** awards 文件 → competitions.json 里的 slug（年份靠它的 sessions 映射反查） */
const COMPETITION_OF_FILE = {
  icpc: 'icpc',
  ccpc: 'ccpc',
  'gplt-team': 'gplt',
  'gplt-individual': 'gplt',
  lanqiao: 'lanqiao',
  baidu: 'baidu',
}

/** 个人赛文件（一行一个人/一队人，但分段按个人赛算） */
const PERSONAL_FILES = new Set(['gplt-individual', 'lanqiao', 'baidu'])

/** 系列键 → 胶囊开头的名字 */
export const FAMILY_LABELS = {
  xcpc: 'xCPC',
  gplt: '天梯赛',
  baidu: '百度之星',
  lanqiao: '蓝桥杯',
}

const FAMILY_ORDER = ['xcpc', 'gplt', 'baidu', 'lanqiao']
/** 奖牌档位顺序：特等奖在最前（会长 2026-09 裁定，独立一档不并入金牌） */
const MEDAL_ORDER = ['grand', 'gold', 'silver', 'bronze']
const MEDAL_EMOJI = { grand: '🏆', gold: '🥇', silver: '🥈', bronze: '🥉' }
const MEDAL_TEXT = { grand: '特等奖', gold: '金牌', silver: '银牌', bronze: '铜牌' }

/** 分段顺序（xCPC 的省赛单独成胶囊，故不在此列） */
const SEGMENT_ORDER = {
  // 省赛与区域赛/邀请赛同属一枚胶囊（会长 2026-09-23 合并，原先省赛单独成枚）。
  // 三段各自是一个折行单位（见 recordsToPillParts），故合并后不会互相挤在一起。
  xcpc: ['区域赛', '邀请赛', '省赛'],
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
  // 每枚胶囊是**分段数组**（与 recordsToPillParts 同一形状）：省赛与邀请赛同枚、
  // 各自是一个折行单位（会长 2026-09-23 把 xCPC 省赛并回同枚）。
  // 系列名只写在第一段上，避免折行后第二段孤零零出现「xCPC 省赛」。
  vesper: [['xCPC 邀请赛🥉1', '省赛🥇1']],
}

/** CCPC 女生专场：单列，不并进计数分段 */
const GIRLS_RE = /女生|专场/
/**
 * 省赛段只认江西省赛（会长 2026-09 裁定：其他省的省赛不计）。
 * 新数据层里江西省赛以「XX全国邀请赛（南昌）暨江西省赛」的 competition_name 出现，
 * 故按「江西」判定；顺带也覆盖将来可能出现的独立「江西省赛」行。
 */
const JIANGXI_RE = /江西/

const zeroCounts = () => ({ grand: 0, gold: 0, silver: 0, bronze: 0 })

/** 队内成员串（「万俊哲、张云菲、衷铭川」）→ 姓名数组；新数据层已是数组，这里只兜底 */
const splitMembers = (text) =>
  Array.isArray(text)
    ? text.map((s) => String(s).trim()).filter(Boolean)
    : String(text || '')
        .split(/[、,，/]+/)
        .map((s) => s.trim())
        .filter(Boolean)

/**
 * 团队奖落到哪些分段。
 * 返回数组：因为「暨江西省赛」的邀请赛要同时落进「邀请赛」和「省赛」两段。
 * 新版只看结构化的 medal_level（不再靠中文正则猜档位），唯一例外是「女生专场」——
 * 它在数据里同样是 provincial，必须先按赛事名挑出来单列，否则会混进省赛桶。
 * 返回空数组 = 这条不计入任何分段（非江西的省赛 / 区赛）。
 */
export function teamSegments(family, row) {
  const name = String(row?.competition_name || '')
  if (family === 'gplt') return ['团体']
  if (GIRLS_RE.test(name)) return ['girls']
  if (row?.medal_level === 'provincial') return JIANGXI_RE.test(name) ? ['省赛'] : []
  if (row?.medal_level === 'invitational') {
    return JIANGXI_RE.test(name) ? ['邀请赛', '省赛'] : ['邀请赛']
  }
  return ['区域赛']
}

/**
 * 个人奖落到哪个分段。天梯赛个人 / 蓝桥杯 / 百度之星各有自己的两档。
 * 天梯赛个人奖在数据里全是 national，故直接归「个人」。
 */
export function personalSegments(family, row) {
  if (family === 'gplt') return ['个人']
  if (family === 'lanqiao' || family === 'baidu') {
    return [row?.medal_level === 'national' ? '国赛' : '省赛']
  }
  return []
}

/** 年份：优先 session 反查（届次是这三个系列的权威标识），缺失时退回 date 前四位 */
function yearOf(row, sessionToYear) {
  const bySession = sessionToYear?.[row?.session]
  if (bySession) return String(bySession)
  if (row?.date) return String(row.date).slice(0, 4)
  return ''
}

/**
 * 排序用的日期（会长 2026-09-23 要求明细模式按时间顺序排）。
 * 绝大多数记录带完整 date，直接用；没有日期的只有蓝桥杯省赛 ——
 * 全库省赛一条日期都没有（有日期的全是国赛，422 条省赛全空），
 * 旧数据源（scripts/source/editions/lanqiao/）同样只到「届 → 年」，无处可补，
 * 故退回该年 1 月 1 日：同届省赛（春）自然排在国赛（初夏）之前，也不会跨到相邻届去。
 */
function sortDateOf(row, year) {
  if (row?.date) return String(row.date)
  return year ? `${year}-01-01` : ''
}

/** competitions.json → { slug: { session: year } }（sessions 是 year→session，这里反过来） */
function sessionYearTable(competitions = []) {
  const table = {}
  for (const comp of competitions) {
    const reverse = {}
    for (const [year, session] of Object.entries(comp?.sessions || {})) reverse[session] = year
    table[comp?.slug] = reverse
  }
  return table
}

/**
 * 显式省赛行的指纹。
 * 新数据层里 2026-05-24 的 CCPC 南昌场同时有 invitational 与 provincial 两条
 * （同一天 / 同队 / 同奖牌）：一条是邀请赛奖、一条是江西省赛奖。而 2025-09-13 那一届、
 * 以及 icpc 的全部 6 条南昌行只有 invitational 一条 —— 省赛那半只能靠
 * 「暨江西省赛的邀请赛要各计一次」这条口径推出来。
 * 两处都算就会把 2026 那两条重复计一次，故先收一遍显式省赛行的指纹，
 * 邀请赛行推出的省赛若与之重合就跳过。
 */
function jiangxiProvincialKeys(rows = []) {
  const keys = new Set()
  for (const row of rows) {
    if (row?.medal_level !== 'provincial') continue
    const name = String(row?.competition_name || '')
    if (!JIANGXI_RE.test(name)) continue
    keys.add(`${row.date || ''}|${name}|${row.team_name || ''}|${row.medal_type || ''}`)
  }
  return keys
}

/** 奖牌说法按赛事官方口径分开（会长 2026-09-23）：
    xCPC 与百度之星写金/银/铜，蓝桥杯与天梯赛写一等/二等/三等 —— 后两个赛事官方就这么叫，
    明细模式照抄官方说法，别把「省赛一等奖」硬翻成「省赛金牌」。 */
const MEDAL_TEXT_RANK = { grand: '特等奖', gold: '一等奖', silver: '二等奖', bronze: '三等奖' }
const RANK_TEXT_FAMILIES = new Set(['lanqiao', 'gplt'])

function medalTextOf(family, medal) {
  return (RANK_TEXT_FAMILIES.has(family) ? MEDAL_TEXT_RANK : MEDAL_TEXT)[medal] || ''
}

/**
 * 「ICPC亚洲区域赛 南京站」→「ICPC 亚洲区域赛（南京）」「CCPC全国赛 绵阳站」→「CCPC 全国赛（绵阳）」
 * 会长 2026-09-23 的排版要求：站名一律写成括号；ICPC / CCPC 字样前后要有空格。
 * 数据里两种写法并存（区域赛用「xx站」、邀请赛已带「（xx）」），所以只做这两件必要的事：
 *   · 末尾「xx站」搬进括号 —— 字符类排除空白，所以只会圈住站名前那一小段，不会把整个赛名吞进去；
 *   · 给 ICPC / CCPC 前后补空格，再收敛多余空白。
 */
function formatXcpcName(name) {
  return String(name)
    .replace(/\s*([^\s（()]+?)站$/, '（$1）')
    .replace(/\s*(ICPC|CCPC)\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 明细模式（会长 2026-09-23 第 3 种视图）要的那句人话标题，例：第45届 ICPC 亚洲区域赛（南京）。
 *
 * 届数从哪来：
 *   · xcpc —— awards 里没有届数，只能按工作区 AGENTS.md 的赛季规则从日期推：
 *       赛季判定：比赛月份 ≥ 9 月 → (年)-(年+1)，否则 (年-1)-(年)；
 *       ICPC 届数 = 赛季止年 − 1976；CCPC 届数 = 赛季起年 − 2014。
 *     icpc 与 ccpc 混在同一个 family 里，靠 competition_name 里有没有 CCPC 区分。
 *   · gplt / lanqiao / baidu —— 数据里直接带 session（届数），但没有赛事全名，按字段拼。
 * 奖牌那半截不在这里，由 medalTextOf() 追加（见 recordsToDetails）。
 */
function xcpcEdition(row) {
  const date = String(row?.date || '')
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  if (!year || !month) return ''
  const isCcpc = /CCPC/i.test(String(row?.competition_name || ''))
  const seasonStart = month >= 9 ? year : year - 1
  const edition = isCcpc ? seasonStart - 2014 : seasonStart + 1 - 1976
  return edition > 0 ? `第${edition}届` : ''
}

function detailTitle(family, row, segment) {
  const name = String(row?.competition_name || '')
  if (family === 'xcpc') return `${xcpcEdition(row)} ${formatXcpcName(name)}`.trim()

  const edition = row?.session ? `第${row.session}届` : ''
  // 天梯赛 —— 「第6届天梯赛个人国家级三等奖」：团体/个人 + 国家级/省级
  if (family === 'gplt') {
    const level = row?.medal_level === 'provincial' ? '省级' : '国家级'
    return `${edition}天梯赛${segment}${level}`
  }
  // 蓝桥杯 —— 「第14届蓝桥杯 C++·B组省赛一等奖」：科目·组别 + 国赛/省赛
  //   注意 group 本身就可能是「研究生组」，直接补「组」会变成「研究生组组」。
  if (family === 'lanqiao') {
    const group = String(row?.group || '')
    const subject = [String(row?.language || ''), group && (group.endsWith('组') ? group : `${group}组`)]
      .filter(Boolean)
      .join('·')
    const level = row?.medal_level === 'national' ? '国赛' : '省赛'
    return `${edition}蓝桥杯${subject ? ` ${subject}` : ''}${level}`
  }
  if (family === 'baidu') {
    return `${edition}百度之星${row?.medal_level === 'national' ? '国赛' : '省赛'}`
  }
  return `${edition}${name}`.trim()
}

/**
 * 把 awards 数据展平成「姓名 → 获奖记录」。
 * @param {{ awards?: { [file: string]: object[] }, competitions?: object[] }} sources
 * @returns {Map<string, {family: string, segment: string, medal: string, year: string, award: string}[]>}
 */
export function collectRecords({ awards = {}, competitions = [] } = {}) {
  const sessionYears = sessionYearTable(competitions)
  const index = new Map()
  const push = (name, record) => {
    if (!name) return
    if (!index.has(name)) index.set(name, [])
    index.get(name).push(record)
  }

  for (const file of AWARD_FILES) {
    const family = FAMILY_OF_FILE[file]
    const rows = awards[file] || []
    const bySession = sessionYears[COMPETITION_OF_FILE[file]] || {}
    const explicitProvincial = jiangxiProvincialKeys(rows)

    for (const row of rows) {
      const medal = row?.medal_type
      // 优秀奖与未知档位一律不计（新层里优秀奖根本不收，这里是纵深防御）
      if (!MEDAL_EMOJI[medal]) continue
      const year = yearOf(row, bySession)
      const segments = PERSONAL_FILES.has(file)
        ? personalSegments(family, row)
        : teamSegments(family, row)
      const members = splitMembers(row?.members)
      if (!members.length) continue

      for (const segment of segments) {
        // 「暨江西省赛」的省赛那半若已有显式的 provincial 行，就不再由邀请赛行重复推出
        if (segment === '省赛' && row.medal_level === 'invitational') {
          const key = `${row.date || ''}|${row.competition_name || ''}|${row.team_name || ''}|${medal}`
          if (explicitProvincial.has(key)) continue
        }
        for (const name of members) {
          push(name, {
            family,
            segment,
            medal,
            year,
            date: sortDateOf(row, year),
            award: String(row.competition_name || ''),
            title: detailTitle(family, row, segment),
            medalText: medalTextOf(family, medal),
          })
        }
      }
    }
  }

  return index
}

/** 「区域赛🥈2🥉1」——零奖牌的档位不写；特等奖排在金牌之前。
    mode = 'icons' 时改写成「区域赛🥈🥈🥉」，每块奖牌各占一个图标（会长 2026-09-23 第 2 种视图）。 */
function segmentText(segment, counts, mode = 'count') {
  const medals = MEDAL_ORDER.filter((m) => counts[m] > 0)
    .map((m) => (mode === 'icons' ? MEDAL_EMOJI[m].repeat(counts[m]) : MEDAL_EMOJI[m] + counts[m]))
    .join('')
  return medals ? segment + medals : ''
}

/**
 * 一个人的获奖记录 → 胶囊的**分段数组**：一枚胶囊 = 一个数组，数组元素是它的各个部分。
 * 分段是给页面折行用的（会长 2026-09-23）：页面把每段渲染成一个 flex 子项，
 * 胶囊需要换行时便只在「区域赛 / 邀请赛 / 省赛」这样的部分之间折，
 * 不会从「区域赛🥈2」当中断开。要整串文本的地方（头像墙标签、核验脚本）用 recordsToPills()。
 * 顺序：xCPC 区域赛/邀请赛/省赛（同属一枚） → 天梯赛 → 百度之星 → 蓝桥杯 → 女生专场。
 * @param {object[]} records
 * @param {'count'|'icons'|'detail'} mode 见 utils/honorView.js
 * @returns {string[][]}
 */
export function recordsToPillParts(records = [], mode = 'count') {
  if (mode === 'detail') {
    return recordsToDetails(records).map((d) => [d.emoji + d.title + d.medalText])
  }

  const counts = { xcpc: {}, gplt: {}, baidu: {}, lanqiao: {} }
  const girls = []

  for (const r of records) {
    if (r.segment === 'girls') {
      girls.push(r)
      continue
    }
    const bySegment = counts[r.family]
    if (!bySegment) continue
    if (!bySegment[r.segment]) bySegment[r.segment] = zeroCounts()
    const bucket = bySegment[r.segment]
    if (bucket[r.medal] === undefined) continue
    bucket[r.medal] += 1
  }

  const pills = []
  for (const family of FAMILY_ORDER) {
    const bySegment = counts[family]
    if (!Object.keys(bySegment).length) continue
    const parts = SEGMENT_ORDER[family]
      .map((segment) => (bySegment[segment] ? segmentText(segment, bySegment[segment], mode) : ''))
      .filter(Boolean)
    if (!parts.length) continue
    // 系列名与第一段绑成一个折行单位：窄卡片折行时不会留下孤零零一行「xCPC」
    parts[0] = `${FAMILY_LABELS[family]} ${parts[0]}`
    pills.push(parts)
  }
  // 女生专场：按年份列出具体记录，不做奖牌计数
  for (const r of girls.slice().sort((a, b) => String(a.year).localeCompare(String(b.year)))) {
    pills.push([`${r.year} CCPC女生专场`, r.medalText || MEDAL_TEXT[r.medal]])
  }
  return pills
}

/** 与 recordsToPillParts 同源，把每枚胶囊拼回整串文本（头像墙标签、核验脚本用这个）。 */
export function recordsToPills(records = [], mode = 'count') {
  return recordsToPillParts(records, mode).map((parts) => parts.join(' '))
}

/**
 * 明细模式：一条记录一项，带上赛事全名与奖牌，供页面按结构化数据渲染。
 * 例：🥇第45届 ICPC 亚洲区域赛（南京）金牌 / 🥇第14届蓝桥杯 C++·B组省赛一等奖
 *   emoji 单独给一份（会长 2026-09-23 要求每条前面挂一个奖牌 emoji）；
 *   奖牌文字**不着色** —— 底色已经说明档位，段内再换颜色会把整条胶囊的色彩打乱；
 *   奖牌说法按赛事分（medalText 在建记录时就定好，见 medalTextOf）。
 *
 * **按时间顺序排（会长 2026-09-23）**：原先按赛事分组（xCPC → 天梯赛 → 百度之星 → 蓝桥杯），
 * 同一赛事内再按年份，读起来是「按比赛分堆」而不是一条时间线；现在第一排序键就是日期，
 * 赛事与奖牌降级为**同日并列时的次序**（同一天拿的团队奖/个人奖仍挨在一起、按赛事既定顺序，
 * 同一天同赛事的奖牌按 特等→金→银→铜）。要改成「最新在前」，把第一键取负 / 反转比较即可。
 * @returns {{title: string, medal: string, medalText: string, emoji: string, year: string, date: string, family: string}[]}
 */
export function recordsToDetails(records = []) {
  const familyRank = Object.fromEntries(FAMILY_ORDER.map((f, i) => [f, i]))
  return records
    .filter((r) => r?.title && (r.medalText || MEDAL_TEXT[r.medal]))
    .map((r) => ({
      title: r.title,
      medal: r.medal,
      medalText: r.medalText || MEDAL_TEXT[r.medal],
      emoji: MEDAL_EMOJI[r.medal],
      year: r.year,
      date: r.date || '',
      family: r.family,
    }))
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        (familyRank[a.family] ?? 9) - (familyRank[b.family] ?? 9) ||
        MEDAL_ORDER.indexOf(a.medal) - MEDAL_ORDER.indexOf(b.medal)
    )
}

/** 手工兜底那几条是写死的「🥉1」文本，图标模式下同样要摊开成「🥉」 */
const expandMedalCounts = (text) =>
  String(text).replace(/([\u{1F3C6}\u{1F947}\u{1F948}\u{1F949}])(\d+)/gu, (_, emoji, n) =>
    emoji.repeat(Number(n))
  )

/**
 * 页面用：某人的胶囊文本。自动汇总为主，一条记录都没有才退回 MANUAL_PILLS
 * —— 与 pillsFromRecords 同口径，只是支持按显示模式切换（会长 2026-09-23）。
 * @param {Map<string, object[]>} records loadHonorRecords() 的返回值
 */
export function pillsForName(records, name, mode = 'count') {
  const texts = recordsToPills(records?.get?.(name) || [], mode)
  if (texts.length) return texts
  return (MANUAL_PILLS[name] || []).map((parts) => {
    const text = parts.join(' ')
    return mode === 'icons' ? expandMedalCounts(text) : text
  })
}

/**
 * 与 pillsForName 同源的**分段**版本（两个页面用这份）。
 * 手工兜底那几条的分段写在 MANUAL_PILLS 里，与自动汇总同形。
 * @returns {string[][]}
 */
export function pillPartsForName(records, name, mode = 'count') {
  const parts = recordsToPillParts(records?.get?.(name) || [], mode)
  if (parts.length) return parts
  return (MANUAL_PILLS[name] || []).map((segs) =>
    mode === 'icons' ? segs.map(expandMedalCounts) : [...segs]
  )
}

/** 记录索引 → 「姓名 → 胶囊文本数组」，并补上手工兜底（只在自动汇总没有该 key 时写入） */
function pillsFromRecords(records) {
  const pills = new Map()
  for (const [name, list] of records) {
    const texts = recordsToPills(list)
    if (texts.length) pills.set(name, texts)
  }
  for (const [name, list] of Object.entries(MANUAL_PILLS)) {
    if (!pills.has(name)) pills.set(name, list.map((parts) => parts.join(' ')))
  }
  return pills
}

/**
 * 纯函数：数据 → 「姓名 → 胶囊文本数组」。核验脚本与页面共用同一份逻辑。
 * @param {{ awards?: object, competitions?: object[] }} sources
 */
export function buildHonorPills({ awards = {}, competitions = [] } = {}) {
  return pillsFromRecords(collectRecords({ awards, competitions }))
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
  return res.json()
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
      fetchJson(`${DATA_ROOT}/competitions.json`).catch(() => []),
      Promise.all(AWARD_FILES.map((file) => fetchJson(`${DATA_ROOT}/awards/${file}.json`).catch(() => null))),
    ])
      .then(([competitions, sets]) =>
        collectRecords({
          competitions,
          awards: Object.fromEntries(AWARD_FILES.map((file, i) => [file, sets[i] || []])),
        })
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
    pillsCache = loadHonorRecords().then((records) => pillsFromRecords(records))
  }
  return pillsCache
}

/** 供核验脚本/调试用：清掉缓存后重新加载 */
export function resetHonorPills() {
  recordsCache = null
  pillsCache = null
}
