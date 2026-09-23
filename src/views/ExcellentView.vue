<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useJson } from '../composables/useJson'
import { useSkeleton } from '../composables/useSkeleton'
import { useMasonry } from '../composables/useMasonry'
import { HONOR_TYPE_LABELS, normalizeHonors } from '../utils/honorType'
import { stripCoveredHonors } from '../utils/honorCoverage'
import { loadHonorRecords, pillPartsForName, recordsToDetails } from '../utils/honorPills'
import { honorView } from '../utils/honorView'
import { loadMemberRanking, sortByRanking } from '../utils/honorRanking'
import HonorViewSwitch from '../components/HonorViewSwitch.vue'
import HonorPill from '../components/HonorPill.vue'

const { data: members, loading, error } = useJson('/data/members.json', { initial: [] })
const { skeletons } = useSkeleton(9)
const fallback = '/images/excellent_member/default.png'

/** 比赛战绩胶囊：从站点竞赛数据自动汇总（ICPC/CCPC/天梯赛/百度之星/蓝桥杯），
    手写的比赛条目已改为由它呈现 —— 口径与生成逻辑见 utils/honorPills.js。
    数据异步加载，失败时不影响其它内容；两个页面共用同一份缓存。 */
const records = ref(new Map())
onMounted(async () => {
  records.value = await loadHonorRecords()
})

/** 比赛战绩的**三种显示模式**共用这一份原始记录，切换模式不重新取数
    （汇总口径见 utils/honorPills.js，三种模式的定义见 utils/honorView.js）：
      count / icons → 汇总成胶囊（🥇1🥈2 / 🥇🥈🥈）
      detail        → 逐条列出赛事全名，标题与奖牌分开渲染，奖牌按档位着色 */
const pillPartsOf = (m) => pillPartsForName(records.value, m.name, honorView.value)
const detailOf = (m) => recordsToDetails(records.value.get(m.name) || [])

/** 协会职务胶囊：来自两份会长维护的干事名单生成的 /data/duties.json
    （生成器在 07_技术项目/qq-group-avatars/build_duties.py，改名单重跑即可）。
    文字口径「<年份>学年<职务>」，部门负责人一律带「协会」前缀；同一年既有带职务行又有裸名行时
    只取带职务那条。**只用于显示，不进排名分值** —— 手写职务则会按「学生职务」算 1.5 分，
    所以名单里的人不要再在 honors 里手写职务（口径见 AGENTS.md）。
    显示顺序：职务在最前，然后是自动汇总的比赛战绩，最后是手写荣誉。 */
const { data: duties } = useJson('/data/duties.json', { initial: {} })
const dutyOf = (m) => (m.name && duties.value?.people?.[m.name]) || []

/** 手写荣誉：先过掉已被自动汇总覆盖的，再归一化出类型。
    **显示与排名必须用同一份** —— 否则同一块奖牌会在卡片上显示两遍、在分值里算两遍
    （上游名单里还手写着 105 条胶囊已覆盖的竞赛条目，口径与判定见 utils/honorCoverage.js）。
    ⚠ 这一页就是 members.json 那 33 人，**不并入干事** —— 会长 2026-09-23 第二轮裁定：
    「我们还是不要让协会干事必定入『优秀成员』吧」（此前那版自动并入已撤掉）。 */
const cleanedMembers = computed(() =>
  (members.value || []).map((m) => ({
    ...m,
    honors: normalizeHonors(stripCoveredHonors(m.honors)),
  }))
)

/** 显示排名：比赛奖牌 + 手写战绩 + 荣誉加项折算成分值，决定卡片的显示顺序。
    权重表、口径与排序键见 utils/honorRanking.js；数据加载与上面的胶囊共用同一份缓存。 */
const byName = ref(null)
const RANKING_TIMEOUT_MS = 3000
watch(
  cleanedMembers,
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

/** 卡片顺序：按显示排名重排，数据没就绪时保持 members.json 原序 */
const list = computed(() => {
  const arr = cleanedMembers.value
  return byName.value ? sortByRanking(arr, byName.value) : arr
})

/** 卡片上显示的名字：**不愿透露姓名的同学**在数据里另设了 `displayName`（对外显示文本）。
    他的真名仍然写在 `name` 里 —— 自动奖牌汇总（pills.get(m.name)）与显示排名都按真名匹配，
    只是不显示出来；没有 displayName 的人两者相同，行为不变。 */
const shownName = (m) => m.displayName || m.name

/** 瀑布流：卡片高度按内容自适应（荣誉条数差别很大），位置由 useMasonry 逐张放进
    当前最短的列并保持源顺序。列数/间距是 .grid 上的两个 CSS 变量，见样式区。 */
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

      <!-- 荣誉显示方式（会长 2026-09-23）：放在标题与网格之间 —— 它管的是下面整片网格里
           每张卡片的画法，属于页面级命令区；两页共用一份偏好、控件本身不加说明文字。 -->
      <div class="page-toolbar">
        <HonorViewSwitch />
      </div>

      <!-- Loading（成员数据与排名都就绪再渲染网格，避免卡片先排好又跳位） -->
      <div v-if="loading || (members.length && !byName)" class="grid">
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
              <img :src="m.photo || fallback" :alt="shownName(m)" @error="$event.target.src = fallback" />
            </div>
          </div>

          <!-- 信息区 -->
          <div class="member-body">
            <h3>{{ shownName(m) }}</h3>
            <p v-if="m.class" class="member-class">{{ m.class }}</p>

            <!-- 荣誉标签：职务胶囊（duties.json）在前，比赛战绩胶囊（自动汇总）居中，
                 手写荣誉在后；均按类型分色 -->
            <div class="honor-tags">
              <span
                v-for="(d, i) in dutyOf(m)"
                :key="`duty-${i}`"
                class="honor-tag honor-tag--honor"
                :title="HONOR_TYPE_LABELS.honor"
                >{{ d.text }}</span
              >
              <template v-if="honorView === 'detail'">
                <HonorPill
                  v-for="(d, i) in detailOf(m)"
                  :key="`detail-${i}`"
                  :title="`${d.title}${d.medalText}`"
                >
                  <span class="honor-tag__seg"
                    ><span class="medal-emoji" aria-hidden="true">{{ d.emoji }}</span
                    >{{ d.title }}</span
                  >
                  <span class="honor-tag__seg">{{ d.medalText }}</span>
                </HonorPill>
              </template>
              <template v-else>
                <HonorPill
                  v-for="(parts, i) in pillPartsOf(m)"
                  :key="`pill-${i}`"
                  title="比赛战绩，由站点竞赛数据自动汇总"
                >
                  <span
                    v-for="(seg, j) in parts"
                    :key="`seg-${j}`"
                    class="honor-tag__seg"
                    >{{ seg }}</span
                  >
                </HonorPill>
              </template>
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

/* ── 页面命令区：荣誉显示方式（view-toggle 样式在 styles/view-toggle.css）──
   只剩控件本身、不带说明文字（会长 2026-09-23）；与下方网格之间留一段呼吸。 */
.page-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: var(--space-lg);
}

/* 明细模式每条前面的奖牌 emoji：只负责「一眼看出这块牌子是什么档位」。
   奖牌文字本身**不再着色**（会长 2026-09-23）—— 整条胶囊保持它自己的蓝色，
   档位信息由 emoji 承担，段内再换颜色会把一条胶囊拆成两截色。 */
.medal-emoji {
  margin-right: var(--space-xs);
}

.hint {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-3xl) 0;
  font-size: var(--font-size-lg);
}

/* ── 卡片网格（瀑布流的兜底布局 + JS 接管后的定位契约）──
   列数与间距只有这一处旋钮，媒体查询里也只改这两个变量：
     · CSS 这边用它们写 grid 兜底布局（JS 还没接管时/未启用时）；
     · useMasonry 也读同一个元素上的这两个变量算卡片宽度（读不到才用兜底 4 列 / 32px）。
   两边同源，改列数只需改这里。**不要去改 grid-template-columns 的列数**。 */
.grid {
  --masonry-columns: 4;
  --masonry-gap: var(--space-lg);
  display: grid;
  grid-template-columns: repeat(var(--masonry-columns), 1fr);
  gap: var(--masonry-gap);
}
/* useMasonry 接管后：卡片改成绝对定位，位置由 JS 写进内联 left/top。
   用 left/top 而不是 transform，是为了让卡片自己的 hover translateY 继续生效；
   容器高度也由 JS 写（所以这里不设 min-height）。 */
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
   标签的几何与分色全在 styles/honors.css（那边的修饰类只换 --tag-* 五个私有变量），
   这里只管容器排布与 hover 加深 —— 所以**不要**在这个文件里再写 .honor-tag 的颜色：
   scoped 选择器的优先级高于 .honor-tag--xxx，写了就会把六种颜色压成一种。

   胶囊紧跟正文（2026-09-22 会长裁定）：原先用 margin-top: auto 顶到卡片底部，
   矮卡最多空出 175px；现在空白留在卡片底部。 */
.honor-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.member-card:hover .honor-tag {
  background: var(--tag-bg-hover);
  border-color: var(--tag-border-hover);
}

/* ── 响应式 ── */
@media (max-width: 992px) {
  .grid {
    --masonry-columns: 3;
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
    /* 间距必须走变量：useMasonry 读的就是它。若只改 gap 属性，JS 侧会仍按 32px 排版 */
    --masonry-gap: var(--space-md);
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
  }
}
</style>
