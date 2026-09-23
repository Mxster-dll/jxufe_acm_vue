/**
 * 获奖数据展示工具（供 CompetitionDetailView / CompetitionEventView 共用）
 *
 * 数据来源统一为 public/data/awards/*.json，字段定义见项目 README：
 *   - 团队赛（xcpc）：competition_name / medal_level / team_name / medal_type / members / coach_names / date
 *   - 天梯赛团队奖：  session / team_name / medal_type / members / coach_names / date
 *   - 单人赛：        session / members / [language / group] / medal_level / medal_type / coach_names / date
 *
 * medal_type 取值：gold / silver / bronze；蓝桥杯另允许 grand（特等奖）。
 * grand 是独立一档（排在金之前、单独计数），只存在于蓝桥杯早期届次。
 */

import { MEDAL_ORDER, MEDAL_RANK } from './contestTaxonomy.js'

// 奖牌 → 文案：xcpc / 百度之星 / 天梯赛团队奖用「金/银/铜奖」措辞
// grand（特等奖）是蓝桥杯早期届次才有的最高档，两种措辞体系下都写作「特等奖」
export const MEDAL_TEXT = { grand: '特等奖', gold: '金奖', silver: '银奖', bronze: '铜奖' }
// 奖牌 → 文案：蓝桥杯 / 天梯赛个人奖用「一/二/三等奖」措辞
export const RANK_TEXT = { grand: '特等奖', gold: '一等奖', silver: '二等奖', bronze: '三等奖' }
// medal_level → 表格行类别（决定行背景色）
export const LEVEL_CAT = { invitational: 'inv', regional: 'reg', final: 'reg', provincial: 'prov' }
// medal_level → 徽章小字
export const LEVEL_TAG = { invitational: '邀请赛', regional: '区域赛', final: '区域赛', provincial: '省赛' }

// 顺序与档位表都在 contestTaxonomy.js（单一真源）；这里只做别名，别在本文件再抄一份。
// MEDAL_KEYS 是「顺序即展示顺序」的数组；MEDAL_RANK 是同序的查表版（排序用）。
export const MEDAL_KEYS = MEDAL_ORDER
export { MEDAL_RANK }

// ==========================================================================
// 名次（awards/*.json 的 `rank` 字段）
//
// 口径与实现都在 contestTaxonomy.js（**单一真源**：生成器 gen_event_badges.mjs
// 也要用同一套判据，不能再写一遍 `rank <= 3`）。这里只做转出，页面照旧从本模块 import。
//
// ⚠ 别和上面的 `RANK_TEXT` 混：那张表是**奖等**的措辞（一等奖 / 二等奖 / 三等奖），
//   与「第几名」是两件正交的事 —— 冠军队照样拿着金牌。
// ==========================================================================
export { TROPHY_LABEL, isTrophyRank, rankText, rankNote } from './contestTaxonomy.js'

/** 奖牌 → 奖牌色类（供 medal-gold / chip-gold 等样式复用） */
export function medalClass(medal) {
  if (medal === 'grand') return 'medal-grand'
  if (medal === 'gold') return 'medal-gold'
  if (medal === 'silver') return 'medal-silver'
  if (medal === 'bronze') return 'medal-bronze'
  return ''
}

/**
 * 奖等文案 → 徽章配色类（RosterGroup 用）。
 * 兼容「一等奖/金奖」两种措辞；特等奖单独一色（红）必须先判，否则会被金分支吃掉；
 * 优秀奖为浅金灰；无法识别返回空串（默认色）。
 */
export function awardTone(award) {
  if (!award) return ''
  if (/特等奖/.test(award)) return 'medal-grand'
  if (/一等奖|金奖|金牌/.test(award)) return 'medal-gold'
  if (/二等奖|银奖|银牌/.test(award)) return 'medal-silver'
  if (/三等奖|铜奖|铜牌/.test(award)) return 'medal-bronze'
  if (/优秀奖/.test(award)) return 'lq-excellent'
  return ''
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD'；无日期时回退 fallback */
export function dateTextOf(date, fallback) {
  if (!date) return String(fallback ?? '')
  const [y, m, d] = String(date).split('-')
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → 'YYYY' */
export function yearOf(date) {
  const m = String(date || '').match(/^(\d{4})/)
  return m ? m[1] : ''
}

/** 'YYYY-MM-DD' → '2026年4月12日'（'YYYY-MM' → '2026年4月'） */
export function fmtCnDate(date) {
  if (!date) return ''
  const m = String(date).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!m) return String(date)
  return m[3] ? `${m[1]}年${+m[2]}月${+m[3]}日` : `${m[1]}年${+m[2]}月`
}

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 届数 int → '第十一届' */
export function editionLabel(n) {
  const v = Number(n)
  if (!Number.isInteger(v) || v <= 0) return ''
  if (v < 10) return `第${CN_DIGIT[v]}届`
  if (v < 20) return `第十${v % 10 ? CN_DIGIT[v % 10] : ''}届`
  return `第${CN_DIGIT[Math.floor(v / 10)]}十${v % 10 ? CN_DIGIT[v % 10] : ''}届`
}

/** 两字姓名中间插全角空格（与 RosterGroup 的 alignName 保持一致） */
export function alignName(name) {
  return /^[\u4e00-\u9fff]{2}$/.test(name || '') ? name[0] + '\u3000' + name[1] : name
}

/** 把一组记录按奖牌归成 [{ medal, rows }]，顺序固定为 金 → 银 → 铜。
    只在本文件内部用（subjectGroups / sessionGroups），不对外导出。 */
function awardPairs(rows) {
  return MEDAL_KEYS.filter((m) => rows.some((r) => r.medal_type === m)).map((m) => ({
    medal: m,
    rows: rows.filter((r) => r.medal_type === m)
  }))
}

/** 组内按名次升序排（无名次的排后面、并列保持原顺序）。
    名次的作用域就是「本组」（同届同级别、同科目×组别 / 同场次），故只在本组内排序。 */
function byRank(rows) {
  const rankOf = (r) => {
    const n = Number(r?.rank)
    return Number.isInteger(n) && n > 0 ? n : Infinity
  }
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rankOf(a.r) - rankOf(b.r) || a.i - b.i)
    .map((x) => x.r)
}

// 蓝桥杯科目分组的固定顺序：语言 C/C++ → Java → Python → 其他；组别 A → B → 研究生组 → 未标注
const LANGS_ORDER = ['C++', 'Java', 'Python', null]
const LANG_TEXT = { 'C++': 'C/C++', Java: 'Java', Python: 'Python' }
const GROUPS_ORDER = ['A', 'B', '研究生组', null]
const ordinal = (arr, v) => {
  const i = arr.indexOf(v)
  return i === -1 ? arr.length : i
}

/**
 * 蓝桥杯式分组：按 language × group 归组，组内再按奖等分行。
 * awardText 决定奖等文案（蓝桥杯用 RANK_TEXT，百度之星用 MEDAL_TEXT）。
 */
export function subjectGroups(rows, awardText) {
  const map = new Map()
  for (const r of rows) {
    const key = `${r.language ?? ''}|${r.group ?? ''}`
    if (!map.has(key)) map.set(key, { language: r.language, group: r.group, rows: [] })
    map.get(key).rows.push(r)
  }
  return [...map.values()]
    .sort(
      (a, b) =>
        ordinal(LANGS_ORDER, a.language) - ordinal(LANGS_ORDER, b.language) ||
        ordinal(GROUPS_ORDER, a.group) - ordinal(GROUPS_ORDER, b.group)
    )
    .map((g) => ({
      // 组别为单字母（A/B）时补「组」字；「研究生组」本身已含「组」，不重复拼
      label: `${LANG_TEXT[g.language] ?? '其他'}${g.group ? ` · ${g.group}${/^[A-Z]$/.test(g.group) ? '组' : ''}` : ''}`,
      icon: 'fa-code',
      awards: awardPairs(g.rows).map((p) => ({
        award: awardText[p.medal],
        // rank 的作用域就是这个组（同届同级别、同「科目 × 组别」），故组内按名次升序
        // 排一遍、没名次的排后面 —— 冠军自然排在最前。
        persons: byRank(p.rows).map((r) => ({ name: (r.members && r.members[0]) || '', rank: r.rank ?? null }))
      }))
    }))
}

/**
 * 场次式分组：按获奖公示日期归组。
 * 新数据源不含「场次名」（第一场 / 大学组…），故以日期标识场次。
 */
export function sessionGroups(rows, awardText) {
  const map = new Map()
  for (const r of rows) {
    const key = r.date || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  return [...map.keys()].sort().map((date) => ({
    label: date || '日期未知',
    icon: 'fa-code',
    awards: awardPairs(map.get(date)).map((p) => ({
      award: awardText[p.medal],
      persons: byRank(p.rows).map((r) => ({ name: (r.members && r.members[0]) || '', rank: r.rank ?? null }))
    }))
  }))
}
