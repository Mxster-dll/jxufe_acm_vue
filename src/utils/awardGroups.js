/**
 * 获奖数据展示工具（供 CompetitionDetailView / CompetitionEventView 共用）
 *
 * 数据来源统一为 public/data/awards/*.json，字段定义见项目 README：
 *   - 团队赛（xcpc）：competition_name / medal_level / team_name / medal_type / members / coach_names / date
 *   - 天梯赛团队奖：  session / team_name / medal_type / members / coach_names / date
 *   - 单人赛：        session / members / [language / group] / medal_level / medal_type / coach_names / date
 */

// 奖牌 → 文案：xcpc / 百度之星 / 天梯赛团队奖用「金/银/铜奖」措辞
export const MEDAL_TEXT = { gold: '金奖', silver: '银奖', bronze: '铜奖' }
// 奖牌 → 文案：蓝桥杯 / 天梯赛个人奖用「一/二/三等奖」措辞
export const RANK_TEXT = { gold: '一等奖', silver: '二等奖', bronze: '三等奖' }
// medal_level → 表格行类别（决定行背景色）
export const LEVEL_CAT = { invitational: 'inv', regional: 'reg', final: 'reg', provincial: 'prov' }
// medal_level → 徽章小字
export const LEVEL_TAG = { invitational: '邀请赛', regional: '区域赛', final: '区域赛', provincial: '省赛' }

export const MEDAL_KEYS = ['gold', 'silver', 'bronze']
export const MEDAL_ORDER = { gold: 1, silver: 2, bronze: 3 }

/** 奖牌 → 奖牌色类（供 medal-gold / chip-gold 等样式复用） */
export function medalClass(medal) {
  if (medal === 'gold') return 'medal-gold'
  if (medal === 'silver') return 'medal-silver'
  if (medal === 'bronze') return 'medal-bronze'
  return ''
}

/**
 * 奖等文案 → 徽章配色类（RosterGroup 用）。
 * 兼容「一等奖/金奖」两种措辞；优秀奖为浅金灰；无法识别返回空串（默认色）。
 */
export function awardTone(award) {
  if (!award) return ''
  if (/一等奖|特等奖|金奖|金牌/.test(award)) return 'medal-gold'
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

/** 从「第N届…」标题解析届数，兼容「第十一届」与「第21届」两种写法 */
export function sessionFromTitle(title) {
  const m = String(title || '').match(/第\s*(\d+|[一二三四五六七八九十]+)\s*届/)
  if (!m) return null
  if (/^\d+$/.test(m[1])) return Number(m[1])
  const D = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  let section = 0
  let num = 0
  for (const ch of m[1]) {
    if (ch === '十') {
      section += (num || 1) * 10
      num = 0
    } else if (D[ch]) {
      num = D[ch]
    }
  }
  return section + num
}

/** 两字姓名中间插全角空格（与 RosterGroup 的 alignName 保持一致） */
export function alignName(name) {
  return /^[\u4e00-\u9fff]{2}$/.test(name || '') ? name[0] + '\u3000' + name[1] : name
}

/** 把一组记录按奖牌归成 [{ medal, rows }]，顺序固定为 金 → 银 → 铜 */
export function awardPairs(rows) {
  return MEDAL_KEYS.filter((m) => rows.some((r) => r.medal_type === m)).map((m) => ({
    medal: m,
    rows: rows.filter((r) => r.medal_type === m)
  }))
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
        persons: p.rows.map((r) => ({ name: (r.members && r.members[0]) || '', rank: null }))
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
      persons: p.rows.map((r) => ({ name: (r.members && r.members[0]) || '', rank: null }))
    }))
  }))
}
