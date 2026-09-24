/**
 * useCodeTrail — 鼠标代码拖尾特效
 *
 * 全局追踪鼠标，留下一串随机代码字符（{}、()、;、if 等），
 * 字符随鼠标位置生成，向上飘动后淡出消失。
 *
 * 用法：
 *   const { start, stop } = useCodeTrail()
 *   onMounted(start); onUnmounted(stop)
 *
 * 或者限定在某个元素：
 *   const { start, stop } = useCodeTrail(containerRef)
 */

import { onUnmounted } from 'vue'

const CHARS = [
  '{', '}', '(', ')', '[', ']', ';', ':', '=',
  '+', '-', '*', '/', '%', '<', '>', '&', '|', '!',
  '0', '1', 'x', 'i', 'n', 'f',
  'if', 'for', 'int', 'var', 'let', 'new',
  '++', '--', '==', '!=', '<=', '>=', '&&', '||',
  '[]', '()', '=>',
]

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)]
}

/** 容器由调用方传进来 —— 不再用模块级单例：两个实例各自 start() 会互相抢容器，
 *  谁先 stop() 谁把对方的容器整个删掉（2026-09-24 审查）。 */
function spawn(e, container) {
  if (!container) return
  const span = document.createElement('span')
  span.textContent = randomChar()
  span.className = 'code-trail-char'

  const ox = (Math.random() - 0.5) * 20
  const oy = (Math.random() - 0.5) * 10
  span.style.left = (e.clientX + ox) + 'px'
  span.style.top = (e.clientY + oy) + 'px'

  const size = 10 + Math.random() * 10
  span.style.fontSize = size + 'px'
  span.style.opacity = 0.25 + Math.random() * 0.25

  container.appendChild(span)

  span.addEventListener('animationend', () => {
    span.remove()
  })
}

export function useCodeTrail(containerRef) {
  let lastSpawn = 0
  let target = null
  let trailContainer = null

  const throttledMove = (e) => {
    const now = Date.now()
    if (now - lastSpawn < 80) return
    lastSpawn = now
    spawn(e, trailContainer)
  }

  const start = () => {
    // 全局模式：监听整个 document
    if (!containerRef) {
      target = document
    } else {
      target = containerRef?.value ?? containerRef
    }
    if (!target) return

    // 创建拖尾容器
    trailContainer = document.createElement('div')
    trailContainer.className = 'code-trail-container'
    document.body.appendChild(trailContainer)

    target.addEventListener('mousemove', throttledMove, { passive: true })
  }

  const stop = () => {
    if (target) {
      target.removeEventListener('mousemove', throttledMove)
      target = null
    }
    if (trailContainer) {
      trailContainer.remove()
      trailContainer = null
    }
  }

  onUnmounted(stop)

  return { start, stop }
}
