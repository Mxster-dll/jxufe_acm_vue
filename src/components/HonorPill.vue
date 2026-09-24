<script setup>
/**
 * 比赛战绩胶囊：一枚胶囊内部可以折行，且折行后**盒宽收紧到最宽的那一行**。
 *
 * 为什么需要 JS：胶囊是 inline-flex + flex-wrap，而 inline-level 盒子的自动宽度走
 * shrink-to-fit —— 它按**未折行**的 max-content 算，所以只要内容超过可用宽度，
 * 盒子就撑满整行，第二行短一截的那半截就成了空白（会长 2026-09-23：
 * 「整个胶囊的宽度应该适应内容，而不是比内容宽」）。CSS 没有「折行后再紧缩」这个能力
 * （fit-content / min-content / float / table 全是按 max-content 算），故这里量一次：
 *   ① width:''          → 拿到父容器给的内容宽 avail
 *   ② width:max-content → 单行量出每一段的自然宽度
 *   ③ 若单行放不下，就按浏览器的贪心折行复算一遍，取最宽的那一行作为盒子宽度
 * 段内容由父组件通过默认插槽给（每段一个 .honor-tag__seg），本组件只管盒子。
 */
import { onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'

const el = ref(null)
let ro = null
let busy = false

const measure = () => {
  const node = el.value
  if (!node || busy) return
  busy = true
  try {
    const cs = getComputedStyle(node)
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    const borderBox = cs.boxSizing === 'border-box'

    // ① 回到自然宽度：让浏览器按父容器给的宽度自己折一次行
    node.style.width = ''
    const avail = node.clientWidth - pad
    if (!(avail > 0)) return // 还没上屏 / 被隐藏：下次 RO 会再来

    // ② 量出浏览器这次折出来的每一行有多宽（flex 的一行 = 同一 offsetTop 上各段盒子之和）。
    //    边界用 getBoundingClientRect（亚像素），**不要**用 offsetLeft/offsetWidth ——
    //    它们是整数，会把行宽低估最多 1px，于是盒子被卡到比那一行还窄 1px，浏览器立刻重排。
    const lines = new Map()
    for (const k of node.children) {
      const b = k.getBoundingClientRect()
      const t = k.offsetTop
      const cur = lines.get(t)
      lines.set(t, cur ? { l: Math.min(cur.l, b.left), r: Math.max(cur.r, b.right) } : { l: b.left, r: b.right })
    }
    const countLines = () => new Set(Array.prototype.map.call(node.children, (k) => k.offsetTop)).size
    if (lines.size <= 1) return // 没折行：交回 auto，保持紧跟内容

    let widest = 0
    for (const v of lines.values()) widest = Math.max(widest, v.r - v.l)

    /* ③ 把盒子收到「最宽的那一行」。新宽度 ≥ 每一行，所以字号与折行都不会变 ——
       一次测量即稳定，不需要迭代。（**不要**改成「按各段自然宽自己贪心折一遍」：
       段是 flex 项且带 min-width: 0，浏览器会把放不下的段**压窄**、让它在段内折行，
       自己按自然宽算出的行宽会偏大，盒子反而更空 —— 实测 178px 的盒子只装得下 128px 的行。）
       ⚠ border-box 下写回的是边框盒宽：只加 padding 会让内容盒少掉两像素边框，
       浏览器随即按更窄的宽度重新折行，把本该同行的两段拆开（实测差 40px）。 */
    const border = node.offsetWidth - node.clientWidth
    const before = lines.size
    node.style.width = Math.ceil(widest + (borderBox ? pad + border : 0)) + 'px'

    // 安全网：宽度卡得太紧时浏览器会重排（行变多），那还不如宽一点 —— 退回自然宽度
    if (countLines() > before) node.style.width = ''
  } finally {
    busy = false
  }
}

onMounted(() => {
  measure()
  // 观察**父容器**而不是自己：给自己写宽度会触发自身尺寸变化 → 观察自己会自激
  const parent = el.value?.parentElement
  if (parent && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure())
    ro.observe(parent)
  }
})
onUpdated(measure)
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <span ref="el" class="honor-tag honor-tag--contest honor-tag--stat">
    <slot />
  </span>
</template>
