<script setup>
import { ref, computed } from "vue";
import { useTimeline } from "../composables/useTimeline";
import { useCompetitionEvents } from "../composables/useCompetitionEvents";

const { topEvents, yearGroups, loading } = useTimeline();
const { eventsByYear, loading: eventsLoading } = useCompetitionEvents();

const ready = computed(() => !loading.value && !eventsLoading.value);

// ── 搜索 ──
const searchQuery = ref("");

// ── 筛选：年份 + 月份 ──
const selectedYear = ref(null);   // null = 全部
const selectedMonth = ref(null);  // null = 该年全部月份

// 提取所有 (year, month) 组合（含比赛节点），按年分组
const yearMonthTree = computed(() => {
  const map = {};
  for (const g of yearGroups.value) {
    for (const item of g.items) {
      const y = item.date.getFullYear();
      const m = item.date.getMonth() + 1;
      if (!map[y]) map[y] = new Set();
      map[y].add(m);
    }
  }
  for (const g of eventsByYear.value) {
    for (const item of g.items) {
      if (!item.date) continue; // 无具体日期的比赛节点（如 2018 届）不参与月份筛选
      const y = item.date.getFullYear();
      const m = item.date.getMonth() + 1;
      if (!map[y]) map[y] = new Set();
      map[y].add(m);
    }
  }
  return Object.keys(map)
    .sort((a, b) => b - a)
    .map((y) => ({
      year: Number(y),
      months: [...map[y]].sort((a, b) => b - a),
    }));
});

function selectYear(y) {
  if (selectedYear.value === y) {
    selectedYear.value = null;
    selectedMonth.value = null;
  } else {
    selectedYear.value = y;
    selectedMonth.value = null;
  }
}

function selectMonth(m) {
  selectedMonth.value = selectedMonth.value === m ? null : m;
}

function resetAll() {
  searchQuery.value = "";
  selectedYear.value = null;
  selectedMonth.value = null;
}

// 某年的新闻条目 / 比赛节点（用于按年渲染）
function yearNews(year) {
  const g = filteredYearGroups.value.find((g) => Number(g.year) === year);
  return g ? g.items : [];
}
function yearEvents(year) {
  const g = filteredEventsByYear.value.find((g) => Number(g.year) === year);
  return g ? g.items : [];
}

// 合并某年的新闻与比赛节点，按日期倒序（无具体日期的比赛节点排在该年最后）
function yearItems(year) {
  const items = [
    ...yearNews(year).map((it) => ({ kind: "news", ...it })),
    ...yearEvents(year).map((ev) => ({ kind: "event", ...ev })),
  ];
  items.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date - a.date;
  });
  return items;
}

// 比赛节点/新闻 → 详情页地址（xcpc 比赛节点进入该场比赛的新闻页；无 cid 的赛事节点进入该届参赛详情页）
function itemTo(item) {
  if (item.kind === "event") {
    return item.cid
      ? `/contest-news/${item.cid}`
      : `/competition/${item.slug}/${item.year}`;
  }
  return `/action/${item.slug}`;
}

// 卡片右上角徽标：奖项汇总（🥇🥈🥉），仅获奖场次显示
// xcpc 走新闻页（cid）；蓝桥等走单届详情页（无 cid，按 slug 识别）
function itemBadge(item) {
  if (item.kind !== "event") return "";
  if (!item.cid && item.slug !== "lanqiao") return "";
  const s = item.summary || "";
  return /[🥇🥈🥉]/.test(s) ? s : "";
}

// 徽标按最高奖项着色：🥇金 > 🥈银 > 🥉铜
function badgeTone(item) {
  if (item.kind !== "event") return "";
  if (!item.cid && item.slug !== "lanqiao") return "";
  const s = item.summary || "";
  if (s.includes("🥇")) return "gold";
  if (s.includes("🥈")) return "silver";
  if (s.includes("🥉")) return "bronze";
  return "";
}

// 卡片正文：有梗文案优先，回退奖项汇总（其他赛事节点无 subtitle 时保持原样）
function itemTagline(item) {
  if (item.kind === "event" && item.subtitle) return item.subtitle;
  return item.summary || "";
}

// ── 卡片类别（左边框配色）：xcpc邀请赛 / IC区域赛·CC全国赛 / xcpc省赛 / 网络赛 / 天梯赛 / 蓝桥杯 / 传智杯 / 社团活动·讲座·集训 / 校赛 ──
// 类别 key → CSS 类后缀（tl-card--<key>），颜色在 <style> 中通过 --cat 变量定义
function itemClass(item) {
  const t = item.title || "";
  if (item.kind === "event") {
    // 按赛事系列判定（非 xcpc 系列直接归类）
    if (item.slug === "gplt") return "tts";
    if (item.slug === "lanqiao") return "lanqiao";
    if (item.slug === "chuanzhi") return "chuanzhi";
    if (item.slug === "baidu") return "baidu";
    // xcpc 系列按标题关键词判定（顺序敏感：邀请赛兼办省赛的标题归邀请赛）
    if (t.includes("网络预选赛")) return "net";
    if (t.includes("全国邀请赛")) return "inv";
    if (t.includes("亚洲区域赛") || t.includes("全国赛")) return "reg";
    if (t.includes("女生专场")) return "inv"; // CCPC女生专场：国家级 xcpc 赛事
    if (t.includes("总决赛")) return "reg";   // CCPC总决赛：全国性顶级赛事
    if (t.includes("省赛") || t.includes("区赛")) return "prov";
    return "other";
  }
  // 新闻节点（actions.json）
  if (t.includes("天梯赛")) return "tts";
  if (t.includes("蓝桥")) return "lanqiao";
  if (t.includes("传智")) return "chuanzhi";
  if (t.includes("百度之星")) return "baidu";
  if (t.includes("校赛") || t.includes("校内")) return "school";
  // 其余新闻（培训/讲座/集训/答疑等）归社团活动类
  return "club";
}

// ── 综合筛选 + 搜索 ──
const isFiltering = computed(() => selectedYear.value !== null || searchQuery.value.trim() !== "");

const filteredYearGroups = computed(() => {
  let groups = yearGroups.value;

  // 年份筛选
  if (selectedYear.value !== null) {
    groups = groups.filter((g) => Number(g.year) === selectedYear.value);
    if (selectedMonth.value !== null) {
      groups = groups.map((g) => ({
        ...g,
        items: g.items.filter(
          (it) => it.date.getMonth() + 1 === selectedMonth.value
        ),
      }));
    }
  }

  // 搜索
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    groups = groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.title.toLowerCase().includes(q) ||
            (it.summary || "").toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }

  return groups;
});

// 搜索结果也应用于置顶
const filteredTopEvents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return topEvents.value;
  return topEvents.value.filter(
    (it) =>
      it.title.toLowerCase().includes(q) ||
      (it.summary || "").toLowerCase().includes(q)
  );
});

// ── 比赛节点：按年份/月份/搜索过滤 ──
const filteredEventsByYear = computed(() => {
  return eventsByYear.value
    .filter((g) => selectedYear.value === null || Number(g.year) === selectedYear.value)
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (selectedMonth.value !== null && it.date && it.date.getMonth() + 1 !== selectedMonth.value) return false;
        const q = searchQuery.value.trim().toLowerCase();
        if (q && !it.name.toLowerCase().includes(q) && !(it.title || "").toLowerCase().includes(q) && !(it.summary || "").toLowerCase().includes(q)) return false;
        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);
});

// 过滤后仍有内容的年份（新闻 + 比赛节点）
const filteredYears = computed(() => {
  const years = new Set(filteredYearGroups.value.map((g) => Number(g.year)));
  for (const g of filteredEventsByYear.value) years.add(Number(g.year));
  return [...years].sort((a, b) => b - a);
});
</script>

<template>
  <main class="timeline-page container-fluid">
    <!-- 装饰光斑 -->
    <div
      class="decorative-orb decorative-orb--primary"
      style="width:600px;height:600px;top:-250px;right:-200px;opacity:0.06"
    ></div>
    <div
      class="decorative-orb decorative-orb--accent"
      style="width:400px;height:400px;bottom:10%;left:-150px;opacity:0.04"
    ></div>
    <div
      class="decorative-orb decorative-orb--light"
      style="width:350px;height:350px;top:40%;right:-120px;opacity:0.04"
    ></div>

    <!-- 标题区 -->
    <header class="page-hero">
      <p class="page-label">LATEST NEWS</p>
      <h1>协会<span class="highlight">大事记</span></h1>
      <p class="page-desc">在岁月的单行道上，拓下所有光影交错的印章。</p>
    </header>

    <div class="timeline-layout">
      <!-- 左侧：筛选 + 搜索 -->
      <aside class="tl-sidebar">
        <!-- 搜索框 -->
        <div class="sidebar-search">
          <i class="fas fa-search"></i>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索标题或摘要…"
            class="search-input"
          />
          <button
            v-if="searchQuery"
            class="search-clear"
            @click="searchQuery = ''"
            title="清除"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- 年份 / 月份导航 -->
        <nav class="sidebar-nav" v-if="!loading">
          <button
            class="sn-item sn-all"
            :class="{ active: selectedYear === null && !searchQuery }"
            @click="resetAll"
          >
            <span class="sn-bullet"></span>
            <span>全部</span>
          </button>

          <div
            v-for="entry in yearMonthTree"
            :key="entry.year"
            class="sn-group"
          >
            <button
              class="sn-item sn-year"
              :class="{ active: selectedYear === entry.year }"
              @click="selectYear(entry.year)"
            >
              <span class="sn-bullet"></span>
              <span class="sn-year-num">{{ entry.year }}</span>
            </button>

            <button
              v-for="m in entry.months"
              :key="m"
              v-show="selectedYear === entry.year"
              class="sn-item sn-month"
              :class="{ active: selectedMonth === m }"
              @click="selectMonth(m)"
            >
              <span class="sn-bullet"></span>
              <span>{{ m }}月</span>
            </button>
          </div>
        </nav>
      </aside>

      <!-- 右侧：内容 -->
      <div class="tl-content">
        <div v-if="!ready" class="skeleton-list">
          <div
            v-for="n in 4"
            :key="n"
            class="skeleton"
            style="height:120px;border-radius:var(--radius-lg);margin-bottom:var(--space-md)"
          ></div>
        </div>

        <template v-else>
          <!-- 置顶事件（不受年月筛选，但受搜索影响） -->
          <section v-if="filteredTopEvents.length" class="pinned-section">
            <h2 class="section-label">
              <i class="fa-solid fa-thumbtack"></i> 置顶
            </h2>
            <div class="pinned-grid">
              <RouterLink
                v-for="(top, i) in filteredTopEvents"
                :key="top.slug"
                v-reveal="'fade-up'"
                :style="{ '--reveal-index': i }"
                :to="`/action/${top.slug}`"
                class="pinned-card"
                :class="'tl-card--' + itemClass(top)"
              >
                <span class="pinned-mark"
                  ><i class="fa-solid fa-thumbtack"></i
                ></span>
                <span class="pinned-title">{{ top.title }}</span>
                <span class="pinned-arrow">→</span>
              </RouterLink>
            </div>
          </section>

          <!-- 无结果 -->
          <div
            v-if="isFiltering && !filteredYearGroups.length && !filteredTopEvents.length && !filteredEventsByYear.length"
            class="empty-state"
          >
            <i class="fas fa-inbox"></i>
            <p>没有找到匹配的事件</p>
            <button class="btn btn-secondary" @click="resetAll">清除筛选</button>
          </div>

          <!-- 时间轴 -->
          <section
            v-for="(year, gi) in filteredYears"
            :key="year"
            class="year-section"
          >
            <h2
              v-reveal="'fade-up'"
              :style="{ '--reveal-index': gi }"
              class="year-heading"
            >
              <span class="year-num">{{ year }}</span>
              <span class="year-count">{{ yearNews(year).length + yearEvents(year).length }} 件事</span>
            </h2>

            <!-- 时间轴（新闻 + 比赛节点，按日期倒序） -->
            <div v-if="yearItems(year).length" class="timeline">
              <RouterLink
                v-for="(item, idx) in yearItems(year)"
                :key="item.kind + '-' + (item.slug || item.title) + '-' + idx"
                :to="itemTo(item)"
                v-reveal="'fade-up'"
                :style="{ '--reveal-index': idx }"
                class="tl-item"
                :class="{ right: idx % 2 === 1 }"
              >
                <div class="tl-card" :class="'tl-card--' + itemClass(item)">
                  <span v-if="itemBadge(item)" class="tl-badge" :class="'tl-badge--' + badgeTone(item)">{{ itemBadge(item) }}</span>
                  <span class="tl-date">{{ item.dateStr }}</span>
                  <h3>{{ item.title }}</h3>
                  <p>{{ itemTagline(item) }}</p>
                </div>
                <div class="tl-dot"></div>
              </RouterLink>
            </div>
          </section>
        </template>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* ==========================================================================
   大事记页
   ========================================================================== */
.timeline-page {
  position: relative;
  overflow: clip;
  margin-top: calc(-1 * var(--header-height));
  padding: calc(var(--header-height) + 40px) 0 var(--space-3xl);
  background:
    radial-gradient(ellipse 700px 500px at 75% 5%, rgba(26,115,232,0.05) 0%, transparent 60%),
    radial-gradient(ellipse 500px 400px at 15% 85%, rgba(255,152,0,0.04) 0%, transparent 60%),
    linear-gradient(175deg, #f8fafc 0%, #fff 35%, #fff 100%);
}

/* ── 标题区 ── */
.page-hero {
  text-align: center;
  margin-bottom: 48px;
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
  background: rgba(26,115,232,0.12);
  border-radius: 2px;
  z-index: -1;
}
.page-desc {
  font-size: var(--font-size-base);
  color: var(--text-muted);
}

/* ==========================================================================
   双栏布局：左侧筛选 + 右侧内容
   ========================================================================== */
.timeline-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-2xl);
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--space-md);
  align-items: start;
}

/* ── 左侧栏（sticky 跟随滚动）── */
.tl-sidebar {
  position: sticky;
  top: calc(var(--header-height) + 20px);
  align-self: stretch;
  display: flex;
  flex-direction: column;
}

/* 搜索框 */
.sidebar-search {
  position: relative;
  margin-bottom: var(--space-lg);
}
.sidebar-search i.fa-search {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 0.85rem;
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 10px 36px 10px 38px;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: var(--radius-md);
  background: #fff;
  font-size: 0.85rem;
  color: var(--text);
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.search-input::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}
.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(26,115,232,0.08);
}
.search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 4px;
  border-radius: 50%;
  transition: color var(--transition-fast);
}
.search-clear:hover {
  color: var(--text);
}

/* ── 年份 / 月份导航（左侧竖轴）── */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
  padding-left: 16px;
}
/* 竖轴线 */
.sidebar-nav::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 12px;
  bottom: 12px;
  width: 2px;
  background: linear-gradient(
    180deg,
    rgba(26,115,232,0.4) 0%,
    rgba(26,115,232,0.1) 100%
  );
  border-radius: 1px;
}
.sn-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.84rem;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition:
    color var(--transition-fast),
    background var(--transition-fast);
  text-align: left;
  width: 100%;
}
.sn-item:hover {
  color: var(--text);
  background: rgba(0,0,0,0.02);
}
.sn-item.active {
  color: var(--primary);
  font-weight: 600;
  background: rgba(26,115,232,0.05);
}
/* 圆点 */
.sn-bullet {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid rgba(0,0,0,0.2);
  z-index: 1;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    box-shadow var(--transition-fast);
}
.sn-item.active .sn-bullet {
  border-color: var(--primary);
  background: var(--primary);
  box-shadow: 0 0 0 6px rgba(26,115,232,0.08);
}
.sn-all .sn-bullet {
  width: 10px;
  height: 10px;
  border-width: 2.5px;
}
.sn-year {
  font-weight: 600;
}
.sn-year .sn-year-num {
  font-family: var(--font-mono);
  font-size: 0.88rem;
}
.sn-month {
  padding-left: 36px;
  font-size: 0.78rem;
}

/* ── 右侧内容 ── */
.tl-content {
  min-width: 0;
}

.skeleton-list {
  max-width: 700px;
  margin: 0 auto;
}

.empty-state {
  text-align: center;
  padding: var(--space-3xl) var(--space-xl);
  color: var(--text-muted);
}
.empty-state i {
  font-size: 2.5rem;
  margin-bottom: var(--space-md);
  display: block;
  opacity: 0.3;
}
.empty-state p {
  margin-bottom: var(--space-lg);
}

/* ── 小节标签 ── */
.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.section-label i {
  color: var(--primary);
}

/* ── 置顶 ── */
.pinned-section {
  margin-bottom: var(--space-2xl);
}
.pinned-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-md);
}
.pinned-card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: #fff;
  border: 1px solid rgba(0,0,0,0.06);
  border-left: 4px solid var(--cat, #b0bec5);
  border-radius: var(--radius-lg);
  color: var(--text);
  text-decoration: none;
  transition:
    transform var(--transition-spring),
    box-shadow var(--transition),
    border-color var(--transition);
}
.pinned-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(26,115,232,0.08);
  border-color: rgba(26,115,232,0.18);
  border-left-color: var(--cat, #b0bec5); /* hover 时保留类别左边框色 */
  color: var(--text);
}
.pinned-mark {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.85rem;
}
.pinned-title {
  flex: 1;
  font-weight: 600;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pinned-arrow {
  color: var(--text-muted);
  transition:
    transform var(--transition-fast),
    color var(--transition-fast);
}
.pinned-card:hover .pinned-arrow {
  transform: translateX(4px);
  color: var(--primary);
}

/* ── 年份标题 ── */
.year-section {
  margin-bottom: var(--space-xl);
}
.year-heading {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.year-num {
  font-family: var(--font-mono);
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--primary);
  line-height: 1;
}
.year-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  background: var(--bg-light);
  padding: 2px 12px;
  border-radius: var(--radius-full);
}

/* ── 时间轴：交错布局 ── */
.timeline {
  position: relative;
  padding: 0 0 var(--space-lg);
}
.timeline::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(
    180deg,
    rgba(26,115,232,0.3) 0%,
    rgba(26,115,232,0.1) 50%,
    rgba(26,115,232,0.05) 100%
  );
  border-radius: 1px;
  transform: translateX(-50%);
}

.tl-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  margin-bottom: var(--space-xl);
  color: var(--text);
  text-decoration: none;
}
.tl-item:last-child {
  margin-bottom: 0;
}

.tl-card {
  position: relative;
  width: calc(50% - 50px);
  padding: var(--space-lg);
  background: #fff;
  border: 1px solid rgba(0,0,0,0.05);
  border-left: 4px solid var(--cat, #b0bec5);
  border-radius: var(--radius-lg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
  transition:
    transform var(--transition-spring),
    box-shadow var(--transition),
    border-color var(--transition);
}
.tl-item:hover .tl-card {
  transform: translateY(-3px);
  box-shadow: 0 10px 32px rgba(26,115,232,0.07);
  border-color: rgba(26,115,232,0.15);
  border-left-color: var(--cat, #b0bec5); /* hover 时保留类别左边框色 */
}
/* ── 卡片类别左边框配色（--cat 变量）──
   inv=ICPC/CCPC全国邀请赛  reg=ICPC亚洲区域赛/CCPC全国赛  prov=xcpc省赛(含区赛)
   net=网络预选赛  tts=天梯赛  lanqiao=蓝桥杯  chuanzhi=传智杯
   baidu=百度之星  club=社团活动/讲座/集训  school=校赛  other=其他 */
.tl-card--inv { --cat: #1e88e5; }
.tl-card--reg { --cat: #7c4dff; }
.tl-card--prov { --cat: #43a047; }
.tl-card--net { --cat: #00acc1; }
.tl-card--tts { --cat: #f9a825; }
.tl-card--lanqiao { --cat: #3949ab; }
.tl-card--chuanzhi { --cat: #ff7043; }
.tl-card--baidu { --cat: #e53935; }
.tl-card--club { --cat: #78909c; }
.tl-card--school { --cat: #d81b60; }
.tl-card--other { --cat: #b0bec5; }
/* 奖项汇总徽标（右上角；背景色与最高奖项相同） */
.tl-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  border: 1px solid;
  font-size: 0.78rem;
  letter-spacing: 0.5px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.tl-badge--gold {
  background: linear-gradient(135deg, #fff3d6, #ffe3a1);
  border-color: rgba(212, 167, 44, 0.45);
  color: #8a6d1a;
}
.tl-badge--silver {
  background: linear-gradient(135deg, #f3f3f4, #dcddde);
  border-color: rgba(150, 152, 156, 0.5);
  color: #6d6f73;
}
.tl-badge--bronze {
  background: linear-gradient(135deg, #fbe9dc, #f0cdb0);
  border-color: rgba(205, 127, 50, 0.45);
  color: #9c5a1e;
}
.tl-card h3 {
  padding-right: 96px; /* 给右上角徽标留位 */
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
  transition: color var(--transition-fast);
}
.tl-date {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: 6px;
}
.tl-item:hover .tl-card h3 {
  color: var(--primary);
}
.tl-card p {
  font-size: var(--font-size-sm);
  color: var(--text-light);
  line-height: 1.6;
  white-space: pre-line; /* 说明文本中的换行（国赛/省赛分行） */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tl-dot {
  position: absolute;
  left: 50%;
  top: 28px;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid var(--primary);
  z-index: 1;
  transition:
    transform var(--transition-spring),
    box-shadow var(--transition),
    background var(--transition);
}
.tl-item:hover .tl-dot {
  transform: translate(-50%, -50%) scale(1.6);
  background: var(--primary);
  box-shadow: 0 0 0 10px rgba(26,115,232,0.1);
}

.tl-item:not(.right) {
  justify-content: flex-start;
}
.tl-item:not(.right) .tl-card {
  margin-right: auto;
}
.tl-item.right {
  justify-content: flex-end;
}

/* ── 响应式 ── */
@media (max-width: 992px) {
  .timeline-layout {
    grid-template-columns: 1fr;
    gap: var(--space-xl);
  }
  .tl-sidebar {
    position: static;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .sidebar-nav {
    flex-direction: row;
    flex-wrap: wrap;
    padding-left: 0;
    gap: var(--space-xs);
  }
  .sidebar-nav::before {
    display: none;
  }
  .sn-item {
    padding: 6px 12px;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: var(--radius-full);
    font-size: 0.78rem;
    width: auto;
  }
  .sn-item.active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
  }
  .sn-bullet {
    display: none;
  }
  .sn-month {
    padding-left: 12px;
  }
}
@media (max-width: 768px) {
  .timeline-page {
    padding: calc(var(--header-height) + 30px) 0 var(--space-2xl);
  }
  .page-hero {
    margin-bottom: 36px;
  }
  .page-hero h1 {
    font-size: 2rem;
  }
  .pinned-grid {
    grid-template-columns: 1fr;
  }
  .timeline::before {
    left: 24px;
  }
  .tl-item,
  .tl-item.right {
    justify-content: flex-start;
    padding-left: 52px;
  }
  .tl-card {
    width: 100%;
  }
  .tl-dot {
    left: 24px;
  }
  .year-num {
    font-size: 1.4rem;
  }
}
@media (max-width: 576px) {
  .page-hero h1 {
    font-size: 1.7rem;
  }
  .tl-card {
    padding: var(--space-md);
  }
}
</style>
