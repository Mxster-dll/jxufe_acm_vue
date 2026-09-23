<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { navLinks } from '../data/navigation'

const scrolled = ref(false)
const menuOpen = ref(false)

const onScroll = () => {
  scrolled.value = window.scrollY > 80
}
const onDocumentClick = (e) => {
  const headerEl = document.querySelector('header')
  if (headerEl && !headerEl.contains(e.target)) menuOpen.value = false
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('click', onDocumentClick)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <header :class="{ scrolled, 'menu-open': menuOpen }">
    <div class="container bar">
      <RouterLink to="/" class="logo" @click="menuOpen = false">
        <div class="logo-mark">
          <img src="/images/logo.png" alt="协会logo" />
        </div>
        <div class="logo-text">
          <span class="logo-title">程序设计竞赛协会</span>
          <span class="logo-sub">江西财经大学</span>
        </div>
      </RouterLink>

      <!-- 首页把「成员墙」入口传送进这里（HomeView 的 <Teleport to="#header-hint">）。
           空槽铺满 .bar、自身 pointer-events: none，只作定位包含块。
           它在导航栏里的位置由 HomeView 实测邻居后钳制（--hint-left）：
           有空间时落在导航栏中线上，被 logo / 导航按钮夹住时退开，绝不重叠。
           （会长 2026-09-23 第 2 条要的正是这个让位行为。） -->
      <div id="header-hint" class="header-hint"></div>

      <nav>
        <ul>
          <li v-for="link in navLinks" :key="link.to">
            <RouterLink :to="link.to" @click="menuOpen = false">{{ link.label }}</RouterLink>
          </li>
        </ul>
      </nav>

      <button
        class="menu-toggle"
        :aria-expanded="menuOpen"
        @click.stop="menuOpen = !menuOpen"
        aria-label="菜单"
      >
        <svg class="hamburger-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <rect x="15" y="28" width="70" height="4" rx="2" fill="currentColor" />
          <rect x="15" y="48" width="70" height="4" rx="2" fill="currentColor" />
          <rect x="15" y="68" width="70" height="4" rx="2" fill="currentColor" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
header {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: var(--z-header);
  background: transparent;
  border-bottom: 1px solid transparent;
  transition:
    background var(--transition-smooth),
    box-shadow var(--transition-smooth),
    border-color var(--transition-smooth),
    backdrop-filter var(--transition-smooth);
}
header.scrolled {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 1px 24px rgba(0, 0, 0, 0.06);
  border-bottom-color: rgba(0, 0, 0, 0.05);
}

.bar {
  position: relative; /* #header-hint 锚点要拿它当定位包含块 */
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-md);
  height: 80px;
}

/* 传送锚点：铺满整条 bar 但不吃指针、不占位（绝对定位，不进 flex 流），
   只作定位包含块。里面那个按钮的位置由 HomeView 实测邻居后写入 --hint-left。 */
.header-hint {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* ---- Logo ---- */
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.logo-mark {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform var(--transition);
}
.logo:hover .logo-mark img {
  transform: scale(1.06);
}
.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.logo-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.5px;
}
.logo-sub {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

/* ---- 导航 ---- */
nav ul {
  display: flex;
  gap: 2px;
}
nav a {
  position: relative;
  display: block;
  padding: 8px 18px;
  border-radius: var(--radius-full);
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.3px;
  transition: color var(--transition-fast), background var(--transition-fast);
}
nav a:hover {
  color: var(--primary);
}
nav a.router-link-active {
  color: var(--primary);
  font-weight: 600;
  background: transparent;
}
/* 底部蓝色下划线 */
nav a.router-link-active::after {
  content: '';
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 2px;
  height: 2.5px;
  border-radius: 2px;
  background: var(--primary);
}

/* ---- 汉堡按钮 ---- */
.menu-toggle {
  display: none;
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 10px;
  border-radius: var(--radius-full);
  cursor: pointer;
  color: var(--text);
  transition: background var(--transition-fast), color var(--transition-fast);
}
.menu-toggle:hover {
  background: rgba(0,0,0,0.05);
  color: var(--primary);
}
.hamburger-icon {
  width: 22px;
  height: 22px;
  transition: transform var(--transition);
}
header.menu-open .hamburger-icon {
  transform: rotate(90deg);
}

/* ≤992px：启用汉堡菜单 */
@media (max-width: 992px) {
  .logo-title { font-size: 0.9rem; }
  .logo-sub { font-size: 0.65rem; }
  .logo-mark { width: 36px; height: 36px; }
  .menu-toggle { display: block; }
  nav ul {
    position: fixed;
    inset: 0;
    height: 100vh;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    gap: 4px;
    padding: 100px 20px 40px;
    background: rgba(255,255,255,0.97);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
    transition: transform var(--transition-smooth), opacity var(--transition-smooth);
  }
  header.menu-open nav ul {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  nav a {
    padding: 14px 24px;
    font-size: 1.15rem;
    font-weight: 600;
    border-radius: var(--radius-full);
    width: 100%;
    max-width: 280px;
    text-align: center;
  }
  nav a.router-link-active {
    color: var(--primary);
    background: transparent;
  }
  nav a.router-link-active::after {
    left: 50%;
    right: auto;
    width: 40px;
    transform: translateX(-50%);
    bottom: 6px;
  }
}

@media (max-width: 576px) {
  .logo-title { font-size: 0.8rem; }
  .logo-sub { font-size: 0.6rem; }
  .logo-mark { width: 32px; height: 32px; }
  .logo-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .bar { padding: 0 var(--space-sm); }
  nav a { font-size: 1.05rem; padding: 12px 20px; }
}
</style>

<!--
  这一段**必须是非 scoped**：它要选 <html> 上的状态类，而 scoped 会给选择器加数据属性。
  踩过的坑：在 scoped 块里写 `:global(html.is-mask-out) header`，本项目的 Vue 会把后半截
  选择器丢掉，transform 直接落到 <html> 上 —— 结果是整页被推下去 105vh，连 position: fixed
  的墙都因为「祖先被 transform」而改以 <html> 为包含块（高度当场变成文档高度）。
  所以这里老老实实写全局规则，并用 #app > header 提高优先级压过上面那条 scoped 的 transition。
  状态由 src/views/HomeView.vue 写在 <html> 上：
  --mask-shift（拖动位移）/ --mask-ms（过渡时长）/ is-mask-out / is-mask-returning。
-->
<style>
/* 会长 2026-09-23 裁定：首页把遮罩拉下去时，导航栏也要**一起**下移。
   导航栏在 App.vue、属于遮罩之外（最早的口径就是「除了墙和导航栏」），靠不了 DOM 嵌套，
   所以状态走 <html> 传过来。 */
#app > header {
  transform: translate3d(0, var(--mask-shift, 0px), 0);
  transition:
    transform var(--mask-ms, 0ms) cubic-bezier(0.22, 1, 0.36, 1),
    background var(--transition-smooth),
    box-shadow var(--transition-smooth),
    border-color var(--transition-smooth),
    backdrop-filter var(--transition-smooth);
}
/* 拉过一屏的 10%：遮罩整层滑出，导航栏同步滑出（位移量与 .page-mask.is-out 一致） */
html.is-mask-out #app > header {
  transform: translate3d(0, 105vh, 0);
}
/* 首页那枚「成员墙」入口收起后必须**真的**不接收指针。
   光靠 HomeView 里 scoped 的 `.wall-hint.is-hidden` 不够：它是 (0,3,0)，
   而 HeroAvatarWall.vue:997 的全局规则
     `body.hero-wall-present #app > header a, body.hero-wall-present #app > header button`
   带 id，是 (1,1,3)，会把 pointer-events 压回 auto（实测 opacity 已 0、pe 仍 auto，
   于是留了个看不见却可点的坑）。这里用 (1,2,1) 压回来 —— 不改成 visibility: hidden，
   是因为那会让 200ms 的淡出失效（visibility 不做平滑过渡）。 */
#app > header .wall-hint.is-hidden,
#app > header .wall-hint:not(.is-ready) {
  pointer-events: none;
}
</style>
