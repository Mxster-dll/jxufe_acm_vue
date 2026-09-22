/**
 * useMasonry：保持源顺序的瀑布流布局（「逐张放进当前最短的列」，与 Pinterest 同款算法）。
 *
 * 为什么不用 CSS：
 *   ① `grid-template-rows: masonry` 还没进 Chrome 稳定版，线上不能依赖；
 *   ② 纯 CSS 多列（`columns`）虽然零 JS、自动均衡，但排列是「先竖后横」——第 2 位
 *      成员会跑到第二列顶部。而成员卡是按资历/年级排的，顺序不能乱，故自己算位置。
 *
 * 用法：
 *   const { containerRef } = useMasonry()
 *   <div class="grid" ref="containerRef"> …直接子元素就是卡片… </div>
 *
 * 列数与间距由容器上的 CSS 变量决定（媒体查询里改，保持响应式断点仍在 CSS 里）：
 *   --masonry-columns  列数
 *   --masonry-gap      卡片间距
 * 卡片宽度由 JS 按容器实际宽度算（绝对定位后不再吃 grid 的 1fr），位置写进内联
 * left/top —— 不用 transform，好让卡片自己的 hover 位移动画（translateY）继续生效。
 *
 * 自动重排的时机（组件不用手动管）：
 *   · 容器宽度变化（窗口缩放、断点切换）
 *   · 子元素增减（数据到达、v-if 切换）
 *   · 子元素高度变化（比赛战绩胶囊异步加载完，卡片变高）
 */
import { onBeforeUnmount, ref, watch } from 'vue'

export function useMasonry(options = {}) {
  const {
    /** 列数所在的 CSS 变量名 */
    columnsVar = '--masonry-columns',
    /** 间距所在的 CSS 变量名 */
    gapVar = '--masonry-gap',
    /** 变量读不到时的兜底（正常情况下 CSS 里都定义了） */
    fallbackColumns = 4,
    fallbackGap = 32,
    /** JS 接管后加在容器上的类名，用于把 grid 兜底布局换成绝对定位 */
    activeClass = 'is-masonry',
  } = options

  const containerRef = ref(null)
  let containerRO = null
  let childRO = null
  let childMO = null
  let laying = false
  let placed = false
  let lastWidth = -1
  let lastSignature = ''

  /** 读容器上的 CSS 变量（媒体查询里的列数/间距就是这样传进来的） */
  const readNumber = (el, name, fallback) => {
    const value = parseFloat(getComputedStyle(el).getPropertyValue(name))
    return Number.isFinite(value) && value > 0 ? value : fallback
  }

  /** 算一次布局：量高度 → 逐张放进最短列 → 写 left/top 与容器高度 */
  const layout = () => {
    const container = containerRef.value
    if (!container) return
    const width = container.clientWidth
    if (!width) return

    const cards = Array.from(container.children)
    if (!cards.length) {
      container.style.height = ''
      return
    }

    const columns = Math.max(1, Math.round(readNumber(container, columnsVar, fallbackColumns)))
    const gap = readNumber(container, gapVar, fallbackGap)
    const cardWidth = (width - gap * (columns - 1)) / columns

    // ① 写：先统一宽度（绝对定位后宽度不再由容器决定）
    for (const card of cards) card.style.width = `${cardWidth}px`

    // ② 读：一次性量完所有高度（避免读写交替引起多次强制重排）
    const heights = cards.map((card) => card.offsetHeight)

    // 无变化就别再写一遍 —— 同时这也是防 ResizeObserver 自我触发的闸门：
    // 容器高度是我们自己设的，高度变化会再次回调，但那时 signature 相同，这里直接返回。
    const signature = `${width}|${cardWidth}|${heights.join(',')}`
    if (placed && signature === lastSignature) return

    // ③ 写：逐张放进当前最短的列
    const columnHeights = new Array(columns).fill(0)
    cards.forEach((card, i) => {
      let target = 0
      for (let c = 1; c < columns; c++) {
        if (columnHeights[c] < columnHeights[target] - 0.5) target = c
      }
      card.style.left = `${(cardWidth + gap) * target}px`
      card.style.top = `${columnHeights[target]}px`
      columnHeights[target] += heights[i] + gap
    })

    container.style.height = `${Math.max(...columnHeights) - gap}px`
    container.classList.add(activeClass)
    lastSignature = signature
    placed = true
  }

  const schedule = () => {
    // 同步重排，不用 requestAnimationFrame 推迟一帧：ResizeObserver 回调发生在
    // 「浏览器布局之后、绘制之前」，在这里把位置改掉正好赶上同一帧，
    // 否则胶囊异步渲染完的那一帧会看到卡片还挤在老位置上（窄屏下就是肉眼可见的重叠）。
    // 唯一的闸门是重入保护：layout() 写宽度/高度会再次触发观察器，靠 signature 收敛。
    if (laying || !containerRef.value) return
    laying = true
    try {
      layout()
    } finally {
      laying = false
    }
  }

  /** 观察子元素：高度变化（胶囊异步加载）与增减（数据到达）都要重排 */
  const observeChildren = (container) => {
    childRO?.disconnect()
    childRO = new ResizeObserver(schedule)
    for (const card of Array.from(container.children)) childRO.observe(card)

    if (childMO) return // 容器上的 childList 监听只需绑一次
    childMO = new MutationObserver(() => {
      const el = containerRef.value
      if (!el) return
      observeChildren(el)
      schedule()
    })
    childMO.observe(container, { childList: true })
  }

  const bind = (container) => {
    containerRO?.disconnect()
    containerRO = null
    childRO?.disconnect()
    childRO = null
    childMO?.disconnect()
    childMO = null
    lastWidth = -1
    lastSignature = ''
    placed = false
    if (!container) return

    containerRO = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      // 只看宽度：容器高度由我们写，跟着高度重排会自我触发
      if (Math.abs(width - lastWidth) < 0.5) return
      lastWidth = width
      schedule()
    })
    containerRO.observe(container)
    observeChildren(container)
    schedule()
  }

  // 卡片列表常常是 v-if/v-else 渲染的（骨架屏 → 真实网格），
  // 组件挂载时容器可能还不存在，所以监听 ref 本身，等它出现再绑定。
  watch(containerRef, (container) => bind(container), { flush: 'post' })

  onBeforeUnmount(() => {
    containerRO?.disconnect()
    childRO?.disconnect()
    childMO?.disconnect()
  })

  return { containerRef, refresh: schedule }
}
