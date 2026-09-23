import { onMounted, onUnmounted, ref, watchEffect } from 'vue'

/** 触摸触发所需的位移：一屏的 10%（只给移动端用，桌面已取消阈值）。 */
export const MASK_REVEAL_RATIO = 0.1
/** 触摸能拉多远：一直到遮罩整层移出视口（与 CSS `.page-mask.is-out` 的 105vh 一致）。
    10% 只决定「松手后触不触发」，**不限制手指能拉多远**。 */
export const MASK_MAX_RATIO = 1.05
/** 拖动的阻尼：免得手指/滑轮挪一点点就把遮罩拉到底。 */
export const MASK_DRAG_DAMP = 0.5
/** 遮罩位移时长：**露墙（下移）与请回（上移）共用同一个值** —— 会长 2026-09-23：
    「遮罩下移露出墙的速度，要和遮罩上移、显示其他页的速度一致」。
    520ms 同时对上两件事：① 请回来的回程本来就是 520ms；② 翻页吸附走浏览器的平滑滚动，
    实测 802px 约 430ms（量到终值 1px 内），与这条 520ms + cubic-bezier(.22,1,.36,1) 同一档
    （曲线尾巴很快，520ms 声明值会量到约 420ms），三者实测差 ≤ 16ms。
    必须同值的三处：这个常量、CSS 里 .page-mask.is-out 与 .is-returning、以及 --mask-ms。 */
export const MASK_MOVE_MS = 520

/**
 * 「遮罩」的位移与两种驱动（会长 2026-09-23 裁定：**遮罩 = 除了墙和导航栏的整个页面**）。
 *
 * 墙铺在遮罩下面、自己不动；遮罩就是首页的全部内容 —— 首页不渲染 App.vue 那份
 * `<AppFooter v-if="route.name !== 'home'">`，而 HomeView 自己那份页脚在 #news 里，
 * 所以「整个页面」这个边界是天然干净的（导航栏在 App.vue，也在遮罩之外）。
 * 正常滚动：遮罩跟着页面上下走 —— 往下滚就是遮罩上移，于是看到 #about 的
 * 「以代码为桥梁 / 连接技术与未来」。
 *
 * 两套驱动（会长分派）：
 *   · 桌面（滚轮）—— **取消阈值**：在页首轻轻往上一动就整层收起，不必拉过 10%；
 *   · 移动端（触摸）—— **保留一屏的 10%**：拖动时遮罩跟手，松手时不足 10% 回弹、
 *     够了才触发。
 * 往下滚一下就把遮罩请回来；点导航栏那枚「成员墙」也是直接收起。
 *
 * 从 HomeView.vue 抽出来的（会长 2026-09-23 屎山审查）：原先滚轮 / 触摸 / 位移 / 变量发布
 * 全塞在 2200 行的视图里。这里只管遮罩本身，**分节吸附**由 useSectionSnap 提供、在
 * 调用方串起来（`useMaskReveal({ snap })`）。
 *
 * @param {{ snap?: (rawDy: number) => boolean }} options
 *   snap —— 遮罩还在（正常浏览）时，把「原始」滚动位移交给它做分节吸附；
 *   返回 true 表示这次滚动已被吸附消费掉。
 */
export function useMaskReveal({ snap } = {}) {
  const maskShift = ref(0)
  const maskOut = ref(false)
  const maskReturning = ref(false)
  let maskLimit = 0
  let maskMax = 0
  let maskReturnTimer = 0
  let touchY = 0
  // 本次手势里已经「请回」过一次：剩下的位移一并吃掉，否则遮罩刚回来，
  // 同一段上划会顺手把页面滚下去（实测停在 scrollY 90）。
  let touchRecall = false

  const resetMaskLimit = () => {
    maskLimit = Math.max(80, window.innerHeight * MASK_REVEAL_RATIO)
    maskMax = window.innerHeight * MASK_MAX_RATIO
  }

  /** 回程动画：归零之前先挂上 is-returning（CSS 那份 transition），到点再摘掉 */
  const startMaskReturn = () => {
    maskReturning.value = true
    window.clearTimeout(maskReturnTimer)
    maskReturnTimer = window.setTimeout(() => {
      maskReturning.value = false
    }, MASK_MOVE_MS)
  }

  /** 累积拖动位移（dy < 0 = 往下拉、露出上面的墙）。返回是否吃掉了这次滚动。
      这里**只累积、不触发** —— 什么时候算「拉够了」由调用方定：
      桌面滚轮当场触发（handleWheel），触摸等松手判定（handleTouchEnd）。 */
  const dragMask = (dy) => {
    // 手指/滚轮重新接管：立刻结束回程动画，保证跟手
    maskReturning.value = false
    if (window.scrollY > 0) {
      // 不在页首：这是正常翻页，遮罩不参与
      if (maskShift.value) maskShift.value = 0
      return false
    }
    if (dy < 0) {
      // 夹的是「整层移出视口」那个位置，不是 10% 阈值 —— 阈值只管松手判定
      maskShift.value = Math.min(maskShift.value - dy, maskMax)
      return true
    }
    if (maskShift.value > 0) {
      maskShift.value = Math.max(0, maskShift.value - dy)
      return true
    }
    return false
  }

  /** 已经收起：只认「往下滚」 —— 先把遮罩请回来，这一次滚动不落到页面上 */
  const recallMask = (dy) => {
    if (dy <= 0) return false
    // 收起与请回同为 MASK_MOVE_MS 缓动，直接归零会「啪」地跳回一屏，所以回程也走一段缓动
    startMaskReturn()
    maskOut.value = false
    maskShift.value = 0
    // 遮罩被 translate 出去时会把文档撑高（实测 scrollHeight 2641 → 3279），
    // 若这期间有人拖滚动条 / 按空格把文档滚下去了，请回来就会错位 —— 这里拉回页首。
    // 必须 behavior: 'instant'，理由见 revealWall 的注释。
    if (window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    return true
  }

  /** 收起遮罩，露出整面成员墙。三条路都汇到这里：
      点导航栏那枚「成员墙」/ 桌面滚轮在页首往上动一下 / 移动端拖过一屏的 10% 松手。
      先把文档拉回页首：遮罩是靠 translate 让开的，若此刻页面已经滚到下面，
      光位移一屏它仍留在视口里，露不出墙。
      必须显式 behavior: 'instant' —— base.css:21 有 scroll-behavior: smooth，
      默认的 scrollTo(0,0) 会走成异步平滑滚动，而紧接着遮罩位移会改变文档高度，
      那次动画会被打断、页面停在原地（实测停在 scrollY 358）。 */
  const revealWall = () => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    maskReturning.value = false
    maskShift.value = maskLimit
    maskOut.value = true
  }

  /** 成员浮窗开着时，滚轮 / 触摸都归浮窗自己（它的正文本就可滚），不许再动遮罩
      —— 会长 2026-09-23：「点击显示成员浮窗后，鼠标滚轮不应该再移动遮罩」。
      HeroAvatarWall 开浮窗时会给 body 挂 `hero-wall-sheet`（同时把 body 的 overflow 锁掉），
      这里只读那个类名即可，不必让组件再往上传一份状态。 */
  const sheetOpen = () => document.body.classList.contains('hero-wall-sheet')

  /** 滚轮 = 桌面。会长 2026-09-23：取消 10% 阈值 —— 在页首轻轻往上一动就整层收起。
      （以前要先累积到一屏的 10%，现在第一下就算数。） */
  const handleWheel = (e) => {
    if (sheetOpen()) return // 浮窗里的滚轮只滚它自己的正文
    const dy = e.deltaY * MASK_DRAG_DAMP
    // 吸附判定要用**原始**位移（浏览器真正会滚多少），不能拿遮罩的阻尼值去算
    const raw =
      e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY
    if (maskOut.value) {
      if (recallMask(dy)) e.preventDefault()
      return
    }
    if (raw < 0 && window.scrollY === 0) {
      revealWall()
      e.preventDefault()
      return
    }
    // 遮罩还在（正常浏览）：按「一部分一屏」吸附
    if (snap?.(raw)) {
      e.preventDefault()
      return
    }
    // 其余情况：正常翻页；若触摸留下的位移还没归零，顺手收掉
    if (dragMask(dy)) e.preventDefault()
  }

  /** 触摸 = 移动端。会长 2026-09-23：这里**保留一屏的 10%**，但改成「拖动 → 松手判定」——
      拖动时遮罩跟手，松手不足 10% 回弹，够了才触发。 */
  const handleTouchStart = (e) => {
    touchY = e.touches[0]?.clientY ?? 0
    touchRecall = false
  }

  const handleTouchMove = (e) => {
    if (sheetOpen()) return // 同上：浮窗里的触摸交给浮窗自己滚
    const y = e.touches[0]?.clientY ?? 0
    // 手指往下拖（y 增大）→ 遮罩下移，故取 touchY - y，与滚轮同一个符号约定
    const dy = (touchY - y) * MASK_DRAG_DAMP
    touchY = y
    if (touchRecall) {
      // 本次手势已经请回过，余下的位移吃掉（见 touchRecall 的注释）
      if (e.cancelable) e.preventDefault()
      return
    }
    if (maskOut.value) {
      if (recallMask(dy)) {
        touchRecall = true
        if (e.cancelable) e.preventDefault()
      }
      return
    }
    if (dragMask(dy) && e.cancelable) e.preventDefault()
  }

  const handleTouchEnd = () => {
    if (sheetOpen()) return // 浮窗开着时松手不判定，免得顺手把遮罩也带走
    if (maskOut.value || maskShift.value <= 0) return
    if (maskShift.value >= maskLimit) {
      maskOut.value = true // 拉过一屏的 10%：触发（.is-out 自带 MASK_MOVE_MS 缓动）
    } else {
      startMaskReturn() // 不足 10%：回弹
      maskShift.value = 0
    }
  }

  onMounted(() => {
    resetMaskLimit()
    // wheel / touchmove 必须 passive: false —— Chrome 把 window 上的它们默认当 passive，
    // 那样 preventDefault 无效（遮罩也就在拖动时把页面一起滚了）。
    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    window.addEventListener('resize', resetMaskLimit, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('wheel', handleWheel)
    window.removeEventListener('touchstart', handleTouchStart)
    window.removeEventListener('touchmove', handleTouchMove)
    window.removeEventListener('touchend', handleTouchEnd)
    window.removeEventListener('touchcancel', handleTouchEnd)
    window.removeEventListener('resize', resetMaskLimit)
    window.clearTimeout(maskReturnTimer)
    // watchEffect 会随组件销毁，但它写在 <html> 上的东西得自己擦掉
    const root = document.documentElement
    root.style.removeProperty('--mask-shift')
    root.classList.remove('is-mask-out', 'is-mask-returning')
  })

  // 导航栏在 App.vue 里、属于遮罩之外（会长最早的口径就是「除了墙和导航栏」），
  // 但会长 2026-09-23 补了一条：遮罩被拉下去时导航栏也要**一起**下移。
  // 它没法靠 DOM 嵌套跟着走，于是把状态写到 <html> 上，由 AppHeader.vue 的样式消费。
  watchEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--mask-shift', `${maskShift.value}px`)
    // 导航栏的位移过渡时长：拖动中必须为 0（否则每一帧都在追赶），滑出/回程各给一段缓动。
    // 用变量传过去，AppHeader 那边就不用把 transition 清单抄成三份。
    root.style.setProperty(
      '--mask-ms',
      maskOut.value || maskReturning.value ? `${MASK_MOVE_MS}ms` : '0ms'
    )
    root.classList.toggle('is-mask-out', maskOut.value)
    root.classList.toggle('is-mask-returning', maskReturning.value)
  })

  return {
    maskShift,
    maskOut,
    maskReturning,
    dragMask,
    recallMask,
    revealWall,
    sheetOpen,
  }
}
