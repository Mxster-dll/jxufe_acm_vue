import { nextTick, onMounted, onUnmounted, ref } from 'vue'

/** 与 logo / 导航至少留出的呼吸位（px）。 */
export const HINT_NEIGHBOR_GAP = 12

/**
 * 导航栏里那枚「成员墙」入口（会长 2026-09-23 第 2~7 条）。
 *
 * 它由 HomeView 用 `<Teleport to="#header-hint">` 塞进 AppHeader 的插槽里（导航栏在遮罩
 * 之外，所以不能挂在首页的模板树里）。这里负责**它自己的三件事**：横向让位、随滚动隐藏、
 * 切页回来时的淡入。
 *
 * 1) 横向位置：有空间时落在导航栏的中线上；宽度变小、被 logo / 导航按钮夹住时**退开**，
 *    而不是像纯绝对定位那样叠在按钮上面（会长原话：「宽度较小时被导航栏按钮挤离中心」）。
 *    为什么不用纯 CSS：等权托板（两侧 flex: 1）只保证「两侧间距相等」，而 logo 比导航窄得多
 *    （实测 206 vs 569px），结果会被顶到中线左侧 182px，不叫居中；要用绝对定位精确居中，
 *    就必须实测邻居再把中线夹住 —— 那只能靠 JS。
 * 2) 随滚动隐藏：会长要求「往下滚动了（scrollY > 0）就收起来」—— 它是「请上去看墙」的邀请，
 *    人已经往反方向走了就不该再占着导航栏；回到页首自动回来，阈值就是 0、没有缓冲量。
 * 3) 淡入：从别的页面切回首页时它会「啪」地冒出来（它是本页节点，其他页面根本没有它），
 *    所以先挂 opacity: 0，等**实测出位置**再挂 is-ready 淡入 —— 位置从第一帧就是对的
 *    （不再从 50% 滑过来）。
 *
 * @returns {{
 *   hintEl: import('vue').Ref<HTMLElement|null>, // 绑到 <button ref="hintEl">
 *   hintLeft: import('vue').Ref<string|null>,    // 写进 --hint-left；null 时 CSS 回落到 50%
 *   hintHidden: import('vue').Ref<boolean>,      // scrollY > 0 → 收起
 *   hintReady: import('vue').Ref<boolean>,       // 位置实测完 → 淡入
 * }}
 */
export function useHeaderHint() {
  const hintEl = ref(null)
  const hintLeft = ref(null)
  const hintHidden = ref(false)
  const hintReady = ref(false)
  let hintRo = null

  const onWallHintScroll = () => {
    const next = window.scrollY > 0
    if (next !== hintHidden.value) hintHidden.value = next
  }

  /** 实测 logo / 导航的边界，把理想中线夹进可用区间 */
  const measureHint = () => {
    const btn = hintEl.value
    const bar = btn?.closest('.bar')
    if (!btn || !bar) return
    const br = bar.getBoundingClientRect()
    const hw = btn.getBoundingClientRect().width
    if (!hw || !br.width) return
    // logo / nav 在小屏会被 display: none 掉，那种情况下 rect 全是 0，要靠 width 过滤
    const box = (sel) => {
      const el = bar.querySelector(sel)
      const r = el ? el.getBoundingClientRect() : null
      return r && r.width > 0 ? r : null
    }
    const logo = box('.logo')
    const nav = box('nav')

    const want = br.left + br.width / 2 // 理想位置：整条导航栏的中线
    let lo = br.left + hw / 2 // 不越出导航栏
    let hi = br.right - hw / 2
    if (logo) lo = Math.max(lo, logo.right + HINT_NEIGHBOR_GAP + hw / 2) // 不压 logo
    if (nav) hi = Math.min(hi, nav.left - HINT_NEIGHBOR_GAP - hw / 2) // 不压导航

    // lo > hi 说明两侧真的挤没了（比如极窄屏），取中点，至少保持对称
    const center = lo > hi ? (lo + hi) / 2 : Math.min(Math.max(want, lo), hi)
    const next = Math.round(center - br.left) + 'px'
    if (next !== hintLeft.value) hintLeft.value = next
  }

  onMounted(() => {
    window.addEventListener('scroll', onWallHintScroll, { passive: true })
    onWallHintScroll() // 进来时可能就带着 scrollY（刷新后恢复滚动位置）
    // 让位测量：等 Teleport 把节点挂上去之后再测
    nextTick(() => {
      measureHint()
      const bar = hintEl.value?.closest('.bar')
      if (bar) {
        hintRo = new ResizeObserver(measureHint)
        hintRo.observe(bar)
        bar.querySelectorAll('.logo, nav').forEach((el) => hintRo.observe(el))
      }
      // 字体加载完文字宽度会变，补测一次
      if (document.fonts?.ready) document.fonts.ready.then(measureHint).catch(() => {})
      /* 淡入要等两件事落定：① 位置已实测（上面那次 measureHint）；② 路由把滚动位置恢复完
         （切页时 scrollY 会在挂载之后才被改，早判一次会先亮再收）。双 rAF 是等这两步的最省事写法。 */
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          onWallHintScroll()
          hintReady.value = true
        })
      )
    })
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onWallHintScroll)
    hintRo?.disconnect()
    hintRo = null
  })

  return { hintEl, hintLeft, hintHidden, hintReady }
}
