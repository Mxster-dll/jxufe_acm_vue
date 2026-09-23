/**
 * 优秀成员名单 = members.json ∪「所有任职过协会干事的人」
 *
 * 会长 2026-09-23：「所有任职过协会干事的都要入优秀成员名单，这一步我希望自动实现，
 * 而不是硬编码。」 —— 所以这条规则**不写人名**，而是读会长维护的干事名单派生出来的
 * /data/duties.json（生成器在 07_技术项目/qq-group-avatars/build_duties.py，
 * 两份名单 `2025 协会干事名单.md` / `2026 协会干事名单.md` 改动后重跑即可）。
 * 明年加了新干事、或补录了往年干事，重跑生成器 → 页面自动跟着变，不需要动这个文件。
 *
 * 头像与班级取自 /data/group_wall.json（生成物）：那份已经把「路径失效」「占位图」
 * 两类头像修过（见 scripts/gen_group_wall.mjs 的 imageOf），比自己再解析一遍可靠。
 * 墙上也没有的人（例如不在 QQ 群里、也没归档头像的干事）照样进名单 ——
 * 头像留空，页面回退到默认头像，卡片上仍有姓名与职务胶囊。
 *
 * 匹配一律按**真名**（与自动战绩汇总、显示排名同一口径）：匿名同学的 `displayName`
 * 只影响显示，所以这里比的是 `name`。
 *
 * @param {{name:string}[]} members   members.json
 * @param {{people?:Record<string,unknown>}} duties  duties.json
 * @param {Record<string,{name?:string,line?:string,full?:string}>} wallTiles  group_wall.json 的 tiles
 * @returns {object[]} 合并后的名单（原名单在前，自动并入的在后）
 */
export function mergeDutyMembers(members = [], duties = {}, wallTiles = {}) {
  const byName = new Map()
  for (const t of Object.values(wallTiles || {})) {
    const key = String(t?.name || '').trim()
    if (key && !byName.has(key)) byName.set(key, t)
  }

  const have = new Set(
    (members || [])
      .map((m) => String(m?.name || '').trim())
      .filter(Boolean)
  )

  const added = []
  for (const raw of Object.keys(duties?.people || {})) {
    const name = String(raw).trim()
    if (!name || have.has(name)) continue
    have.add(name)
    const wall = byName.get(name)
    added.push({
      name,
      // 副题与头像走头像墙那份（含修好的照片）；墙上没有就留空，页面用默认头像兜底
      class: String(wall?.line || '').trim(),
      photo: String(wall?.full || '').trim(),
      honors: [],
      /** 标记来源，便于以后排查「这人为什么在优秀成员页」 */
      fromDuty: true,
    })
  }

  return [...(members || []), ...added]
}
