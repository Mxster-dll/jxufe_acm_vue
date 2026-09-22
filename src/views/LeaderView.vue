<script setup>
import { computed, onMounted, ref } from "vue";
import { useJson } from "../composables/useJson";
import { useSkeleton } from "../composables/useSkeleton";
import { HONOR_TYPE_LABELS, normalizeHonors } from "../utils/honorType";
import { stripCoveredHonors } from "../utils/honorCoverage";
import { loadHonorRecords, pillPartsForName, recordsToDetails } from "../utils/honorPills";
import { honorView } from "../utils/honorView";
import HonorViewSwitch from "../components/HonorViewSwitch.vue";
import HonorPill from "../components/HonorPill.vue";

const {
  data: leaders,
  loading,
  error,
} = useJson("/data/leaders.json", { initial: [] });
/* 6 位负责人 —— 原先写 5，骨架屏条数与实际列表不等 */
const { skeletons } = useSkeleton(6);

/** 每条荣誉：先过掉已被自动汇总覆盖的（口径见 utils/honorCoverage.js），
    再归一化成 { text, type }，type 决定标签颜色（类型判定见 utils/honorType.js） */
const list = computed(() =>
  (leaders.value || []).map((l) => ({
    ...l,
    achievements: normalizeHonors(stripCoveredHonors(l.achievements)),
  }))
);

/** 卡片上显示的名字：**不愿透露姓名的同学**在数据里另设了 `displayName`（对外显示文本）。
    真名仍写在 `name` 里 —— 自动奖牌汇总 `pills.get(l.name)` 按真名匹配，只是不显示出来。 */
const shownName = (l) => l.displayName || l.name;

/** 比赛战绩胶囊：从站点竞赛数据自动汇总（ICPC/CCPC/天梯赛/百度之星/蓝桥杯），
    手写的比赛条目已改为由它呈现——口径与生成逻辑见 utils/honorPills.js。
    数据异步加载，失败时不影响其它内容；与优秀成员页共用同一份缓存。

    注意本页**不按显示排名重排**：显示排名只决定优秀成员页的卡片顺序
    （见 utils/honorRanking.js），负责人页保持 leaders.json 的原顺序（届次从新到旧）。 */
const records = ref(new Map());
onMounted(async () => {
  records.value = await loadHonorRecords();
});

/** 比赛战绩的三种显示模式共用这份原始记录（模式定义见 utils/honorView.js）：
    count/icons → 汇总胶囊，detail → 逐条赛事全名。与优秀成员页共用缓存。 */
const pillPartsOf = (l) => pillPartsForName(records.value, l.name, honorView.value);
const detailOf = (l) => recordsToDetails(records.value.get(l.name) || []);
</script>

<template>
  <main class="leader-page container-fluid">
    <!-- 装饰光斑 -->
    <div
      class="decorative-orb decorative-orb--primary"
      style="
        width: 550px;
        height: 550px;
        top: -220px;
        right: -180px;
        opacity: 0.06;
      "
    ></div>
    <div
      class="decorative-orb decorative-orb--accent"
      style="
        width: 380px;
        height: 380px;
        bottom: 8%;
        left: -140px;
        opacity: 0.04;
      "
    ></div>
    <div
      class="decorative-orb decorative-orb--light"
      style="
        width: 300px;
        height: 300px;
        top: 50%;
        right: -100px;
        opacity: 0.04;
      "
    ></div>

    <div class="container leader-inner">
      <!-- 标题区 -->
      <header class="page-hero">
        <p class="page-label">ASSOCIATION LEADERS</p>
        <h1>协会<span class="highlight">负责人</span></h1>
        <p class="page-desc">这故事开始一个人，我认真写成了我们</p>
      </header>

      <!-- 荣誉显示方式（会长 2026-09-23）：与优秀成员页同一份偏好，切换在这里改、
           两页同时生效（偏好存 localStorage，见 utils/honorView.js）；不加说明文字。 -->
      <div class="page-toolbar">
        <HonorViewSwitch />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="skeleton-list">
        <div
          v-for="n in skeletons"
          :key="n"
          class="skeleton"
          style="
            height: 280px;
            border-radius: var(--radius-xl);
            margin-bottom: var(--space-lg);
          "
        ></div>
      </div>

      <!-- Error -->
      <p v-else-if="error" class="hint">加载失败</p>

      <!-- 负责人列表 -->
      <div v-else class="leader-grid">
        <article
          v-for="(l, i) in list"
          :key="l.name"
          v-reveal="'fade-up'"
          :style="{ '--reveal-index': i }"
          class="leader-card"
        >
          <!-- 届数飘带 -->
          <div class="session-ribbon">{{ l.session }}</div>

          <!-- 头像区 -->
          <div class="leader-avatar-wrap">
            <div class="avatar-ring"></div>
            <img :src="l.avatar" :alt="shownName(l)" class="leader-avatar" />
          </div>

          <!-- 信息区 -->
          <div class="leader-body">
            <h2 class="leader-name">{{ shownName(l) }}</h2>
            <p class="leader-class">{{ l.class }}</p>
            <p class="leader-message">{{ l.message }}</p>

            <!-- 成就标签：比赛战绩（三种显示模式，会长 2026-09-23）在前，手写荣誉在后；均按类型分色 -->
            <div class="achievement-tags">
              <template v-if="honorView === 'detail'">
                <HonorPill
                  v-for="(d, i) in detailOf(l)"
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
                  v-for="(parts, i) in pillPartsOf(l)"
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
                v-for="a in l.achievements"
                :key="a.text"
                class="honor-tag"
                :class="`honor-tag--${a.type}`"
                :title="HONOR_TYPE_LABELS[a.type]"
                >{{ a.text }}</span
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
   协会负责人页
   ========================================================================== */
.leader-page {
  position: relative;
  overflow: clip;
  min-height: 100vh;
  margin-top: calc(-1 * var(--header-height));
  padding: calc(var(--header-height) + 40px) 0 var(--space-3xl);
  background:
    radial-gradient(
      ellipse 700px 500px at 75% 5%,
      rgba(26, 115, 232, 0.04) 0%,
      transparent 60%
    ),
    radial-gradient(
      ellipse 500px 400px at 15% 85%,
      rgba(255, 152, 0, 0.03) 0%,
      transparent 60%
    ),
    linear-gradient(175deg, #f8fafc 0%, #fff 35%, #fff 100%);
}
.leader-inner {
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
   只剩控件本身、不带说明文字（会长 2026-09-23）。 */
.page-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: var(--space-lg);
}

/* 明细模式每条前面的奖牌 emoji；奖牌文字本身不再着色（理由见 ExcellentView 同名规则）。 */
.medal-emoji {
  margin-right: var(--space-xs);
}

.hint {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-3xl) 0;
  font-size: var(--font-size-lg);
}
.skeleton-list {
  max-width: 700px;
  margin: 0 auto;
}

/* ── 双列等高行 ──
   负责人页刻意【不用】瀑布流（与优秀成员页相反）：这里只有 6 张卡、2 列，
   同一行的两张卡必须上下边对齐 —— 靠 grid 默认的 align-items: stretch 把矮卡
   拉到本行最高那张的高度，多出来的空白留在卡片底部（胶囊仍紧跟寄语，不贴底），
   所以本页不要引 useMasonry。口径见 README「两个页面的卡片排布」节。 */
.leader-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  align-items: stretch;
  gap: var(--space-xl);
}

/* ── 卡片 ── */
.leader-card {
  position: relative;
  display: flex;
  gap: var(--space-lg);
  padding: var(--space-xl) var(--space-lg);
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: var(--radius-xl);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
  transition:
    transform var(--transition-spring),
    box-shadow var(--transition),
    border-color var(--transition);
}
.leader-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 36px rgba(26, 115, 232, 0.08);
  border-color: rgba(26, 115, 232, 0.15);
}

/* ── 届数飘带 ── */
.session-ribbon {
  position: absolute;
  top: 0;
  right: var(--space-lg);
  transform: translateY(-50%);
  padding: 5px 20px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: #fff;
  background: var(--gradient-primary);
  box-shadow: 0 4px 12px rgba(26, 115, 232, 0.2);
  letter-spacing: 1px;
  white-space: nowrap;
}

/* ── 头像区 ── */
.leader-avatar-wrap {
  position: relative;
  flex-shrink: 0;
  width: 120px;
  height: 120px;
}
.avatar-ring {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: conic-gradient(
    var(--primary),
    var(--primary-light),
    var(--accent),
    var(--primary)
  );
  opacity: 0;
  transition: opacity var(--transition-slow);
  animation: ring-spin 4s linear infinite;
}
@keyframes ring-spin {
  to {
    transform: rotate(360deg);
  }
}
.leader-card:hover .avatar-ring {
  opacity: 0.3;
}
.leader-avatar {
  position: relative;
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transition:
    transform var(--transition-spring),
    box-shadow var(--transition);
  z-index: 1;
}
.leader-card:hover .leader-avatar {
  transform: scale(1.06);
  box-shadow: 0 6px 24px rgba(26, 115, 232, 0.15);
}

/* ── 信息区 ── */
.leader-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.leader-name {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}
.leader-class {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-sm);
  font-family: var(--font-mono);
}
.leader-message {
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--text-light);
  margin-bottom: var(--space-md);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── 成就标签 ──
   标签本身的几何与配色在 styles/honors.css（与优秀成员页共用）；这里只管排布，
   以及卡片 hover 时按各自类型的颜色加深。所以**不要**在这个文件里再写 .honor-tag
   的颜色：scoped 选择器的优先级高于 .honor-tag--xxx，写了会把六种颜色压成一种。 */
.achievement-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  /* 紧跟寄语（.leader-message 自带 margin-bottom: var(--space-md)），不顶到卡片底部
     —— 原因同优秀成员页 .honor-tags。 */
}
.leader-card:hover .honor-tag {
  background: var(--tag-bg-hover);
  border-color: var(--tag-border-hover);
}

/* ── 响应式 ── */
@media (max-width: 992px) {
  .leader-grid {
    grid-template-columns: 1fr;
    gap: var(--space-lg);
  }
  .leader-page {
    padding: calc(var(--header-height) + 30px) 0 var(--space-2xl);
  }
  .page-hero {
    margin-bottom: 48px;
  }
  .page-hero h1 {
    font-size: 2rem;
  }
}
@media (max-width: 576px) {
  .leader-card {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-lg) var(--space-md);
  }
  .leader-avatar-wrap {
    width: 100px;
    height: 100px;
  }
  .leader-avatar {
    width: 100px;
    height: 100px;
  }
  .avatar-ring {
    inset: -4px;
  }
  .page-hero h1 {
    font-size: 1.7rem;
  }
  .achievement-tags {
    justify-content: center;
  }
  .leader-message {
    -webkit-line-clamp: unset;
  }
}
</style>
