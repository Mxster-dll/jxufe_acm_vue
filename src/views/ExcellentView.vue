<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useJson } from '../composables/useJson'
import { useSkeleton } from '../composables/useSkeleton'
import { useMasonry } from '../composables/useMasonry'
import { HONOR_TYPE_LABELS, normalizeHonors } from '../utils/honorType'
import { loadHonorPills } from '../utils/honorPills'
import { loadMemberRanking, sortByRanking } from '../utils/honorRanking'
import AvatarMosaic from '../components/AvatarMosaic.vue'

const { data: members, loading, error } = useJson('/data/members.json', { initial: [] })
const { skeletons } = useSkeleton(9)
const fallback = '/images/excellent_member/default.png'

/** 比赛战绩胶囊：从站点竞赛数据自动汇总（ICPC/CCPC/天梯赛/百度之星/蓝桥杯），
    手写的比赛条目已改为由它呈现——口径与生成逻辑见 utils/honorPills.js。
    数据异步加载，失败时不影响其它内容；两个页面共用同一份缓存。 */
const pills = ref(new Map())
onMounted(async () => {
  pills.value = await loadHonorPills()
})

/** 显示排名：比赛奖牌 + 手写战绩 + 荣誉加项折算成分值，决定卡片的显示顺序。
    权重表、口径与排序键见 utils/honorRanking.js；数据加载与上面的胶囊共用同一份缓存。 */
const byName = ref(null)
const RANKING_TIMEOUT_MS = 3000
watch(
  members,
  async (val) => {
    if (!val?.length || byName.value) return
    // 网络异常时不能把网格卡在骨架屏上：超时就按数据原始顺序渲染
    const result = await Promise.race([
      loadMemberRanking(val),
      new Promise((resolve) => setTimeout(() => resolve(null), RANKING_TIMEOUT_MS)),
    ])
    byName.value = result ? result.byName : new Map()
  },
  { immediate: true }
)

/** 每条荣誉归一化成 { text, type }（类型判定见 utils/honorType.js），并按排名排列 */
const list = computed(() => {
  const arr = (members.value || []).map((m) => ({ ...m, honors: normalizeHonors(m.honors) }))
  return byName.value ? sortByRanking(arr, byName.value) : arr
})

/** 卡片上显示的名字：**不愿透露姓名的同学**在数据里另设了 `displayName`（对外显示文本）。
    他的真名仍然写在 `name` 里 —— 自动奖牌汇总（pills.get(m.name)）与显示排名都按真名匹配，
    只是不显示出来；没有 displayName 的人两者相同，行为不变。 */
const shownName = (m) => m.displayName || m.name

/** 瀑布流：卡片高度按内容自适应，位置由 useMasonry 逐张放进当前最短的列（保持源顺序） */
const { containerRef } = useMasonry()

/* ── 滚到底之后整块向上抬走 ──
   页面结构是「内容块（.members-pane，里面带一层 Acrylic 遮罩）+ 可交互成员墙（MemberWall）」。
   遮罩底边升到视口 90% 处（即屏幕底部只露出一成清晰墙）时触发抬升：
   内容连同遮罩一起滑出视口，底纹（position: fixed，不随滚动）留在原地 → 只剩成员墙。

   位移取 96vh 而不是 100%：触发时真正还看得见的只有视口的上面九成，
   把它推出去就够了。按内容高度（几千 px）位移会在同样的时间里把画面糊成一片。 */
const LIFT_REVEAL_RATIO = 0.1 // 屏幕底部露出的清晰墙占比达到这个值就抬升
const LIFT_TRIGGER_PX = 24 // 越过触发点再多滚一点才动，避免临界点上抖
const LIFT_RESTORE_PX = 140 // 回滚要退够这么多才放下来（与上面不同值 = 迟滞）

const paneRef = ref(null)
const lifted = ref(false)
let triggerY = -1
let raf = 0
let ro = null

/** 文档坐标里触发抬升的那个滚动位置。
    用 offsetTop 链而不是 getBoundingClientRect()：rect 含 transform，
    内容块抬起之后 rect 会跟着跑到视口上方，再测就测出一个假的阈值。 */
const measureTrigger = () => {
  const el = paneRef.value
  if (!el) return
  if (el.offsetHeight <= window.innerHeight) {
    // 内容还不到一屏：没有可滚的余量，不做抬升
    triggerY = -1
    return
  }
  let top = 0
  for (let node = el; node; node = node.offsetParent) top += node.offsetTop
  triggerY = top + el.offsetHeight - window.innerHeight * (1 - LIFT_REVEAL_RATIO)
}

const onScroll = () => {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    if (triggerY < 0) return
    const y = window.scrollY
    // 两个阈值不同：抬起来之后要往回多滚一点才放下来，避免在临界点上反复抽搐
    if (!lifted.value && y > triggerY + LIFT_TRIGGER_PX) lifted.value = true
    else if (lifted.value && y < triggerY - LIFT_RESTORE_PX) lifted.value = false
  })
}

onMounted(() => {
  measureTrigger()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', measureTrigger, { passive: true })
  // 图片陆续加载、瀑布流重排都会改变内容块高度，阈值要跟着走
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measureTrigger)
    nextTick(() => paneRef.value && ro.observe(paneRef.value))
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measureTrigger)
  if (ro) ro.disconnect()
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <main class="excellent-page container-fluid">
    <!-- 头像墙底纹：固定层，不随页面滚动（Mica 的角色）。放在最前面，
         绘制顺序上就落在光斑与内容之下。
         不透明度 0.9 比原来（0.24）高得多，因为内容那一层现在压着半透明遮罩：
         底纹要先够亮，滚过内容之后才有「一面墙」的份量；被遮罩盖住时约剩 0.135，
         比改动前还干净。两个旋钮分工：这个 prop 管「墙本身多浓」，
         遮罩（.members-scrim）管「内容那一段压多暗」。 -->
    <AvatarMosaic :opacity="0.9" :top-fade="24" interactive :hires="lifted" />

    <div ref="paneRef" class="members-pane" :class="{ 'is-lifted': lifted }">
      <!-- 半透明遮罩：随页面滚动，高度正好等于内容高度（滚过内容底部就没了）。
           全宽出血；内容是 90% 宽居中的，遮罩若跟着收窄，两侧会露出没遮住的高亮竖条。 -->
      <div class="members-scrim" aria-hidden="true"></div>

      <!-- 装饰光斑 -->
      <div class="decorative-orb decorative-orb--primary" style="width:500px;height:500px;top:-200px;right:-150px;opacity:0.06"></div>
      <div class="decorative-orb decorative-orb--accent" style="width:350px;height:350px;bottom:8%;left:-120px;opacity:0.04"></div>

      <div class="container excellent-inner">
        <!-- 标题区 -->
        <header class="page-hero">
          <p class="page-label">EXCELLENT MEMBERS</p>
          <h1>优秀<span class="highlight">成员</span></h1>
          <p class="page-desc">星光不问赶路人，时光不负有心人</p>
        </header>

        <!-- Loading（成员数据与排名都就绪再渲染网格，避免卡片先排好又跳位） -->
        <div v-if="loading || (!byName && !error)" class="grid">
          <div v-for="n in skeletons" :key="n" class="skeleton" style="height:420px;border-radius:var(--radius-xl);"></div>
        </div>

        <!-- Error -->
        <p v-else-if="error" class="hint">加载失败</p>

        <!-- 成员网格 -->
        <div v-else ref="containerRef" class="grid">
          <article
            v-for="(m, i) in list"
            :key="m.name"
            v-reveal="'scale-in'"
            :style="{ '--reveal-index': i }"
            class="member-card"
          >
            <!-- 头像区 -->
            <div class="member-photo">
              <div class="photo-ring"></div>
              <div class="photo-frame">
                <img :src="m.photo" :alt="shownName(m)" @error="$event.target.src = fallback" />
              </div>
            </div>

            <!-- 信息区 -->
            <div class="member-body">
              <h3>{{ shownName(m) }}</h3>
              <p class="member-class">{{ m.class }}</p>

              <!-- 荣誉标签：比赛战绩胶囊（自动汇总）在前，手写荣誉在后；均按类型分色 -->
              <div class="honor-tags">
                <span
                  v-for="(p, i) in pills.get(m.name) || []"
                  :key="`pill-${i}`"
                  class="honor-tag honor-tag--contest honor-tag--stat"
                  title="比赛战绩，由站点竞赛数据自动汇总"
                  >{{ p }}</span
                >
                <span
                  v-for="h in m.honors"
                  :key="h.text"
                  class="honor-tag"
                  :class="`honor-tag--${h.type}`"
                  :title="HONOR_TYPE_LABELS[h.type]"
                  >{{ h.text }}</span
                >
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>

    <!-- 遮罩消失后自然露出来的，还是**这面墙本身** —— 它现在每一格都能悬停，
         从格子里长出一张卡（左圆框头像、右侧荣誉）；页面底部不再另加任何东西。
         :hires 跟着 lifted 走 —— 遮罩一没，整面墙换成 640 原图：124px 的格子在 2× 屏上
         要 248 个物理像素，160 的缩略图会被拉软（见上面 AvatarMosaic 那一行的说明）。 -->
  </main>
</template>

<style scoped>
/* ==========================================================================
   优秀成员页
   ========================================================================== */
.excellent-page {
  position: relative;
  overflow: clip;
  min-height: 100vh;
  margin-top: calc(-1 * var(--header-height));
  /* 上下内边距都交给内容块（.members-pane）：遮罩的 inset: 0 是从内容块的边框盒算起的，
     留在这里的话，遮罩上边缘与页面上边缘之间会露出一条没被遮住的亮墙。 */
  padding: 0;
  /* 两个旋钮：留白 = 遮罩比最后一行卡片多出的那截；模糊 = 遮罩自己那层 Acrylic 的糊度 */
  --scrim-tail: 120px;
  --scrim-blur: 12px;
  background:
    radial-gradient(ellipse 600px 400px at 80% 5%, rgba(26,115,232,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 400px 300px at 15% 90%, rgba(255,152,0,0.03) 0%, transparent 60%),
    linear-gradient(175deg, #f8fafc 0%, #fff 35%, #fff 100%);
}

/* ── 内容块：可以整体向上抬走的一层 ──
   位移取 96vh 而不是 100%：触发时真正还看得见的只有视口的上面九成，
   把它推出去就够了；按内容高度（几千 px）位移会在同样的时间里把画面糊成一片。 */
.members-pane {
  position: relative;
  /* 上：让内容落在固定页头下面；下：遮罩比最后一行卡片再多留一截空白，
     滚到底时先看到一段干净的留白，再看到清晰墙，不至于卡片一切边就换景。 */
  padding: calc(var(--header-height) + 40px) 0 var(--scrim-tail);
  transition: transform 520ms var(--fluent-ease-decelerate);
}
.members-pane.is-lifted {
  transform: translate3d(0, calc(-96vh), 0);
}

/* ── Acrylic 遮罩 ──
   绝对定位在内容块里 → 高度严格等于内容块高度（含下面那截留白），**随页面滚动**，
   滚过之后它就没了，底纹以全强度露出来。

   白度用 acrylic 底色令牌 rgba(252,252,252,.85)，与上一版一致：
   与 0.9 的底纹相乘后内容背后只剩 0.135，正文清清爽爽。
   （试过把白度压到 0.5 让下面那层模糊更明显 —— 视觉上明显「脏」了一截，已回退。）

   模糊挂在这里而不是底纹上（backdrop-filter 糊的正是它背后的东西）：
   遮罩滚到哪，糊到哪；遮罩一走，底下就是一面清晰的墙。
   ⚠ 白度回到 0.85 之后，这层模糊其实已经看不出来了（只有 15% 的墙透出来）。
      它的代价是真的：本机无 GPU 软件渲染下滚动帧时间 16.7ms → 37.2ms（A/B/C 交替四轮取中位数，
      不是噪声；降半径无效，说明开销来自「存在一层实时模糊」本身）。嫌卡就删掉 backdrop-filter
      这两行 —— 视觉上不会有变化。 */
.members-scrim {
  position: absolute;
  inset: 0;
  background: var(--acrylic-background-default);
  backdrop-filter: blur(var(--scrim-blur)) saturate(1.15);
  -webkit-backdrop-filter: blur(var(--scrim-blur)) saturate(1.15);
  /* 遮罩**吃掉指针**：底纹墙的每一格都是可悬停的，但这层白纱盖住的地方墙根本看不清，
     在那里悬停放大一格会很突兀。让它拦住事件，墙就只在「露出来」的那一段可交互。
     （实测：内容区里 elementFromPoint 命中不了瓷砖；把 pane 的 pointer-events 放开后命中的正是
     这一层，说明它是真的在拦 —— 虽然 pane 本身也在拦，两条保险。）
     内容（.excellent-inner，z-index: 1）在它上面，卡片照常收到 hover，不受影响。 */
  pointer-events: auto;
}
@supports not (backdrop-filter: blur(1px)) {
  /* 不支持就退回一层更实的纯色，别让正文直接压在毛玻璃上 */
  .members-scrim {
    background: var(--acrylic-background-base);
  }
}

@media (prefers-reduced-motion: reduce) {
  .members-pane {
    transition: none;
  }
}
.excellent-inner {
  position: relative;
  z-index: 1;
  width: 90%;
  margin: 0 auto;
}

/* ── 标题区 ── */
.page-hero {
  text-align: center;
  margin-bottom: 56px;
  padding: 0;
}
.page-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 4px;
  color: var(--primary);
  font-weight: 700;
  margin-bottom: 6px;
}
.page-hero h1 {
  font-size: 2.6rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}
.page-hero h1 .highlight {
  color: var(--primary);
  position: relative;
}
.page-hero h1 .highlight::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 4px;
  width: 100%;
  height: 9px;
  background: rgba(26, 115, 232, 0.12);
  border-radius: 2px;
  z-index: -1;
}
.page-desc {
  font-size: var(--font-size-base);
  color: var(--text-muted);
}

.hint {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-3xl) 0;
  font-size: var(--font-size-lg);
}

/* ── 卡片网格 ──
   瀑布流：卡片高度按内容自适应，位置由 composables/useMasonry.js 逐张放进当前最短的列
   （保持源顺序）。列数/间距以 CSS 变量交给它，响应式断点因此仍留在 CSS 里。
   下面这套 grid 只是 JS 接管前的兜底——is-masonry 一加上就换成绝对定位。 */
.grid {
  --masonry-columns: 4;
  --masonry-gap: var(--space-lg);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
}
.grid.is-masonry {
  display: block;
  position: relative;
}
.grid.is-masonry > * {
  position: absolute;
  top: 0;
  left: 0;
}

/* ── 卡片 ── */
.member-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.05);
  border-radius: var(--radius-xl);
  box-shadow: 0 2px 12px rgba(0,0,0,0.03);
  transition: transform var(--transition-spring), box-shadow var(--transition), border-color var(--transition);
}
.member-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 36px rgba(26,115,232,0.08);
  border-color: rgba(26,115,232,0.15);
}

/* ── 头像区 ── */
.member-photo {
  position: relative;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(26,115,232,0.03) 0%, transparent 100%);
  overflow: hidden;
}
/* 底部渐变线 */
.member-photo::after {
  content: "";
  position: absolute;
  left: var(--space-lg);
  right: var(--space-lg);
  bottom: 0;
  height: 2px;
  background: var(--gradient-primary);
  border-radius: 1px;
  transition: left var(--transition), right var(--transition);
}
.member-card:hover .member-photo::after {
  left: 8px;
  right: 8px;
}

/* 头像光环 */
.photo-ring {
  position: absolute;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: conic-gradient(var(--primary), var(--primary-light), var(--accent), var(--primary));
  opacity: 0;
  transition: opacity var(--transition-slow);
  animation: ring-spin 5s linear infinite;
}
@keyframes ring-spin {
  to { transform: rotate(360deg); }
}
.member-card:hover .photo-ring {
  opacity: 0.25;
}

/* 头像框 */
.photo-frame {
  position: relative;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  padding: 3px;
  background: var(--gradient-primary);
  transition: transform var(--transition-spring);
  z-index: 1;
}
.member-card:hover .photo-frame {
  transform: scale(1.06);
}
.photo-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #fff;
}

/* ── 信息区 ── */
.member-body {
  flex: 1;
  padding: var(--space-lg);
  text-align: center;
  display: flex;
  flex-direction: column;
}
.member-body h3 {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
  transition: color var(--transition-fast);
}
.member-card:hover .member-body h3 {
  color: var(--primary);
}
.member-class {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
  margin-bottom: var(--space-md);
}

/* ── 荣誉标签 ──
   标签本身的几何与配色在 styles/honors.css（与负责人页共用）；
   这里只管排布，以及卡片 hover 时按各自类型的颜色加深。 */
.honor-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  /* 紧跟正文（班级行自带 margin-bottom: var(--space-md)），不顶到卡片底部。
     同一行卡片高度由最高的那张决定，若用 margin-top: auto 会把胶囊推到卡片底部，
     内容少的卡片上方就空出一大块（实测最多 175px）。 */
}
.member-card:hover .honor-tag {
  background: var(--tag-bg-hover);
  border-color: var(--tag-border-hover);
}

/* ── 响应式 ── */
@media (max-width: 992px) {
  .grid {
    --masonry-columns: 3;
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 768px) {
  .members-pane {
    padding-top: calc(var(--header-height) + 30px);
  }
  .page-hero {
    margin-bottom: 48px;
  }
  .page-hero h1 {
    font-size: 2rem;
  }
  .grid {
    --masonry-columns: 2;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-md);
  }
  .member-photo {
    height: 210px;
  }
  .photo-frame {
    width: 150px;
    height: 150px;
  }
  .photo-ring {
    width: 170px;
    height: 170px;
  }
}
@media (max-width: 576px) {
  .page-hero h1 {
    font-size: 1.7rem;
  }
  .grid {
    --masonry-columns: 1;
    grid-template-columns: 1fr;
  }
}
</style>
