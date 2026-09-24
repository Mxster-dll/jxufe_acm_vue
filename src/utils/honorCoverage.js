/**
 * 哪些手写荣誉已经被自动汇总覆盖 —— 「卡片上不该重复显示、排名里不该重复计分」的那批。
 *
 * 背景：比赛战绩胶囊（utils/honorPills.js）会从站点的 awards 数据自动汇总
 * ICPC / CCPC / 天梯赛 / 百度之星 / 蓝桥杯 的奖牌。而 members.json / leaders.json 里
 * 还手写着同一批奖项（如「2025ICPC香港区域赛铜」「蓝桥杯国一」「邀请赛银牌*3，铜牌*5」）——
 * 两处并存有两个后果：
 *   1. 卡片与头像墙的悬停卡同时显示胶囊和重复条目，一大半标签在说同一件事；
 *   2. honorRanking 既给自动记录计分、又给手写条目计分，**同一块奖牌算两遍**，
 *      名次因此失真（实测把李鑫从 #10 抬到 #4）。
 *
 * 口径（2026-09-22 会长裁定）：这五个系列的奖项不再手写进名单，胶囊能表达的一律由胶囊呈现。
 * 手写只保留胶囊表达不了的两类：
 *   1. **名次类** —— 冠军 / 亚军 / 季军 / 第 N 名 / 首刀 / 全省第 N / 全国第 N。
 *      自动层只有奖牌档位（金/银/铜/特等），名次必须手写，且 honorRanking 的
 *      RANK_MULTIPLIER 正是为它们准备的。
 *   2. **胶囊没有数据源的赛事** —— 睿抗(RAICOM) / 传智杯 / 数学建模 / CSP 认证。
 *      这几个在工作区里没有可汇总的获奖数据，只能手写
 *      （与 honorRanking.js 的 MANUAL_LEVELS 同一份口径）。
 *
 * 认不出赛事的条目**一律保留** —— 宁可多显示一条，也不要吃掉作者写下的东西。
 *
 * 实现方式说明：这是**渲染与计分层的过滤**，不改数据。上游名单里那 105 条重复条目
 * 原样留着（它们带有站名 / 组别等胶囊表达不了的细节，别的视图可能要用），
 * 显示与排名两处都走这里，口径永远一致。
 */

import { honorText } from './honorType.js'

/** 胶囊没有数据源、只能手写的赛事（与 honorRanking.js 的 MANUAL_LEVELS 同口径） */
const MANUAL_ONLY = /睿抗|RAICOM|传智杯|数学建模|CSP/i

/** 名次类词：奖牌档位表达不了，必须手写 */
const RANK_WORDS = /冠军|亚军|季军|第一名|第二名|第三名|第\s*\d+\s*名|首刀|全省第|全国第/

/**
 * 胶囊表达不了的**档位词**：自动层只会聚合出金/银/铜/特等（一/二/三等奖），
 * 优秀奖这一档不在其中 —— honorPills.js 的口径是「优秀奖不计入任何奖牌数」，
 * 新 awards 层更是**根本不收**优秀奖，所以没有任何胶囊能表达它。
 *
 * 因此手写的优秀奖条目**不能算「已被胶囊覆盖」**：被覆盖 = 展示与计分双双跳过，
 * 而这里没有胶囊来接手 → 整条荣誉彻底消失。
 * 实测（2026-09 审查）：邓一帆「第十五届蓝桥杯国家级优秀奖」、
 * 陶金杰「第十六届蓝桥杯国家级优秀奖、省一等奖」两条正是这样丢的 ——
 * 上游 `upstream/master:src/views/ExcellentView.vue` 是裸渲染 `v-for="h in m.honors"`，
 * 两条都显示得出来，是这条覆盖判定引入的**显示回归**。
 *
 * 放行整条**不会重复计分**：这两条都没有 `type` 字段，scoreHonorEntry 走 HONOR_RULES
 * 认不出任何规则（`unmatched: true`）→ 本来就 0 分。实测放行前后分值增量 +0.000、名次不变。
 * 与 :21「认不出赛事的一律保留」同一原则：胶囊表达不了的，宁可多显示一条，
 * 也不要吃掉作者写下的东西。
 */
const NON_PILL_LEVELS = /优秀奖|优胜奖/

/**
 * 胶囊**能**表达的档位词（与 honorRanking.js 的 TIER_RULES 同口径）。
 * 只用来判断「一条手写条目里有没有胶囊已经接手的战绩主张」，见 isCoveredByPills。
 */
const PILL_TIERS = /特等|一等|二等|三等|冠军|亚军|季军|金奖|银奖|铜奖|金牌|银牌|铜牌|国一|国二|国三|省一|省二|省三|第\s*[123]\s*名/

/** 胶囊有数据源的五个系列（含只写层级的 xCPC 写法：区域赛 / 邀请赛 / 省赛） */
const COVERED_SERIES = /ICPC|CCPC|xCPC|天梯|蓝桥|百度之星|区域赛|邀请赛|省赛/i

/** 这条手写荣誉是不是「胶囊已经覆盖」的（true = 显示与计分都应跳过） */
export function isCoveredByPills(text) {
  const raw = String(text ?? '')
  if (!raw) return false
  if (MANUAL_ONLY.test(raw)) return false
  if (RANK_WORDS.test(raw)) return false
  /* 优秀奖这类「胶囊表达不了的档位」：**只有整条里没有胶囊能表达的档位词时才放行**。
     否则放行会把条目里的奖牌主张也一并放出来 —— 那正是本文件要防的「同一块奖牌算两遍」。
     实测（2026-09）：陶金杰「第十六届蓝桥杯国家级优秀奖、省一等奖」整条放行会白拿 5.00 分
     （省一等奖已由胶囊计分、胶囊里就有「蓝桥杯 省赛🥇2」）；邓一帆
     「第十五届蓝桥杯国家级优秀奖」里没有任何胶囊能表达的档位，放行才是对的。
     该复合条目现已由会长从 leaders.json 删除；这条判据是防止它被重新写回来。 */
  if (NON_PILL_LEVELS.test(raw) && !PILL_TIERS.test(raw)) return false
  return COVERED_SERIES.test(raw)
}

/**
 * 过掉已被胶囊覆盖的手写条目。
 * 兼容字符串与 { text, type } 两种写法，返回原数组的元素（不改写形状）。
 */
export function stripCoveredHonors(list = []) {
  if (!Array.isArray(list)) return []
  return list.filter((item) => !isCoveredByPills(honorText(item)))
}
