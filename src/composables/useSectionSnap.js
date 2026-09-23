/**
 * 主页「按部分对齐」的滚轮吸附（会长 2026-09-23）。
 *
 * 主页自上而下是三部分：英雄区（#home，正好一屏）→ ABOUT US（#about）→ LATEST NEWS（#news）。
 * 会长要求：一次滚动（滚轮动一格）如果**会露出下一部分**，就别停在半路 ——
 *   · 开始滚动前没对齐在分界处 → 直接落在**正在逼近的那个分界**上；
 *   · 开始滚动前已经对齐在分界处 → 直接跳到**下一页显示的位置**（再往前一个分界）。
 * 两条合起来就是一条规则：**吸附到当前滚动位置严格之后（或之前）的那个分界**。
 *
 * 分界用布局盒算（offsetTop 链），**不能用 getBoundingClientRect** —— 遮罩是靠 transform
 * 让开的，rect 会跟着位移，而吸附必须按真实文档位置算。
 *
 * 触摸**不做**吸附（会长只要求滚轮）；露墙那一下也不走这里 ——
 * 页首之上那一屏是成员墙，由 useMaskReveal 的露墙分支负责。
 *
 * @param {string[]} sectionIds 参与吸附的区块 id（自上而下）
 */
export function useSectionSnap(sectionIds) {
  const SNAP_EPS = 2 // 像素容差：判定「已经对齐在分界处」
  const SNAP_LOCK_MS = 560 // 吸附之后的静默期：别让触控板惯性再触发一整屏
  const SNAP_EXTEND_MS = 180 // 静默期内每来一次滚动就往后顺延一点
  const SNAP_CAP_MS = 1400 // 顺延的上限（惯性尾巴再长也总会结束）
  let snapLockUntil = 0
  let snapCapUntil = 0

  /** 元素在文档里的纵坐标（布局盒，与 transform 无关） */
  const docTopOf = (el) => {
    let y = 0
    for (let n = el; n; n = n.offsetParent) y += n.offsetTop
    return Math.round(y)
  }

  /** 各区块的分界（升序、去重） */
  const sectionBounds = () => {
    const tops = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map(docTopOf)
    return [...new Set(tops)].sort((a, b) => a - b)
  }

  /** 返回 true = 这次滚动已被吸附处理（调用方负责 preventDefault） */
  const snapToSection = (dy) => {
    const now = Date.now()
    if (now < snapLockUntil) {
      // 吸附动画期间（含触控板的惯性尾巴）：吃掉这些滚动，并把静默期往后顺延
      snapLockUntil = Math.min(snapLockUntil + SNAP_EXTEND_MS, snapCapUntil)
      return true
    }
    if (!dy) return false
    const y = window.scrollY
    const bounds = sectionBounds()
    if (bounds.length < 2) return false
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const alignedIdx = bounds.findIndex((b) => Math.abs(b - y) <= SNAP_EPS)
    let target = null
    if (dy > 0) {
      if (alignedIdx >= 0) {
        // 已经对齐在分界处 → 直接去「下一页显示的位置」
        target = alignedIdx + 1 < bounds.length ? bounds[alignedIdx + 1] : null
      } else {
        // 没对齐 → 只有这一格滚下去**真的会露出下一部分**才吸附到那个分界
        const nextB = bounds.find((b) => b > y + SNAP_EPS)
        if (nextB != null && y + dy >= nextB - SNAP_EPS) target = nextB
      }
    } else if (alignedIdx >= 0) {
      // 往上同理；页首之上那一屏是成员墙，由 useMaskReveal 的露墙分支负责，这里不接
      target = alignedIdx > 0 ? bounds[alignedIdx - 1] : null
    } else {
      const prevB = [...bounds].reverse().find((b) => b < y - SNAP_EPS)
      if (prevB != null && y + dy <= prevB + SNAP_EPS) target = prevB
    }
    if (target == null || target < 0 || target > maxY + SNAP_EPS) return false
    snapLockUntil = now + SNAP_LOCK_MS
    snapCapUntil = now + SNAP_CAP_MS
    window.scrollTo({ top: target, left: 0, behavior: 'smooth' })
    return true
  }

  return { snapToSection }
}
