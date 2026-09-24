/**
 * useCursorRipple — 全局光标涟漪特效
 *
 * 在鼠标移动时，每隔 400ms 从光标位置扩散一圈蓝色涟漪。
 *
 * 用法：
 *   const { start, stop } = useCursorRipple()
 *   onMounted(start); onUnmounted(stop)
 */

import { ref, onUnmounted } from 'vue'

export function useCursorRipple() {
  const ripples = ref([])
  let rippleId = 0
  let lastRippleTime = 0
  let handler = null
  /* 每圈涟漪都有一个 1200ms 的移除定时器 —— id 存下来，卸载时一并清掉。
     原先 setTimeout 的 id 没留：组件卸载后定时器照样触发，去改一个已经没人看的 ref。 */
  const timers = new Set()

  const spawn = (e) => {
    const now = Date.now()
    if (now - lastRippleTime < 400) return
    lastRippleTime = now
    const id = ++rippleId
    ripples.value.push({ id, x: e.clientX, y: e.clientY })
    if (ripples.value.length > 5) ripples.value.splice(0, ripples.value.length - 5)
    const timer = setTimeout(() => {
      timers.delete(timer)
      ripples.value = ripples.value.filter((r) => r.id !== id)
    }, 1200)
    timers.add(timer)
  }

  const start = () => {
    handler = (e) => spawn(e)
    document.addEventListener('mousemove', handler, { passive: true })
  }

  const stop = () => {
    if (handler) {
      document.removeEventListener('mousemove', handler)
      handler = null
    }
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    ripples.value = []
  }

  onUnmounted(stop)

  return { ripples, start, stop }
}
