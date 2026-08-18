// 蓝桥杯名单分组工具：个人获奖记录 → C/C++·Java·Python × A/B 级 × 奖等
// 供赛事总页（CompetitionDetailView）与单届详情页（CompetitionEventView）共用

// 科目 → 语言组（cpp / java / python / other）
export function langOf(subject) {
  const s = subject || ''
  if (/C\/C\+\+|C语言/.test(s)) return 'cpp'
  if (/Java/.test(s)) return 'java'
  if (/Python/.test(s)) return 'python'
  return 'other'
}

// 科目 → 级别（A / B；研究生组并入 A，本科/大学组并入 B）
export function levelOf(subject) {
  const s = subject || ''
  if (/A组/.test(s)) return 'A'
  if (/研究生/.test(s)) return 'A'
  return 'B'
}

export const LANGS = [
  ['cpp', 'C/C++'],
  ['java', 'Java'],
  ['python', 'Python'],
  ['other', '其他'],
]

// 奖项排序权重（特等/一等 → 二等 → 三等 → 优秀）
export const AWARD_RANK = { '特等奖': 0, '一等奖': 1, '二等奖': 2, '三等奖': 3, '优秀奖': 4 }

// 分组：rows: [{name, award, subject?|score?, rank?}]（editions 详情页用 score 存科目，总名单用 subject）
// →
// [{ lang:'cpp', level:'A', awards:[{award:'一等奖', persons:[{name, rank}]}], ... }]
export function lanqiaoGroup(rows) {
  const byKey = new Map()
  for (const r of rows) {
    const subject = r.subject || r.score || ''
    const lang = langOf(subject)
    const level = levelOf(subject)
    const key = lang + '|' + level
    if (!byKey.has(key)) byKey.set(key, { lang, level, byAward: new Map() })
    const g = byKey.get(key)
    const award = r.award || '未标注'
    if (!g.byAward.has(award)) g.byAward.set(award, [])
    // 保留排名（蓝桥杯 Finder 数据：省赛=省内组排名，国赛=全国组排名；无排名为 null）
    g.byAward.get(award).push({ name: r.name, rank: r.rank != null ? Number(r.rank) : null })
  }
  const groups = []
  for (const g of byKey.values()) {
    const awards = [...g.byAward.entries()]
      .map(([award, persons]) => ({ award, persons }))
      .sort((a, b) => (AWARD_RANK[a.award] ?? 9) - (AWARD_RANK[b.award] ?? 9))
    groups.push({ lang: g.lang, level: g.level, awards })
  }
  // 固定顺序：C/C++ → Java → Python → 其他；组内 A 在前
  const langIdx = Object.fromEntries(LANGS.map(([k], i) => [k, i]))
  groups.sort((a, b) => langIdx[a.lang] - langIdx[b.lang] || (a.level === 'A' ? -1 : 1) - (b.level === 'A' ? -1 : 1))
  return groups
}

// 奖项 → 配色类（与奖牌色一致；优秀奖浅金灰）
export function lqAwardTone(award) {
  if (/一等奖|特等奖/.test(award)) return 'medal-gold'
  if (/二等奖/.test(award)) return 'medal-silver'
  if (/三等奖/.test(award)) return 'medal-bronze'
  if (/优秀奖/.test(award)) return 'lq-excellent'
  return ''
}
