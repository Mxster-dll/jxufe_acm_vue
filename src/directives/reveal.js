/**
 * v-reveal：元素进入视口时加 .is-visible 触发入场动画。
 *
 * 用法：
 *   <div v-reveal>…</div>                    → 默认 fade-up
 *   <div v-reveal="'fade-in'">…</div>        → 纯淡入
 *   <div v-reveal="'scale-in'">…</div>       → 缩放淡入
 *   <div v-reveal="'slide-left'">…</div>     → 从左滑入
 *   <div v-reveal="'slide-right'">…</div>    → 从右滑入
 *   <div v-reveal="'fade-up'" :style="{ '--reveal-index': index }">…</div>  → 级联延迟
 */

const VARIANTS = ['fade-up', 'fade-in', 'scale-in', 'slide-left', 'slide-right']
const DEFAULTS = { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }

/**
 * 解析绑定值：字符串（变体名）或对象 { variant, threshold, rootMargin }
 * 大容器（如超长参赛历史表）请传小 threshold + 正 rootMargin 提前触发，
 * 避免滚动大半屏才出现入场动画。
 */
function normalize(value) {
  if (typeof value === 'string') {
    return { variant: VARIANTS.includes(value) ? value : 'fade-up', ...DEFAULTS }
  }
  if (value && typeof value === 'object') {
    return {
      variant: VARIANTS.includes(value.variant) ? value.variant : 'fade-up',
      threshold: value.threshold ?? DEFAULTS.threshold,
      rootMargin: value.rootMargin ?? DEFAULTS.rootMargin,
    }
  }
  return { variant: 'fade-up', ...DEFAULTS }
}

export const vReveal = {
  mounted(el, binding) {
    const { variant, threshold, rootMargin } = normalize(binding.value)
    el.setAttribute('data-reveal', variant)
    el._revealed = false

    // 不支持 IntersectionObserver 时直接显示，避免内容永远不可见
    if (!('IntersectionObserver' in window)) {
      el.classList.add('is-visible')
      el._revealed = true
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            entry.target._revealed = true
            io.unobserve(entry.target)
          }
        })
      },
      { threshold, rootMargin }
    )
    io.observe(el)
    el._revealObserver = io
  },
  updated(el) {
    // 防御：Vue 的 :class 动态绑定更新时会整体赋值 el.className，
    // 可能把 JS 手动加的 is-visible 一起抹掉（元素回到 opacity:0 初始态）。
    // 已入场过的元素若丢失 is-visible，立即补回，避免"切换后内容消失"。
    if (el._revealed && !el.classList.contains('is-visible')) {
      el.classList.add('is-visible')
    }
  },
  unmounted(el) {
    el._revealObserver?.disconnect()
  }
}
