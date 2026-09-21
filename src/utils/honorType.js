/**
 * 荣誉条目分类。
 *
 * 「优秀成员」与「协会负责人」两个页面上的荣誉标签，按类型分四种颜色
 * （配色见 styles/tokens.css 的 --honor-*，标签样式见 styles/honors.css）。
 *
 * 数据侧优先：members.json / leaders.json 里每条荣誉可以写成对象并显式标注类型——
 *   { "text": "保研至北京邮电大学", "type": "destination" }
 * 漏标、或仍写成纯字符串时，由下面的关键词规则兜底猜一个类型，
 * 保证以后谁手写一条新荣誉也不会漏色。
 *
 * `type` 既接受英文键，也接受中文名（比赛 / 去向 / 荣誉 / 联系）；
 * 写错的值不报错，退回关键词判断。
 */

/** 类型键 → 中文名（标签的 title 提示用） */
export const HONOR_TYPE_LABELS = {
  contest: '比赛',
  destination: '毕业去向',
  honor: '个人荣誉 / 职位',
  contact: '联系方式',
  more: '更多荣誉',
}

/** 显式 type 的别名表：中英文写法都认（英文不区分大小写） */
const TYPE_ALIASES = {
  contest: 'contest',
  competition: 'contest',
  award: 'contest',
  比赛: 'contest',
  竞赛: 'contest',
  赛事: 'contest',
  destination: 'destination',
  graduation: 'destination',
  去向: 'destination',
  毕业去向: 'destination',
  升学: 'destination',
  就业: 'destination',
  honor: 'honor',
  荣誉: 'honor',
  个人荣誉: 'honor',
  职位: 'honor',
  个人荣誉职位: 'honor',
  contact: 'contact',
  联系: 'contact',
  联系方式: 'contact',
  社交: 'contact',
  more: 'more',
  更多: 'more',
  更多荣誉: 'more',
}

/** leaders.json 里用 "..." 表示「还有更多荣誉」 */
const ELLIPSIS = /^(?:\.{3,}|…+)$/

/**
 * 关键词兜底规则，自上而下取第一条命中的。
 * 顺序有讲究：
 *   1. 去向最先——「保研至北京邮电大学」里也含「大学」，被别的规则截胡就错了；
 *   2. 联系方式（「关注小羊谢谢喵」这类彩蛋/社交）；
 *   3. 个人荣誉 / 职位（奖学金、优秀学生、协会职务）；
 *   4. 都不命中则按比赛算——荣誉字段里本就以竞赛奖项为主，
 *      而且这样兜底的观感与「全部一个颜色」的改造前一致，不会把没标的新条目变突兀。
 */
const FALLBACK_RULES = [
  ['destination', /保研|考研|直博|留学|升学|去向|上岸|入职|就职|就业|签约|offer/i],
  ['destination', /硕士|博士|研究生/],
  ['destination', /(?:至|到)[^，。；]{2,20}?(?:大学|学院|研究院|科学院|研究所|实验室)/],
  ['destination', /^[\u4e00-\u9fa5A-Za-z]{2,10}(?:科技|集团|公司|银行|证券|研究院|事务所)$/],
  ['contact', /🛰|📮|微信|QQ|邮箱|二维码|公众号/i],
  ['contact', /关注|B站|bilibili|友链|博客|个人站|主页|喵/],
  ['contact', /https?:\/\/|www\.|[\w-]+\.(?:com|cn|net|org|site|me|top|dev|io)\b/i],
  // 「优秀(?!奖)」：蓝桥杯的「国家级优秀奖」是竞赛奖项档位，不是个人荣誉，别被「优秀」两个字截胡
  ['honor', /奖学金|国奖|国励|助学|优秀(?!奖)|先进|标兵|三好|党员|团员|干部|团干/],
  ['honor', /负责人|部长|副部|主席|会长|班长|团支书|委员|干事|队长|主任|年级第一|加权|绩点|GPA/i],
]

function aliasOf(key) {
  if (key == null) return ''
  const raw = String(key).trim()
  if (Object.prototype.hasOwnProperty.call(TYPE_ALIASES, raw)) return TYPE_ALIASES[raw]
  const lower = raw.toLowerCase()
  return Object.prototype.hasOwnProperty.call(TYPE_ALIASES, lower) ? TYPE_ALIASES[lower] : ''
}

/** 取出一条荣誉的文本（兼容字符串写法与 { text } 对象写法） */
export function honorText(item) {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    return String(item.text ?? item.label ?? item.name ?? '')
  }
  return ''
}

/** 判定一条荣誉的类型：显式标注优先，否则关键词兜底 */
export function resolveHonorType(item) {
  if (item && typeof item === 'object') {
    const alias = aliasOf(item.type)
    if (alias) return alias
  }
  const text = honorText(item)
  if (ELLIPSIS.test(text.trim())) return 'more'
  for (const [type, pattern] of FALLBACK_RULES) {
    if (pattern.test(text)) return type
  }
  return 'contest'
}

/**
 * 把 honors / achievements 数组统一成 [{ text, type }]。
 * @param {Array<string|{text:string,type?:string}>} list
 * @returns {Array<{text:string,type:string}>}
 */
export function normalizeHonors(list) {
  if (!Array.isArray(list)) return []
  return list.map((item) => ({ text: honorText(item), type: resolveHonorType(item) }))
}
