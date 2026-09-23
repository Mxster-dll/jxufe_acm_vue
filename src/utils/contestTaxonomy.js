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
 */
export const SEGMENT_ORDER = {
  xcpc: ['区域赛', '邀请赛', '省赛'],
  gplt: ['团体', '个人'],
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
