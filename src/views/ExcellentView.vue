<script setup>
import { computed, onMounted, ref } from 'vue'
import { useJson } from '../composables/useJson'
import { useSkeleton } from '../composables/useSkeleton'
import { useMasonry } from '../composables/useMasonry'
import { HONOR_TYPE_LABELS, normalizeHonors } from '../utils/honorType'
import { loadHonorPills } from '../utils/honorPills'

const { data: members, loading, error } = useJson('/data/members.json', { initial: [] })
const { skeletons } = useSkeleton(9)
const fallback = '/images/excellent_member/default.png'

/** 每条荣誉归一化成 { text, type }，type 决定标签颜色（类型判定见 utils/honorType.js） */
const list = computed(() =>
  (members.value || []).map((m) => ({ ...m, honors: normalizeHonors(m.honors) }))
)

/** 比赛战绩胶囊：从站点竞赛数据自动汇总（ICPC/CCPC/天梯赛/百度之星/蓝桥杯），
    手写的比赛条目已改为由它呈现——口径与生成逻辑见 utils/honorPills.js。
    数据异步加载，失败时不影响其它内容；两个页面共用同一份缓存。 */
const pills = ref(new Map())
onMounted(async () => {
  pills.value = await loadHonorPills()
})

/** 瀑布流：卡片高度按内容自适应，位置由 useMasonry 逐张放进当前最短的列（保持源顺序） */
const { containerRef } = useMasonry()
</script>

<template>
  <main class="excellent-page container-fluid">
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

      <!-- Loading -->
      <div v-if="loading" class="grid">
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
              <img :src="m.photo" :alt="m.name" @error="$event.target.src = fallback" />
            </div>
          </div>

          <!-- 信息区 -->
          <div class="member-body">
            <h3>{{ m.name }}</h3>
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
  padding: calc(var(--header-height) + 40px) 0 var(--space-3xl);
  background:
    radial-gradient(ellipse 600px 400px at 80% 5%, rgba(26,115,232,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 400px 300px at 15% 90%, rgba(255,152,0,0.03) 0%, transparent 60%),
    linear-gradient(175deg, #f8fafc 0%, #fff 35%, #fff 100%);
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
  .excellent-page {
    padding: calc(var(--header-height) + 30px) 0 var(--space-2xl);
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
