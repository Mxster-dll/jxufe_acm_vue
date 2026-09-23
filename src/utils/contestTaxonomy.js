/**
 * 赛事口径的**单一真源**：奖牌档位、系列、awards 文件。
 *
 * 为什么要有这个文件：这些表原先各存一份散在五个文件里 ——
 * `honorPills.js`（MEDAL_ORDER / MEDAL_EMOJI / AWARD_FILES / FAMILY_OF_FILE / SEGMENT_ORDER…）、
 * `honorRanking.js`（PILL_MEDAL，是 MEDAL_EMOJI 的反向表）、
 * `awardGroups.js`（MEDAL_KEYS，与 MEDAL_ORDER 逐字相同的另一个名字）、
 * `scripts/gen_event_badges.mjs`（MEDALS + MEDAL_EMOJI）、
 * `scripts/gen_group_wall.mjs`（AWARD_FILES）。
 * 光 `['grand','gold','silver','bronze']` 一个数组就有四份写法。加一个档位或换一套 emoji
 * 要改三到四处，漏一处就是**静默错**：例如 PILL_MEDAL 与 MEDAL_EMOJI 不同步时，
 * 手写胶囊里的「🥉1」解析不出奖牌，那条战绩会悄悄变成 0 分。
 *
 * ⚠ 措辞（「金牌」还是「一等奖」）**不在这里**，那是按赛事分家的展示口径：
 *   - `honorPills.js` 的 MEDAL_TEXT（xcpc / 百度之星：金牌）/ MEDAL_TEXT_RANK
 *     （蓝桥杯 / 天梯赛：一等奖，官方口径）
 *   - `awardGroups.js` 的 MEDAL_TEXT（奖）/ RANK_TEXT（等奖），供竞赛信息页分组展示
 *   三张文案表由会长 2026-09 分别裁定，保持分开是有意的 —— 但**档位与顺序只有这里一份**。
 */

/** 档位顺序：高 → 低。特等奖在最前（会长 2026-09 裁定：独立一档，不并入金牌） */
export const MEDAL_ORDER = ['grand', 'gold', 'silver', 'bronze']

/**
 * 与 MEDAL_ORDER 同序的**查表版**（`MEDAL_RANK[a] - MEDAL_RANK[b]` 排序用）。
 * 刻意不叫 MEDAL_ORDER：原先 `awardGroups.js` 把 map 也叫这个名字，
 * 而 `honorPills.js` 里是数组 —— 同名异型，导入时看名字猜不出类型。
 */
export const MEDAL_RANK = { grand: 0, gold: 1, silver: 2, bronze: 3 }

export const MEDAL_EMOJI = { grand: '🏆', gold: '🥇', silver: '🥈', bronze: '🥉' }

/** MEDAL_EMOJI 的反向表：解析手写胶囊文本里的「🥉1」用（由上面派生，不再手写第二份） */
export const MEDAL_EMOJI_REVERSE = Object.fromEntries(
  Object.entries(MEDAL_EMOJI).map(([medal, emoji]) => [emoji, medal])
)

// ==========================================================================
// 名次（awards/*.json 的 `rank` 字段）
//
// 会长 2026-09-24：「增加一个排名字段，用于保存 xCPC 队伍排名、蓝桥杯个人排名、
// 天梯赛个人排名、（未来会有传智杯个人排名）、百度之星个人排名」；「把 #1、#2、#3
// 改成冠军、亚军、季军」；「自动识别冠亚季军……在大事记卡片右上角的统计中都是被
// 奖杯的 icon 统计」。
//
// `rank` 只表示「同一比较范围内的第几名」，**不跨范围比较**，语义按赛事分家：
//   · icpc / ccpc      —— 该场比赛里**队伍**的名次
//   · lanqiao / baidu  —— 同届同级别（省赛 / 国赛）同「科目 × 组别」内的**个人**名次
//   · gplt-individual  —— 该届国赛**个人**的全国名次（官方名单不直接给，是按
//                          「同奖项内成绩降序位置 + 更高奖项名额数」推算的）
//   · chuanzhi         —— 预留给个人名次（与 lanqiao / baidu 同形）
// 与奖牌（medal_type）**正交**：冠军队照样拿着金牌，两件事各说各的。
//
// ⚠ 别和 MEDAL_TEXT / RANK_TEXT 混：那两张表是**奖等**的措辞（金牌 / 一等奖）。
// ==========================================================================

/** 前三名的说法（冠军 / 亚军 / 季军） */
export const TROPHY_LABEL = { 1: '冠军', 2: '亚军', 3: '季军' }

/**
 * 是不是「冠亚季军」。
 * **这是全站唯一的判据**：页面给金色胶囊、大事记角标把它们与特等奖一样按 🏆 统计，
 * 都走这个函数 —— 不要在别处再写一遍 `rank <= 3`。
 */
export function isTrophyRank(rank) {
  const n = Number(rank)
  return Number.isInteger(n) && n >= 1 && n <= 3
}

/**
 * 名次 → 展示文本。
 *   · 冠亚季军 → 「冠军 / 亚军 / 季军」
 *   · 并列区间（给了 rankTo 且 > rank）→ 「797+」= 「第 797 名起」
 *     **不能省掉那个 +**：天梯赛官方名单不公布名次，同分并列时档内顺序不是名次，
 *     只能给区间（106 条个人奖 100% 落在同分块里，见 tianti_ranks.json 的 _note）；
 *     写成裸的「#797」等于断言一个我们支撑不了的事实。区间与并列人数放 title 里。
 *   · 其余 → 「#N」
 * 没有/非法名次返回空串（调用方据此隐藏）。
 */
export function rankText(rank, rankTo) {
  if (rank == null || rank === '') return ''
  const n = Number(rank)
  if (!Number.isInteger(n) || n < 1) return ''
  if (TROPHY_LABEL[n]) return TROPHY_LABEL[n]
  const to = Number(rankTo)
  if (Number.isInteger(to) && to > n) return `${n}+`
  return `#${n}`
}

/** 名次的悬停说明：并列区间的完整口径（同分块内顺序不是名次，故只能给区间） */
export function rankNote(rank, rankTo) {
  if (rank == null || rank === '') return ''
  const n = Number(rank)
  if (!Number.isInteger(n) || n < 1) return ''
  if (TROPHY_LABEL[n]) return `${TROPHY_LABEL[n]}（第 ${n} 名）`
  const to = Number(rankTo)
  if (Number.isInteger(to) && to > n) {
    return `全国名次 ${n}–${to}（同分并列 ${to - n + 1} 人；官方只公布成绩与名额，名次按名额推算）`
  }
  return `第 ${n} 名`
}

/**
 * 参与汇总的 awards 文件。文件本身就区分了团队赛与个人赛
 * （gplt-team / gplt-individual 是同一届的两个文件），不用再靠 level 猜。
 * **chuanzhi 有意不在内**：该文件当前为空，且传智杯的荣誉一直是手写条目；
 * 若将来它有了数据，加进来之前先确认手写条目的去留，否则会重复显示。
 */
export const AWARD_FILES = ['icpc', 'ccpc', 'gplt-team', 'gplt-individual', 'lanqiao', 'baidu']

/** awards 文件 → 胶囊里的系列键 */
export const FAMILY_OF_FILE = {
  icpc: 'xcpc',
  ccpc: 'xcpc',
  'gplt-team': 'gplt',
  'gplt-individual': 'gplt',
  lanqiao: 'lanqiao',
  baidu: 'baidu',
}

/** awards 文件 → competitions.json 里的 slug（年份靠它的 sessions 映射反查） */
export const COMPETITION_OF_FILE = {
  icpc: 'icpc',
  ccpc: 'ccpc',
  'gplt-team': 'gplt',
  'gplt-individual': 'gplt',
  lanqiao: 'lanqiao',
  baidu: 'baidu',
}

/** 个人赛文件（一行一个人/一队人，但分段按个人赛算） */
export const PERSONAL_FILES = new Set(['gplt-individual', 'lanqiao', 'baidu'])

/** 系列键 → 胶囊开头的名字 */
export const FAMILY_LABELS = {
  xcpc: 'xCPC',
  gplt: '天梯赛',
  baidu: '百度之星',
  lanqiao: '蓝桥杯',
}

/** 胶囊里系列的先后顺序 */
export const FAMILY_ORDER = ['xcpc', 'gplt', 'baidu', 'lanqiao']

/**
 * 分段顺序。xCPC 的省赛与区域赛 / 邀请赛**同属一枚胶囊**（会长 2026-09-23 合并，
 * 原先省赛单独成枚）；三段各自是一个折行单位（见 recordsToPillParts）。
 * 天梯赛的「省赛」段 2026-09-24 新增：承载**省内个人名次**（省内前三才成段，
 * 见 honorPills.js 的 personalSegments），与「团体/个人」的国家级奖牌不是一回事。
 */
export const SEGMENT_ORDER = {
  xcpc: ['区域赛', '邀请赛', '省赛'],
  gplt: ['团体', '个人', '省赛'],
  baidu: ['国赛', '省赛'],
  lanqiao: ['国赛', '省赛'],
}

/** CCPC 女生专场：单列，不并进计数分段 */
export const GIRLS_RE = /女生|专场/

/**
 * 省赛段只认江西省赛（会长 2026-09 裁定：其他省的省赛不计）。
 * 新数据层里江西省赛以「XX全国邀请赛（南昌）暨江西省赛」的 competition_name 出现，
 * 故按「江西」判定；顺带也覆盖将来可能出现的独立「江西省赛」行。
 */
export const JIANGXI_RE = /江西/
