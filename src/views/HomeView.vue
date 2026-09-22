<script setup>
import { ref, onMounted, onUnmounted, watchEffect, nextTick } from "vue";
import { useNews } from "../composables/useNews";
import AppFooter from "../components/AppFooter.vue";
/* 头像墙：独立叠加层。删掉这一行 import、下面那个 ref、模板里那一个标签、
   .hero-inner 上的 :class，以及 <style> 末尾那段 .is-wall-on 规则，即完全回滚。
   它自己不读也不改轮播/文案的任何状态，只由 wallOn 决定谁在前面。 */
import HeroAvatarWall from "../components/HeroAvatarWall.vue";

// ── 头像墙开关（纯叠加：false 时页面与改动前逐像素一致）──
const wallOn = ref(false);

// ── 露墙（2026-09-23 会长裁定：**遮罩 = 除了墙和导航栏的整个页面**）──
//   墙铺在遮罩下面、自己不动；遮罩就是首页的全部内容 —— 首页不渲染 App.vue 那份
//   `<AppFooter v-if="route.name !== 'home'">`，而 HomeView 自己那份页脚在 #news 里，
//   所以「整个页面」这个边界是天然干净的（导航栏在 App.vue，也在遮罩之外）。
//   正常滚动：遮罩跟着页面上下走 —— 往下滚就是遮罩上移，于是看到 #about 的
//   「以代码为桥梁 / 连接技术与未来」。
//   露墙的两套驱动（会长 2026-09-23 分派）：
//     · 桌面（滚轮）—— **取消阈值**：在页首轻轻往上一动就整层收起，不必再拉过 10%。
//     · 移动端（触摸）—— **保留一屏的 10%**：拖动时遮罩跟手，松手时不足 10% 回弹、
//       够了才触发（见 onWallTouchEnd）。
//   往下滚一下就把遮罩请回来；点导航栏那枚「成员墙」也是直接收起。
const MASK_REVEAL_RATIO = 0.1; // 只给触摸用（桌面已取消阈值）
// 触摸能拉多远：一直到遮罩整层移出视口为止（与 CSS `.page-mask.is-out` 的 105vh 一致）。
// 10% 只决定「松手后触不触发」，**不限制手指能拉多远** —— 拉过 10% 照旧跟手。
const MASK_MAX_RATIO = 1.05;
// 触摸拖动的阻尼：免得手指挪一点点就把遮罩拉到底
const MASK_DRAG_DAMP = 0.5;
// 回程动画时长，与 CSS 里 .page-mask.is-returning 的 transition 保持一致
const MASK_RETURN_MS = 520;
const maskShift = ref(0);
const maskOut = ref(false);
const maskReturning = ref(false);
let maskLimit = 0;
let maskMax = 0;
let maskReturnTimer = 0;
let touchY = 0;
// 本次手势里已经「请回」过一次：剩下的位移一并吃掉，
// 否则遮罩刚回来，同一段上划会顺手把页面滚下去（实测停在 scrollY 90）。
let touchRecall = false;

const resetMaskLimit = () => {
  maskLimit = Math.max(80, window.innerHeight * MASK_REVEAL_RATIO);
  maskMax = window.innerHeight * MASK_MAX_RATIO;
};

/** 回程动画：归零之前先挂上 is-returning（CSS 那份 transition），到点再摘掉 */
const startMaskReturn = () => {
  maskReturning.value = true;
  window.clearTimeout(maskReturnTimer);
  maskReturnTimer = window.setTimeout(() => {
    maskReturning.value = false;
  }, MASK_RETURN_MS);
};

/** 累积拖动位移（dy < 0 = 往下拉、露出上面的墙）。返回是否吃掉了这次滚动。
    这里**只累积、不触发** —— 什么时候算「拉够了」由调用方定：
    桌面滚轮当场触发（onWallWheel），触摸等松手判定（onWallTouchEnd）。 */
const dragMask = (dy) => {
  // 手指/滚轮重新接管：立刻结束回程动画，保证跟手
  maskReturning.value = false;
  if (window.scrollY > 0) {
    // 不在页首：这是正常翻页，遮罩不参与
    if (maskShift.value) maskShift.value = 0;
    return false;
  }
  if (dy < 0) {
    // 夹的是「整层移出视口」那个位置，不是 10% 阈值 —— 阈值只管松手判定
    maskShift.value = Math.min(maskShift.value - dy, maskMax);
    return true;
  }
  if (maskShift.value > 0) {
    maskShift.value = Math.max(0, maskShift.value - dy);
    return true;
  }
  return false;
};

/** 已经收起：只认「往下滚」 —— 先把遮罩请回来，这一次滚动不落到页面上 */
const recallMask = (dy) => {
  if (dy <= 0) return false;
  // 收起是 640ms 缓动，直接归零会「啪」地跳回一屏，所以回程也走一段缓动
  startMaskReturn();
  maskOut.value = false;
  maskShift.value = 0;
  // 遮罩被 translate 出去时会把文档撑高（实测 scrollHeight 2641 → 3279），
  // 若这期间有人拖滚动条 / 按空格把文档滚下去了，请回来就会错位 —— 这里拉回页首。
  // 必须 behavior: 'instant'，理由见 revealWall 的注释。
  if (window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  return true;
};

/** 收起遮罩，露出整面成员墙。三条路都汇到这里：
    点导航栏那枚「成员墙」/ 桌面滚轮在页首往上动一下 / 移动端拖过一屏的 10% 松手。
    先把文档拉回页首：遮罩是靠 translate 让开的，若此刻页面已经滚到下面，
    光位移一屏它仍留在视口里，露不出墙。
    必须显式 behavior: 'instant' —— base.css:21 有 scroll-behavior: smooth，
    默认的 scrollTo(0,0) 会走成异步平滑滚动，而紧接着遮罩位移会改变文档高度，
    那次动画会被打断、页面停在原地（实测停在 scrollY 358）。 */
const revealWall = () => {
  if (window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  maskReturning.value = false;
  maskShift.value = maskLimit;
  maskOut.value = true;
};

// ── 导航栏里那枚「成员墙」的横向位置（会长 2026-09-23 第 2 条）──
//   目标：有空间时落在导航栏的中线上；宽度变小、被 logo / 导航按钮夹住时**退开**，
//   而不是像纯绝对定位那样叠在按钮上面（会长原话：「宽度较小时被导航栏按钮挤离中心」）。
//   为什么不用纯 CSS：等权托板（两侧 flex: 1）只保证「两侧间距相等」，
//   而 logo 比导航窄得多（实测 206 vs 569px），结果会被顶到中线左侧 182px，不叫居中；
//   要用绝对定位精确居中，就必须实测邻居再把中线夹住 —— 那只能靠 JS。
const HINT_NEIGHBOR_GAP = 12; // 与 logo / 导航至少留出的呼吸位
const hintEl = ref(null);
const hintLeft = ref(null); // null → CSS 回落到 50%
// 会长 2026-09-23：往下滚动了（scrollY > 0）就把这枚入口收起来 ——
// 它是「请上去看墙」的邀请，人已经往反方向（往下）走了，就不该再占着导航栏。
// 回到页首自动回来；阈值就是 0，没有任何缓冲量。
const hintHidden = ref(false);
let hintRo = null;

const onWallHintScroll = () => {
  const next = window.scrollY > 0;
  if (next !== hintHidden.value) hintHidden.value = next;
};

const measureHint = () => {
  const btn = hintEl.value;
  const bar = btn?.closest(".bar");
  if (!btn || !bar) return;
  const br = bar.getBoundingClientRect();
  const hw = btn.getBoundingClientRect().width;
  if (!hw || !br.width) return;
  // logo / nav 在小屏会被 display: none 掉，那种情况下 rect 全是 0，要靠 width 过滤
  const box = (sel) => {
    const el = bar.querySelector(sel);
    const r = el ? el.getBoundingClientRect() : null;
    return r && r.width > 0 ? r : null;
  };
  const logo = box(".logo");
  const nav = box("nav");

  const want = br.left + br.width / 2; // 理想位置：整条导航栏的中线
  let lo = br.left + hw / 2; // 不越出导航栏
  let hi = br.right - hw / 2;
  if (logo) lo = Math.max(lo, logo.right + HINT_NEIGHBOR_GAP + hw / 2); // 不压 logo
  if (nav) hi = Math.min(hi, nav.left - HINT_NEIGHBOR_GAP - hw / 2); // 不压导航

  // lo > hi 说明两侧真的挤没了（比如极窄屏），取中点，至少保持对称
  const center = lo > hi ? (lo + hi) / 2 : Math.min(Math.max(want, lo), hi);
  const next = Math.round(center - br.left) + "px";
  if (next !== hintLeft.value) hintLeft.value = next;
};

/** 滚轮 = 桌面。会长 2026-09-23：取消 10% 阈值 —— 在页首轻轻往上一动就整层收起。
    （以前要先累积到一屏的 10%，现在第一下就算数。） */
const onWallWheel = (e) => {
  const dy = e.deltaY * MASK_DRAG_DAMP;
  if (maskOut.value) {
    if (recallMask(dy)) e.preventDefault();
    return;
  }
  if (dy < 0 && window.scrollY === 0) {
    revealWall();
    e.preventDefault();
    return;
  }
  // 其余情况：正常翻页；若触摸留下的位移还没归零，顺手收掉
  if (dragMask(dy)) e.preventDefault();
};

/** 触摸 = 移动端。会长 2026-09-23：这里**保留一屏的 10%**，但改成「拖动 → 松手判定」——
    拖动时遮罩跟手，松手不足 10% 回弹，够了才触发。 */
const onWallTouchStart = (e) => {
  touchY = e.touches[0]?.clientY ?? 0;
  touchRecall = false;
};
const onWallTouchMove = (e) => {
  const y = e.touches[0]?.clientY ?? 0;
  // 手指往下拖（y 增大）→ 遮罩下移，故取 touchY - y，与滚轮同一个符号约定
  const dy = (touchY - y) * MASK_DRAG_DAMP;
  touchY = y;
  if (touchRecall) {
    // 本次手势已经请回过，余下的位移吃掉（见 touchRecall 的注释）
    if (e.cancelable) e.preventDefault();
    return;
  }
  if (maskOut.value) {
    if (recallMask(dy)) {
      touchRecall = true;
      if (e.cancelable) e.preventDefault();
    }
    return;
  }
  if (dragMask(dy) && e.cancelable) e.preventDefault();
};
const onWallTouchEnd = () => {
  if (maskOut.value || maskShift.value <= 0) return;
  if (maskShift.value >= maskLimit) {
    maskOut.value = true; // 拉过一屏的 10%：触发（.is-out 自带 640ms 缓动）
  } else {
    startMaskReturn(); // 不足 10%：回弹
    maskShift.value = 0;
  }
};

onMounted(() => {
  resetMaskLimit();
  window.addEventListener("wheel", onWallWheel, { passive: false });
  window.addEventListener("touchstart", onWallTouchStart, { passive: true });
  window.addEventListener("touchmove", onWallTouchMove, { passive: false });
  window.addEventListener("touchend", onWallTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onWallTouchEnd, { passive: true });
  window.addEventListener("resize", resetMaskLimit, { passive: true });
  window.addEventListener("scroll", onWallHintScroll, { passive: true });
  onWallHintScroll(); // 进来时可能就带着 scrollY（刷新后恢复滚动位置）
  // 「成员墙」入口的让位测量：等 Teleport 把节点挂上去之后再测
  nextTick(() => {
    measureHint();
    const bar = hintEl.value?.closest(".bar");
    if (bar) {
      hintRo = new ResizeObserver(measureHint);
      hintRo.observe(bar);
      bar.querySelectorAll(".logo, nav").forEach((el) => hintRo.observe(el));
    }
    // 字体加载完文字宽度会变，补测一次
    if (document.fonts?.ready) document.fonts.ready.then(measureHint).catch(() => {});
  });
});

// 导航栏在 App.vue 里、属于遮罩之外（会长最早的口径就是「除了墙和导航栏」），
// 但会长 2026-09-23 补了一条：遮罩被拉下去时导航栏也要**一起**下移。
// 它没法靠 DOM 嵌套跟着走，于是把状态写到 <html> 上，由 AppHeader.vue 的样式消费。
watchEffect(() => {
  const root = document.documentElement;
  root.style.setProperty("--mask-shift", `${maskShift.value}px`);
  // 导航栏的位移过渡时长：拖动中必须为 0（否则每一帧都在追赶），滑出/回程各给一段缓动。
  // 用变量传过去，AppHeader 那边就不用把 transition 清单抄成三份。
  root.style.setProperty(
    "--mask-ms",
    maskOut.value ? "640ms" : maskReturning.value ? "520ms" : "0ms"
  );
  root.classList.toggle("is-mask-out", maskOut.value);
  root.classList.toggle("is-mask-returning", maskReturning.value);
});

onUnmounted(() => {
  window.removeEventListener("wheel", onWallWheel);
  window.removeEventListener("touchstart", onWallTouchStart);
  window.removeEventListener("touchmove", onWallTouchMove);
  window.removeEventListener("touchend", onWallTouchEnd);
  window.removeEventListener("touchcancel", onWallTouchEnd);
  window.removeEventListener("resize", resetMaskLimit);
  window.removeEventListener("scroll", onWallHintScroll);
  window.clearTimeout(maskReturnTimer);
  hintRo?.disconnect();
  hintRo = null;
  // watchEffect 会随组件销毁，但它写在 <html> 上的东西得自己擦掉
  const root = document.documentElement;
  root.style.removeProperty("--mask-shift");
  root.classList.remove("is-mask-out", "is-mask-returning");
});

// ── 轮播图 ──
const slides = Array.from({ length: 10 }, (_, i) => ({
  src: `/images/slider/slider${i + 1}.jpg`,
  alt: `程序设计竞赛奖项${i + 1}`,
}));

const current = ref(0);
let timer = null;
const next = () => (current.value = (current.value + 1) % slides.length);
const pick = (i) => {
  current.value = i;
  restart();
};
const restart = () => {
  clearInterval(timer);
  timer = setInterval(next, 4000);
};
onMounted(restart);
onUnmounted(() => {
  clearInterval(timer);
});

// ── 鼠标视差 + 聚光灯 ──
const heroEl = ref(null);
const mx = ref(0); // 0..1 鼠标在 hero 中的相对位置
const my = ref(0);
const mouseX = ref(0); // 像素坐标
const mouseY = ref(0);

const onMouseMove = (e) => {
  if (!heroEl.value) return;
  const rect = heroEl.value.getBoundingClientRect();
  mx.value = (e.clientX - rect.left) / rect.width;
  my.value = (e.clientY - rect.top) / rect.height;
  mouseX.value = e.clientX;
  mouseY.value = e.clientY;
  // 浮动形状排斥
  updateShapeRepel(e.clientX, e.clientY);
  // 磁吸按钮
  updateBtnMagnet(e.clientX, e.clientY);
};
const onMouseLeave = () => {
  mx.value = 0.5;
  my.value = 0.5;
};

// ── 浮动形状（带排斥） ──
const floatingShapes = ref([]);
const initShapes = () => {
  const shapes = [];
  for (let i = 0; i < 8; i++) {
    shapes.push({
      id: i,
      baseX: 5 + Math.random() * 90, // % 基准位置
      baseY: 5 + Math.random() * 90,
      size: 12 + Math.random() * 28,
      speed: 3 + Math.random() * 5,
      offsetX: 0,
      offsetY: 0,
      opacity: 0.12 + Math.random() * 0.2,
    });
  }
  floatingShapes.value = shapes;
};
const updateShapeRepel = (cx, cy) => {
  if (!heroEl.value) return;
  const rect = heroEl.value.getBoundingClientRect();
  floatingShapes.value.forEach((s) => {
    const sx = rect.left + (s.baseX / 100) * rect.width;
    const sy = rect.top + (s.baseY / 100) * rect.height;
    const dx = cx - sx;
    const dy = cy - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const repelRadius = 180;
    if (dist < repelRadius && dist > 1) {
      const force = (1 - dist / repelRadius) * 80;
      s.offsetX = (-dx / dist) * force;
      s.offsetY = (-dy / dist) * force;
    } else {
      s.offsetX *= 0.85;
      s.offsetY *= 0.85;
    }
  });
};

// ── 磁吸按钮 ──
const heroBtn = ref(null);
const btnMagnetX = ref(0);
const btnMagnetY = ref(0);
const updateBtnMagnet = (cx, cy) => {
  if (!heroBtn.value) return;
  const rect = heroBtn.value.getBoundingClientRect();
  const bx = rect.left + rect.width / 2;
  const by = rect.top + rect.height / 2;
  const dx = cx - bx;
  const dy = cy - by;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const magnetRadius = 250;
  if (dist < magnetRadius && dist > 1) {
    const force = (1 - dist / magnetRadius) * 18;
    btnMagnetX.value = (dx / dist) * force;
    btnMagnetY.value = (dy / dist) * force;
  } else {
    btnMagnetX.value *= 0.8;
    btnMagnetY.value *= 0.8;
  }
};

onMounted(() => {
  mx.value = 0.5;
  my.value = 0.5;
  initShapes();
});

// ── 滚动吸附（延迟 + 非线性缓动）──
let snapTimer = null;
let isSnapping = false;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateScrollTo(targetY, duration = 700) {
  const html = document.documentElement;
  html.style.scrollBehavior = "auto";
  isSnapping = true;

  const startY = window.scrollY;
  const distance = targetY - startY;
  if (Math.abs(distance) < 5) {
    html.style.scrollBehavior = "";
    isSnapping = false;
    return;
  }

  const startTime = performance.now();

  function step(currentTime) {
    if (!isSnapping) return;
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      html.style.scrollBehavior = "";
      isSnapping = false;
    }
  }

  requestAnimationFrame(step);
}

function findNearestSection() {
  const currentY = window.scrollY;
  const els = document.querySelectorAll("section[id]");
  let closest = null;
  let closestDist = Infinity;
  els.forEach((el) => {
    const dist = Math.abs(currentY - el.offsetTop);
    if (dist < closestDist) {
      closestDist = dist;
      closest = el;
    }
  });
  return { section: closest, distance: closestDist };
}

function scheduleSnap() {
  clearTimeout(snapTimer);
  if (isSnapping) return;
  snapTimer = setTimeout(() => {
    const { section, distance } = findNearestSection();
    if (section && distance > 50) {
      animateScrollTo(section.offsetTop, 700);
    }
  }, 800);
}

function onScrollSnap() {
  if (isSnapping) {
    // 用户手动滚动了，取消吸附动画
    isSnapping = false;
    document.documentElement.style.scrollBehavior = "";
    return;
  }
  scheduleSnap();
}

onMounted(() => {
  window.addEventListener("scroll", onScrollSnap, { passive: true });
  window.addEventListener("scrollend", scheduleSnap, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScrollSnap);
  window.removeEventListener("scrollend", scheduleSnap);
  clearTimeout(snapTimer);
  isSnapping = false;
  document.documentElement.style.scrollBehavior = "";
});

// ── 我们参与的赛事 logo ──
// ICPC 与 CCPC 合并为一张卡（与竞赛详情页 xCPC 合并页同构：两块上下堆叠，各自 logo+名称）
const contestLogos = [
  {
    slug: "xcpc",
    blocks: [
      { src: "/images/contest/icpc.png", name: "ICPC程序设计竞赛" },
      { src: "/images/contest/ccpc_logo.png", name: "CCPC程序设计竞赛" },
    ],
  },
  { slug: "gplt", src: "/images/contest/gplt.png", label: "天梯赛" },
  { slug: "baidu", src: "/images/contest/astar_logo.png", label: "百度之星" },
  { slug: "chuanzhi", src: "/images/contest/czb.png", label: "传智杯" },
  { slug: "lanqiao", src: "/images/contest/lqb.png", label: "蓝桥杯" },
];

const features = [
  {
    icon: "fa-trophy",
    title: "竞赛培训",
    desc: "提供系统的算法培训，包括基础数据结构、动态规划、图论等，帮助成员在各类竞赛中取得优异成绩。",
  },
  {
    icon: "fa-users",
    title: "团队协作",
    desc: "组织校内模拟赛和团队训练，培养默契配合和高效解题能力，提升团队协作精神。",
  },
  {
    icon: "fa-laptop-code",
    title: "技术交流",
    desc: "定期举办技术分享会，拓展成员的技术视野。",
  },
];

// ── 横滚代码背景 ──
const codeSyms = "{}[]();:<>+-*/%=&|!?.,";
const codeKeys =
  "import export const let var function return async await class extends if else for while do switch case break continue try catch throw new this super typeof instanceof void delete in of then catch";
const codeNums = "0 1 2 3 4 5 6 7 8 9";
const codeMix =
  "if(x>0){} for(;;){} while(i--){} return data.map(x=>x*2); await fetch(url); const [a,b]=arr; {...spread} typeof x === 'number' ? 1 : 0;";

function randCode(len) {
  const pool = codeSyms + " " + codeKeys + " " + codeNums;
  let s = "";
  for (let i = 0; i < len; i++) {
    s += pool[Math.floor(Math.random() * pool.length)];
    if (Math.random() < 0.08) s += "  ";
  }
  return s;
}

const codeRows = Array.from({ length: 12 }, (_, i) => {
  const isKeyword = i % 3 === 0;
  const isMixed = i % 3 === 1;
  let text;
  if (isKeyword) {
    // 关键词行：重复拼贴关键词
    const keys = codeKeys.split(" ");
    text = Array.from(
      { length: 18 },
      () => keys[Math.floor(Math.random() * keys.length)],
    ).join("  ");
  } else if (isMixed) {
    // 混合代码片段行
    text = Array.from({ length: 10 }, () => {
      const frags = codeMix.split(" ");
      return frags[Math.floor(Math.random() * frags.length)];
    }).join("  ");
  } else {
    // 随机符号 + 数字行
    text = randCode(80 + Math.floor(Math.random() * 70));
  }
  return {
    id: i,
    text,
    duration: 28 + Math.random() * 50,
    delay: -(Math.random() * 30),
    dir: i % 2 === 0 ? 1 : -1,
    size: isKeyword ? "15px" : isMixed ? "12px" : "11px",
    weight: isKeyword ? 700 : 400,
    opacity: isKeyword ? 0.1 : isMixed ? 0.07 : 0.05,
  };
});

const { newsList, loading, error } = useNews();

</script>

<template>
  <!-- ── 墙：整页固定底纹 ──
       它不在遮罩里，而是铺在遮罩**下面**；导航栏在 App.vue，天然也在遮罩之外。
       形状与首页原来那份 hero_wall.json 完全一致（manifest + tiles），
       所以组件一行没改，只多传几个 prop。清单与文案由 scripts/gen_group_wall.mjs 生成，
       人数：QQ 群 110 + 优秀成员 33 + 负责人 6，按真名去重后 138 人。 -->
  <div class="page-wall">
    <HeroAvatarWall
      v-model:active="wallOn"
      manifest-url="/data/group_wall.manifest.json"
      copy-url="/data/group_wall.json"
      thumbs-base="/images/group_wall_thumbs"
      label="协会成员墙"
      :dim-opacity="1"
    />
  </div>

  <!-- ── 「成员墙」入口：会长 2026-09-23 要求搬进导航栏，且点一下就直接收起遮罩 ──
       Teleport 到 AppHeader 里的 #header-hint 锚点 —— DOM 上它成了导航栏的孩子，
       但状态与逻辑仍留在本页（遮罩归 HomeView 管），不必为它引一个全局 store。
       横向位置由 measureHint() 实测后写进 --hint-left（见脚本里的说明）：
       有空间时落在导航栏中线上，被 logo / 导航按钮夹住时退开 —— 就是会长说的
       「宽度小时被导航栏按钮挤离中心」。 -->
  <Teleport to="#header-hint">
    <button
      ref="hintEl"
      type="button"
      class="wall-hint"
      :class="{ 'is-hidden': hintHidden }"
      :style="{ '--hint-left': hintLeft }"
      aria-label="露出成员墙"
      @click="revealWall"
    >
      <i class="fas fa-chevron-up" aria-hidden="true"></i>
      <span class="wall-hint__label">成员墙</span>
    </button>
  </Teleport>

  <!-- ── 遮罩 = 除了墙和导航栏的整个页面 ──
       正常滚动时它跟着页面上下走：往下滚就是遮罩上移，于是看到 #about 的
       「以代码为桥梁 / 连接技术与未来」；在页首继续往上滚则是遮罩下移，
       把上面的墙露出来（桌面滚轮一动即触发；移动端要拉过一屏的 10% 再松手）。
       往回收也一样：滚一下就把遮罩请回来。（首页不渲染页脚，见 App.vue 的 v-if） -->
  <div
    class="page-mask"
    :class="{ 'is-out': maskOut, 'is-returning': maskReturning }"
    :style="{ '--mask-shift': maskShift + 'px' }"
  >
  <!-- 英雄区 -->
  <section
    id="home"
    ref="heroEl"
    class="hero container-fluid"
    :class="{ 'is-wall-on': wallOn }"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  >
    <!-- 横滚代码背景 -->
    <div class="code-scroll-bg" aria-hidden="true">
      <div
        v-for="row in codeRows"
        :key="row.id"
        class="code-scroll-row"
        :class="{ 'scroll-reverse': row.dir === -1 }"
        :style="{
          '--d': row.duration + 's',
          '--delay': row.delay + 's',
          fontSize: row.size,
          fontWeight: row.weight,
          opacity: row.opacity,
        }"
      >
        <span class="code-scroll-text">{{ row.text }}</span>
        <span class="code-scroll-text">{{ row.text }}</span>
        <span class="code-scroll-text">{{ row.text }}</span>
      </div>
    </div>

    <!-- 浮动形状（排斥鼠标） -->
    <div class="float-shapes" aria-hidden="true">
      <span
        v-for="s in floatingShapes"
        :key="s.id"
        class="float-shape"
        :style="{
          left: s.baseX + '%',
          top: s.baseY + '%',
          width: s.size + 'px',
          height: s.size + 'px',
          opacity: s.opacity,
          transform: `translate(${s.offsetX}px, ${s.offsetY}px)`,
        }"
      ></span>
    </div>

    <!-- 底部白渐变遮罩 -->
    <div class="hero-fade-bottom"></div>

    <!-- 浮动粒子 -->
    <div class="hero-particles" aria-hidden="true">
      <span
        v-for="n in 12"
        :key="n"
        class="particle"
        :style="{
          '--x': `${Math.random() * 100}%`,
          '--d': `${8 + Math.random() * 16}s`,
          '--s': `${2 + Math.random() * 4}px`,
          '--o': `${0.08 + Math.random() * 0.18}`,
        }"
      ></span>
    </div>

    <div
      class="container hero-inner"
      :class="{ 'is-wall-on': wallOn }"
      :style="{
        '--mx': mx,
        '--my': my,
      }"
    >
      <div class="hero-content">
        <h2>写码码，拿奖奖<br />加分分，领钱钱</h2>
        <p>❀ 欢迎各位新同学来到江西财经大学 ❀</p>
        <div class="hero-buttons">
          <a
            ref="heroBtn"
            href="#about"
            class="btn btn-secondary hero-btn-magnet"
            :style="{
              transform: `translate(${btnMagnetX}px, ${btnMagnetY}px)`,
            }"
            >了解更多</a
          >
        </div>
      </div>

      <div class="hero-image">
        <div
          class="hero-image-container"
          :style="{
            '--mx': mx,
            '--my': my,
          }"
        >
          <div class="slideshow">
            <div
              v-for="(slide, i) in slides"
              :key="i"
              class="slide"
              :class="{ active: i === current }"
            >
              <img :src="slide.src" :alt="slide.alt" class="hero-image-main" />
            </div>
          </div>
          <div class="dots">
            <span
              v-for="(slide, i) in slides"
              :key="i"
              class="dot"
              :class="{ active: i === current }"
              @click="pick(i)"
            ></span>
          </div>

          <div class="floating-code fc-1">
            for(int i=0; i&lt;n; i++) {<br />
            &nbsp;&nbsp;solve(problems[i]);<br />
            }
          </div>
          <div class="floating-code fc-2">
            if(teamwork) {<br />
            &nbsp;&nbsp;return success;<br />
            }
          </div>
          <div class="floating-code fc-3">
            while (happyCoding) {<br />
            &nbsp;&nbsp;happy_Every_day();<br />
            }
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Hero → About 过渡桥 -->
  <div class="section-bridge" aria-hidden="true">
    <span
      class="decorative-orb decorative-orb--primary"
      style="width: 600px; height: 600px; top: -320px; left: 5%; opacity: 0.1"
    ></span>
    <span
      class="decorative-orb decorative-orb--accent"
      style="width: 400px; height: 400px; top: -220px; right: 8%; opacity: 0.07"
    ></span>
    <span
      class="decorative-orb decorative-orb--light"
      style="width: 300px; height: 300px; top: -180px; left: 40%; opacity: 0.06"
    ></span>
  </div>

  <!-- 宗旨 -->
  <section id="about" class="about container-fluid">
    <!-- 承接 Hero 的装饰光斑 -->
    <div
      class="decorative-orb decorative-orb--primary about-orb--top-left"
    ></div>

    <div class="container about-inner">
      <!-- 左侧：赛事 Logo 展示 -->
      <div v-reveal="'slide-left'" class="about-visual">
        <div class="contest-grid">
          <RouterLink
            v-for="logo in contestLogos"
            :key="logo.slug"
            :to="`/competition/${logo.slug}`"
            class="contest-card"
            :class="{ 'contest-card--xcpc': logo.blocks }"
          >
            <!-- xCPC 合并卡：与竞赛信息页 grid 的大卡同构 —— 横跨两列，ICPC/CCPC 左右两半 -->
            <template v-if="logo.blocks">
              <div class="contest-card-subs">
                <div
                  v-for="b in logo.blocks"
                  :key="b.src"
                  class="contest-card-sub"
                >
                  <div class="contest-card-sub-img">
                    <img :src="b.src" :alt="b.name" />
                  </div>
                  <span class="contest-card-label">{{ b.name }}</span>
                </div>
              </div>
            </template>
            <!-- 普通赛事卡：logo + 名称 -->
            <template v-else>
              <div class="contest-card-img">
                <img :src="logo.src" :alt="logo.label" />
              </div>
              <span class="contest-card-label">{{ logo.label }}</span>
            </template>
          </RouterLink>
        </div>
      </div>

      <!-- 右侧：宗旨 + 特色 -->
      <div v-reveal="'fade-up'" class="about-content">
        <p class="about-label">ABOUT US</p>
        <h2 class="about-heading">
          以代码为<span class="highlight">桥梁</span><br />连接技术与未来
        </h2>
        <p class="about-desc">
          程序设计竞赛协会旨在激励大家运用计算机编程技术和技能来解决实际问题，激发兴趣，培养团队合作意识和创新能力和挑战精神。
        </p>

        <div class="features">
          <div v-for="(f, i) in features" :key="f.title" class="feature">
            <span class="feature-num">{{
              String(i + 1).padStart(2, "0")
            }}</span>
            <div class="feature-body">
              <h3>{{ f.title }}</h3>
              <p>{{ f.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <a href="#news" class="scroll-down-arrow"
      ><i class="fas fa-chevron-down"></i
    ></a>
  </section>

  <!-- About → News 过渡桥 -->
  <div class="section-bridge" aria-hidden="true">
    <span
      class="decorative-orb decorative-orb--primary"
      style="width: 550px; height: 550px; top: -300px; right: 5%; opacity: 0.09"
    ></span>
    <span
      class="decorative-orb decorative-orb--light"
      style="width: 400px; height: 400px; top: -220px; left: 8%; opacity: 0.07"
    ></span>
    <span
      class="decorative-orb decorative-orb--accent"
      style="width: 280px; height: 280px; top: -160px; left: 45%; opacity: 0.05"
    ></span>
  </div>

  <!-- 最新动态 -->
  <section id="news" class="news container-fluid">
    <div class="container news-inner">
      <!-- 第一行：标题 -->
      <div class="news-topbar">
        <div class="news-header">
          <p class="news-label">LATEST NEWS</p>
          <h2 class="news-heading">
            协会<span class="highlight">大事记</span>
          </h2>
        </div>
      </div>

      <div v-if="loading" class="news-grid">
        <div
          v-for="n in 4"
          :key="n"
          class="skeleton"
          style="height: 100px; border-radius: var(--radius-lg)"
        ></div>
      </div>
      <p v-else-if="error" class="hint">加载新闻失败</p>

      <!-- 第二行：新闻 Grid（最近5条 + 跳转大事记） -->
      <div v-else class="news-grid">
        <article
          v-for="(item, i) in newsList"
          :key="item.id"
          v-reveal="'fade-up'"
          :style="{ '--reveal-index': i }"
          class="news-card"
        >
          <div class="nc-badge">
            <span class="nc-badge-day">{{ item.day }}</span>
            <span class="nc-badge-mon">{{ item.month }}</span>
          </div>
          <div class="nc-body">
            <time class="nc-time">{{
              item.date.getFullYear() + "年 / " + item.month + " / " + item.day + "日"
            }}</time>
            <h3 class="nc-title">{{ item.title }}</h3>
            <p class="nc-summary">{{ item.summary }}</p>
          </div>
          <RouterLink :to="`/post/${item.id}`" class="nc-link"
            >阅读更多 <i class="fas fa-arrow-right"></i
          ></RouterLink>
        </article>

        <!-- 跳转大事记卡片 -->
        <RouterLink
          to="/all-action"
          v-reveal="'fade-up'"
          :style="{ '--reveal-index': newsList.length }"
          class="news-card news-card--more"
        >
          <div class="nc-badge nc-badge--more">
            <span class="nc-badge-day nc-badge-day--outline">+</span>
          </div>
          <div class="nc-body">
            <h3 class="nc-title">查看完整大事记</h3>
            <p class="nc-summary">浏览协会历年全部活动与获奖记录</p>
          </div>
          <span class="nc-link">前往大事记 <i class="fas fa-arrow-right"></i></span>
        </RouterLink>
      </div>
    </div>
    <AppFooter />
  </section>
  </div>
  <!-- /.page-mask（到此为止 = 除了墙和导航栏的整个页面） -->
</template>

<style scoped>
/* ==========================================================================
   英雄区 —— 浅色主题
   ========================================================================== */
.hero {
  position: relative;
  overflow: clip;
  min-height: 100vh;
  display: flex;
  align-items: center;
  margin-top: calc(-1 * var(--header-height));
  padding: calc(var(--header-height) + 120px) 0 var(--space-2xl);
  color: var(--text);
  background:
    radial-gradient(
      ellipse 800px 500px at 20% 70%,
      rgba(26, 115, 232, 0.06) 0%,
      transparent 55%
    ),
    radial-gradient(
      ellipse 500px 400px at 80% 20%,
      rgba(79, 195, 247, 0.05) 0%,
      transparent 55%
    ),
    /* 底部过渡：向 About 区渐变 */
    radial-gradient(
        ellipse 1000px 400px at 50% 100%,
        rgba(26, 115, 232, 0.06) 0%,
        transparent 60%
      ),
    /* 底部过渡：向 About 区渐变。
       这层原本是**不透明**的（#f8fafc → #fff）：墙搬到遮罩下面之后会被它盖死，
       于是改成半透明 —— 浏览时墙照旧只是淡淡一层底纹（≈12% 透出来），
       而遮罩整体让开时，让出来的位置没有这层东西，墙就是全亮的。 */
    linear-gradient(
      175deg,
      rgba(248, 250, 252, 0.86) 0%,
      rgba(255, 255, 255, 0.9) 40%,
      rgba(255, 255, 255, 0.92) 100%
    );
  background-size: 100% 100%;
  cursor: default;
}

/* ── 横滚代码背景 ── */
.code-scroll-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}
.code-scroll-row {
  white-space: nowrap;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  line-height: 2.2;
  color: var(--primary);
  animation: code-scroll-x var(--d, 50s) linear infinite;
  animation-delay: var(--delay, 0s);
}
.code-scroll-row.scroll-reverse {
  animation-name: code-scroll-x-rev;
}
.code-scroll-text {
  display: inline-block;
  padding-right: 60px;
}
@keyframes code-scroll-x {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-33.333%);
  }
}
@keyframes code-scroll-x-rev {
  0% {
    transform: translateX(-33.333%);
  }
  100% {
    transform: translateX(0);
  }
}

/* ── 浮动形状（排斥鼠标）── */
.float-shapes {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.float-shape {
  position: absolute;
  border-radius: 50%;
  border: 1.5px solid rgba(26, 115, 232, 0.15);
  background: rgba(26, 115, 232, 0.04);
  backdrop-filter: blur(2px);
  transition: none;
}

/* ── 底部白渐变（浅色背景无需此遮罩）── */
.hero-fade-bottom {
  display: none;
}

/* ── 磁吸按钮 ── */
.hero-btn-magnet {
  transition: transform 0.15s ease-out;
}

/* 浮动粒子 */
.hero-particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}
.particle {
  position: absolute;
  left: var(--x);
  bottom: -10px;
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: rgba(26, 115, 232, var(--o));
  animation: particle-rise var(--d) linear infinite;
  animation-delay: calc(var(--d) * -0.5);
}
@keyframes particle-rise {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 0.6;
  }
  100% {
    transform: translateY(-110vh) scale(0.3);
    opacity: 0;
  }
}

.hero-inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
  align-items: center;
}

/* ── 头像墙打开时，原有文案与轮播「退场」 ──
   刻意用 opacity 而不是 display: none：
   内容仍然占位 → hero 的高度不变 → 墙的盒子、瓷砖几何、环面周期全都不跳。
   （≤768px 时 .hero 是 min-height: auto，高度由内容撑 —— 用 display: none 会当场塌陷。）
   文案与轮播的脚本一行未动，setInterval 照常在跑，只是被盖住了。 */
.hero-inner {
  transition:
    opacity 480ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 480ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s; /* 返回时立即恢复可见，不等淡入 */
}

/* ── 让悬停穿过 hero 内容，落到背后的头像墙上 ──
   .hero-inner 是 z-index: 1，压在墙（z-index: 0）上面。默认它会**吃掉**指针事件，
   于是只有 hero 上下两条没被盖住的墙能收到悬停，正中那一片（也就是鼠标最常待的地方）
   反而没反应。把这一层放开，指针就能落到墙的瓷砖上。
   代价（都很小，且都是刻意的）：
     · hero 里的文字不能再框选 —— 纯装饰性标题；
     · 轮播图 hover 的蓝色光晕（只有 box-shadow）不再触发 —— 图片本身仍跟着鼠标做 3D 倾斜，
       那个用的是 --mx/--my，由 hero 的 mousemove 驱动，不受影响。
   真正需要点击的两处单独放行：轮播圆点、以及「了解更多」。
   ⚠ 放行要限定在 `:not(.is-wall-on)`：激活态那一档内容已经 visibility: hidden 退场了，
     若仍然接收指针，看不见的轮播会把墙正中的点击整片吃掉（实测点不出卡片）。 */
.hero-inner {
  pointer-events: none;
}
/* 项目原本给当前帧单独放开了指针（`.slide { none }` + `.slide.active { auto }`，
   本意是让堆叠在下面的其它帧不挡住当前帧）。但当前帧那张图**本身没有任何点击行为**，
   留着它只会把墙正中的悬停整片吃掉 —— 实测手机上轮播那一条占 hero 的 35%。
   收回来不影响任何交互（其它帧本来就已经是 none）。 */
.hero-inner:not(.is-wall-on) .slide.active {
  pointer-events: none;
}
.hero-inner:not(.is-wall-on) .hero-buttons,
.hero-inner:not(.is-wall-on) .dots {
  pointer-events: auto;
}

.hero-inner.is-wall-on {
  opacity: 0;
  /* visibility: hidden 而不是 display: none ——
     前者**保留布局占位**（hero 高度不变，墙的几何不会跳），同时彻底退出命中测试与绘制。
     只靠 opacity: 0 + pointer-events: none 是不够的：实测轮播那张 3D 变换的图
     仍会被 Chrome 当作命中目标（整条链的 pointer-events 都已是 none，它照样挡住墙正中的点击）。
     退场时把 visibility 延后到淡出结束再切，返回时立即恢复（见下面两条 transition）。 */
  visibility: hidden;
  transform: translateY(-14px) scale(0.985);
  pointer-events: none; /* 双保险 */
  transition:
    opacity 480ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 480ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s linear 480ms;
}

/* 墙打开时，把几层装饰底纹也一并让出去。
   它们（横滚代码 / 浮动形状 / 粒子）比墙更晚出现在 DOM 里、同为 z-index: 0，
   于是绘制顺序上压在墙上面 —— 原本是给「干净的浅色 hero」填空用的，
   压在人像墙上只会让画面发脏。 */
.hero.is-wall-on .code-scroll-bg,
.hero.is-wall-on .float-shapes,
.hero.is-wall-on .hero-particles {
  opacity: 0;
  transition: opacity 480ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── 露墙：**遮罩 = 除了墙和导航栏的整个页面** ──
   层序：墙（.page-wall 固定层，z-index: 0）→ 遮罩（.page-mask，1）→ 导航栏（在 App.vue，天然在外）。
   遮罩铺在墙上面，所以首页照旧把墙当底纹用（hero 那层背景是半透明的）；
   而它一旦让开，让出来的位置就是墙本身 —— 这就是「露出墙」。
   位移由 HomeView 的滚轮 / 触摸处理器写进 --mask-shift：
   未到阈值时严格跟手（故这一档不能有 transition，否则每一帧都在追赶），
   过了阈值再加缓动整体滑出一屏。 */
.page-wall {
  position: fixed;
  inset: 0;
  z-index: 0;
}
/* 会长 2026-09-23：不要那个「协会成员墙」开关按钮。
   组件自带它（.wall-toggle，文案由 label / labelActive 两个 prop 给），但首页露墙已经
   是「上滚把遮罩拉下去」这套手势了，角上再挂个按钮既重复又抢视线 —— 这里藏掉，
   不动组件本身（组件是上游的，我们的改动越少越好在 PR 里对齐）。 */
.page-wall :deep(.wall-toggle) {
  display: none;
}
.page-mask {
  position: relative;
  z-index: 1;
  transform: translate3d(0, var(--mask-shift, 0px), 0);
  transition: none;
  will-change: transform;
}
/* 拉过一屏的 10%：整层滑出页面，只剩墙；往回滚一下就把遮罩请回来 */
.page-mask.is-out {
  transform: translate3d(0, 105vh, 0);
  transition: transform 640ms cubic-bezier(0.22, 1, 0.36, 1);
}
/* 请回来的回程：滑出是 640ms 缓动，回程若直接归零就会「啪」地跳回一屏。
   时长与 JS 里的 MASK_RETURN_MS 一致；用户重新滚动时 JS 会立刻摘掉这个类，保证跟手。 */
.page-mask.is-returning {
  transition: transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* ── 「成员墙」入口：点一下直接把遮罩收起来，露出整面成员墙 ──
   位置：Teleport 进导航栏的 #header-hint 锚点（DOM 上属于 AppHeader，逻辑与状态仍留在本页）。
   锚点铺满 .bar，所以下面的 50% 就是整条导航栏的中线；横向位置再由 JS 实测邻居后
   写进 --hint-left 覆盖（见本文件 measureHint）：有空间时中线居中，
   被 logo / 导航按钮夹住时退开 —— 会长 2026-09-23 第 2 条要的就是这个让位行为。
   结构：箭头在上、字样在下，共用一条中轴；箭头是卡片外的独立元素、24px。
   竖排尺寸账：24 + gap 4 + 卡片 44 = 72px，导航栏 80px，上下各余 4px。
   卡片样式照搬我们删掉的那枚 .wall-toggle（HeroAvatarWall.vue:849-895）：
   白底 + 主色 24% 发丝边 + 全圆角 + 0 6px 20px 投影 + 主色 semibold 文字；
   连「hover 抬 2px、active 缩到 0.97」也一并照搬。 */
.wall-hint {
  /* 竖排尺寸账：箭头 24 + gap 4 + 卡片 44 = 72px，导航栏 80px。
     会长 2026-09-23：整块居中会让箭头偏上（箭头中心落在 y=16），改为让**箭头**居中 ——
     top 减去半个箭头高度，箭头中心就落在导航栏中线上；代价是卡片底边伸出导航栏下沿
     （y≈102 > 80，页头是透明的，会悬在下面）。调位置只改这一个 top 即可。 */
  --hint-arrow: var(--font-size-2xl); /* 24px */
  position: absolute;
  top: calc(50% - var(--hint-arrow) / 2);
  left: var(--hint-left, 50%);
  transform: translateX(-50%);
  display: inline-flex;
  flex-direction: column; /* 箭头在上、字样在下 */
  align-items: center; /* 两者共用一条中轴 */
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  pointer-events: auto; /* 锚点整层不吃指针，这里收回来 */
  transition:
    left 200ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
/* 往下滚了（scrollY > 0）：整枚入口往上退场 —— 邀请的是「往上」，就别赖在下面 */
.wall-hint.is-hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-10px);
}
.wall-hint:hover {
  transform: translateX(-50%) translateY(-2px);
}
.wall-hint:active {
  transform: translateX(-50%) scale(0.97);
}
.wall-hint:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
  border-radius: var(--radius-full);
}
.wall-hint i {
  font-size: var(--hint-arrow); /* 24px：放大到一眼能认出是「往上」 */
  line-height: 1;
  color: var(--primary);
  animation: wall-hint-bob 1.8s ease-in-out infinite;
}
/* 卡片本体：与 .wall-toggle 同款（那枚按钮已按会长要求从首页撤掉，这里接上它的观感） */
.wall-hint__label {
  display: inline-flex;
  align-items: center;
  min-height: 44px; /* 与 .wall-toggle 同档的触控高度 */
  padding: 0 var(--space-md);
  border: 1px solid rgba(26, 115, 232, 0.24);
  border-radius: var(--radius-full);
  background: #fff;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
  color: var(--primary);
  font-size: 0.9375rem; /* 15px，与 .wall-toggle 一致 */
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}
@keyframes wall-hint-bob {
  0%,
  100% {
    transform: translateY(4px);
  }
  50% {
    transform: translateY(-4px);
  }
}
.hero-content {
  text-align: left;
  padding-left: 6%;
  /* 视差：文字轻微反向移动 */
  transform: translate(
    calc((var(--mx, 0.5) - 0.5) * -30px),
    calc((var(--my, 0.5) - 0.5) * -20px)
  );
  transition: transform 0.3s ease-out;
}
.hero h2 {
  font-family:
    "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif;
  font-weight: 900;
  font-size: clamp(2.2rem, 3.5vw + 0.6rem, 4.2rem);
  margin-bottom: var(--space-lg);
  line-height: 1.5;
  letter-spacing: clamp(1px, 0.3vw, 4px);
  /* <br> 仍换行，但单行内不再因字过大而折行 */
  white-space: nowrap;
  color: var(--primary-dark);
  animation: fadeInUp 0.7s ease-out;
}
.hero p {
  font-size: var(--font-size-xl);
  margin-bottom: var(--space-lg);
  color: var(--text-light);
  animation: fadeInUp 0.7s ease-out 0.12s both;
}
.hero-buttons {
  margin-top: var(--space-lg);
  animation: fadeInUp 0.7s ease-out 0.24s both;
}
.hero .btn-secondary {
  color: var(--primary);
  border-color: var(--primary);
  background: transparent;
  border-radius: var(--radius-full);
  padding: 14px 36px;
  font-size: var(--font-size-lg);
  backdrop-filter: blur(4px);
  transition:
    background var(--transition),
    border-color var(--transition),
    transform var(--transition),
    box-shadow var(--transition);
}
.hero .btn-secondary:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(26, 115, 232, 0.25);
}

/* 轮播 */
.hero-image {
  display: flex;
  justify-content: center;
  animation: fadeIn 1s ease-out;
}
.hero-image-container {
  position: relative;
  width: 100%;
  max-width: 700px;
  /* 视差：图片同向移动 */
  transform: translate(
    calc((var(--mx, 0.5) - 0.5) * 20px),
    calc((var(--my, 0.5) - 0.5) * 14px)
  );
  transition: transform 0.3s ease-out;
}
.slideshow {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: var(--radius-xl);
}
.hero-image-main {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-xl);
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.06);
  /* 3D 倾斜跟随鼠标 */
  transform: perspective(1200px) rotateY(calc((var(--mx, 0.5) - 0.5) * -12deg))
    rotateX(calc((var(--my, 0.5) - 0.5) * 8deg));
  transition:
    transform 0.3s ease-out,
    box-shadow var(--transition);
}
.hero-image-container:hover .hero-image-main {
  box-shadow:
    0 20px 60px rgba(26, 115, 232, 0.15),
    0 4px 12px rgba(0, 0, 0, 0.08);
}
.slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.5s ease;
}
.slide.active {
  position: relative;
  opacity: 1;
  pointer-events: auto;
}
.dots {
  text-align: center;
  margin-top: var(--space-md);
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin: 0 5px;
  border-radius: var(--radius-full);
  background: rgba(26, 115, 232, 0.2);
  cursor: pointer;
  transition:
    background var(--transition),
    transform var(--transition);
}
.dot.active {
  background: var(--primary);
  transform: scale(1.4);
}
.dot:hover {
  background: rgba(26, 115, 232, 0.5);
}

.floating-code {
  position: absolute;
  z-index: 2;
  max-width: 300px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--primary);
  box-shadow: var(--shadow-md);
  font-family: "Consolas", "Monaco", monospace;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--primary-dark);
  pointer-events: none;
}
.fc-1 {
  top: -25px;
  right: 18%;
  animation: float 4s ease-in-out infinite;
}
.fc-2 {
  bottom: 12%;
  left: -35px;
  animation: float 5s ease-in-out infinite 1s;
}
.fc-3 {
  top: 40%;
  right: -25px;
  animation: float 6s ease-in-out infinite 2s;
}

/* ==========================================================================
   宗旨区
   ========================================================================== */
.about {
  position: relative;
  overflow: visible;
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: var(--section-padding);
  background:
    /* 顶部过渡：承接 Hero */
    radial-gradient(
      ellipse 1000px 350px at 50% 0%,
      rgba(26, 115, 232, 0.06) 0%,
      transparent 60%
    ),
    /* 底部过渡：衔接 News */
    radial-gradient(
        ellipse 800px 300px at 50% 100%,
        rgba(79, 195, 247, 0.05) 0%,
        transparent 60%
      ),
    #fff;
}

/* 装饰光斑 */
.about-orb--top-left {
  width: 500px;
  height: 500px;
  top: -120px;
  left: -180px;
  opacity: 0.07;
}

/* ── 两栏布局 ── */
.about-inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
}

/* ── 左侧：赛事 Logo 展示 ── */
.about-visual {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.about-visual-title {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 3px;
  color: var(--text-muted);
  margin-bottom: var(--space-xl);
  font-weight: 600;
  align-self: flex-end;
}
.contest-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
}
.contest-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 20px;
  background: #fff;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  transition:
    transform var(--transition-spring),
    box-shadow var(--transition),
    border-color var(--transition);
  text-decoration: none;
}
.contest-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 36px rgba(26, 115, 232, 0.12);
  border-color: rgba(26, 115, 232, 0.25);
}
.contest-card-img {
  width: 150px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.contest-card-img img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
/* ICPC/CCPC 合并卡：与竞赛信息页 grid 大卡同构 —— 横跨两列，左右两半各一块 */
.contest-card--xcpc {
  grid-column: span 2;
}
.contest-card--xcpc .contest-card-subs {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  width: 100%;
  flex: 1;
}
.contest-card--xcpc .contest-card-sub {
  flex: 1 1 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.contest-card--xcpc .contest-card-sub-img {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 64px;
}
.contest-card--xcpc .contest-card-sub-img img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.contest-card-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  transition: color var(--transition);
}
.contest-card:hover .contest-card-label {
  color: var(--primary);
}

/* ── 右侧：文字 + 特色 ── */
.about-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 3px;
  color: var(--primary);
  font-weight: 700;
  margin-bottom: var(--space-sm);
}
.about-heading {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--text);
  margin-bottom: var(--space-md);
}
.about-heading .highlight {
  color: var(--primary);
  position: relative;
}
.about-heading .highlight::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 2px;
  width: 100%;
  height: 7px;
  background: rgba(26, 115, 232, 0.12);
  border-radius: 2px;
  z-index: -1;
}
.about-desc {
  font-size: 0.95rem;
  color: var(--text-light);
  line-height: 1.75;
  max-width: 46ch;
  margin-bottom: var(--space-lg);
}

/* ── 特色列表 ── */
.features {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.feature {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  transition: border-color var(--transition);
}
.feature:last-child {
  border-bottom: none;
}
.feature:hover {
  border-bottom-color: rgba(26, 115, 232, 0.15);
}
.feature-num {
  flex-shrink: 0;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 0.85rem;
  font-weight: 700;
  color: rgba(26, 115, 232, 0.2);
  padding-top: 3px;
  min-width: 24px;
  transition: color var(--transition);
}
.feature:hover .feature-num {
  color: var(--primary);
}
.feature-body h3 {
  margin-bottom: 1px;
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
}
.feature-body p {
  color: var(--text-light);
  font-size: 0.85rem;
  line-height: 1.55;
}

/* ── 向下箭头 ── */
.scroll-down-arrow {
  position: absolute;
  bottom: var(--space-lg);
  left: 50%;
  z-index: 10;
  font-size: 1.6rem;
  color: var(--text-muted);
  animation: bounce 2s infinite;
  transition:
    color var(--transition),
    transform var(--transition-spring);
}
.scroll-down-arrow:hover {
  color: var(--primary);
  transform: translateX(-50%) scale(1.3);
}

/* ==========================================================================
   最新动态
   ========================================================================== */
.news {
  position: relative;
  overflow: visible;
  min-height: 100vh;
  padding: 120px 0 0;
  background:
    /* 顶部过渡：承接 About */
    radial-gradient(
      ellipse 1000px 350px at 50% 0%,
      rgba(79, 195, 247, 0.06) 0%,
      transparent 60%
    ),
    #fff;
}

/* ── 第一行：标签在左，时间轴在右 ── */
.news-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xl);
  margin-bottom: 48px;
  padding: 0 var(--space-md);
}
.news-header {
  flex-shrink: 0;
}
.news-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 3px;
  color: var(--primary);
  font-weight: 700;
  margin-bottom: 2px;
}
.news-heading {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}
.news-heading .highlight {
  color: var(--primary);
  position: relative;
}
.news-heading .highlight::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 1px;
  width: 100%;
  height: 6px;
  background: rgba(26, 115, 232, 0.12);
  border-radius: 2px;
  z-index: -1;
}

/* ── 新闻 Grid ── */
.hint {
  text-align: center;
  color: var(--text-light);
  padding: var(--space-xl) 0;
}
.news-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-lg);
  padding: 0 var(--space-md);
}
.news-card {
  display: grid;
  grid-template-columns: 58px 1fr;
  grid-template-rows: 1fr auto;
  column-gap: var(--space-lg);
  row-gap: var(--space-sm);
  padding: var(--space-lg);
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-lg);
  transition:
    transform var(--transition-spring),
    box-shadow var(--transition),
    border-color var(--transition);
  position: relative;
  overflow: hidden;
}
/* 左侧彩色装饰条 */
.news-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, var(--primary), var(--primary-light));
  opacity: 0;
  transition: opacity var(--transition);
}
.news-card:hover::before {
  opacity: 1;
}
.news-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 36px rgba(26, 115, 232, 0.1);
  border-color: rgba(26, 115, 232, 0.18);
}

/* ── 日期徽章（镂空数字）── */
.nc-badge {
  grid-row: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
  flex-shrink: 0;
  padding-top: 2px;
}
.nc-badge-day {
  font-family: "Noto Serif SC", "Georgia", "Times New Roman", serif;
  font-size: 2.8rem;
  font-weight: 900;
  /* 镂空描边 */
  -webkit-text-stroke: 2px var(--primary);
  color: transparent;
  line-height: 0.85;
  letter-spacing: -2px;
  transition:
    -webkit-text-stroke-color var(--transition),
    color var(--transition);
}
.news-card:hover .nc-badge-day {
  -webkit-text-stroke-color: var(--primary-dark);
  color: rgba(26, 115, 232, 0.06);
}
.nc-badge-mon {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--primary);
  letter-spacing: 1px;
  margin-top: 4px;
  text-transform: uppercase;
  transition: color var(--transition);
}
.news-card:hover .nc-badge-mon {
  color: var(--primary-dark);
}

/* ── 内容区 ── */
.nc-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.nc-time {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 500;
  letter-spacing: 0.3px;
  order: -1;
}
.nc-title {
  margin: 0;
  color: var(--text);
  font-size: 0.96rem;
  font-weight: 650;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color var(--transition-fast);
}
.news-card:hover .nc-title {
  color: var(--primary-dark);
}
.nc-summary {
  margin: 0;
  color: var(--text-light);
  font-size: 0.82rem;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── 底部链接 ── */
.nc-link {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--primary);
  transition:
    gap var(--transition),
    color var(--transition-fast);
  padding-top: var(--space-sm);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  text-decoration: none;
}
.nc-link i {
  font-size: 0.7rem;
  transition: transform var(--transition);
}
.nc-link:hover {
  color: var(--primary-dark);
  gap: 10px;
}
.nc-link:hover i {
  transform: translateX(3px);
}

/* ── 跳转大事记卡片 ── */
.news-card--more {
  text-decoration: none;
  cursor: pointer;
  border-style: dashed;
  border-color: rgba(26, 115, 232, 0.18);
  background: linear-gradient(135deg, rgba(26, 115, 232, 0.015), rgba(79, 195, 247, 0.02));
}
.news-card--more:hover {
  border-color: var(--primary);
  background: linear-gradient(135deg, rgba(26, 115, 232, 0.04), rgba(79, 195, 247, 0.05));
}
.news-card--more .nc-title {
  color: var(--text-muted);
  transition: color var(--transition-fast);
}
.news-card--more:hover .nc-title {
  color: var(--primary);
}
.news-card--more .nc-summary {
  color: var(--text-muted);
}
/* "更多"卡片镂空加号 */
.nc-badge-day--outline {
  -webkit-text-stroke: 2px rgba(26, 115, 232, 0.35);
  color: transparent;
  font-weight: 300;
  letter-spacing: 0;
}
.news-card--more:hover .nc-badge-day--outline {
  -webkit-text-stroke-color: var(--primary);
  color: rgba(26, 115, 232, 0.05);
}
.news :deep(footer) {
  margin-top: 100px;
}

/* ── 板块过渡桥 ── */
.section-bridge {
  position: relative;
  height: 0;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
}
.section-bridge .decorative-orb {
  position: absolute;
}

/* ── 响应式 ── */
@media (max-width: 992px) {
  .hero-inner,
  .about-inner {
    grid-template-columns: 1fr;
    gap: var(--space-xl);
  }
  .hero-content {
    transform: none;
  }
  .hero-image-container {
    transform: none;
  }
  .hero-image-main {
    transform: none !important;
  }
  .float-shapes {
    display: none;
  }
  .hero-fade-bottom {
    display: none;
  }
  .about-visual {
    order: 2;
    align-items: center;
  }
  .about-visual-title {
    align-self: center;
  }
  .contest-grid {
    max-width: 480px;
  }
  .about-content {
    text-align: center;
    order: 1;
  }
  .about-desc {
    max-width: none;
  }
  .about-heading {
    font-size: 1.8rem;
  }
  .features {
    text-align: left;
  }
  .floating-code {
    max-width: 200px;
  }
  .fc-1 {
    right: 12%;
  }
  .fc-2 {
    left: -20px;
  }
}
@media (max-width: 768px) {
  .hero {
    padding: calc(var(--header-height) + 40px) 0 var(--space-xl);
    min-height: auto;
    cursor: default;
  }
  .hero-inner {
    text-align: center;
    justify-items: center;
  }
  .hero-content {
    order: 1;
    padding-left: 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: var(--space-lg);
  }
  .hero h2 {
    font-size: var(--font-size-4xl);
    white-space: normal;
    margin-bottom: var(--space-sm);
  }
  .hero p {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-md);
  }
  .hero-buttons {
    margin-top: var(--space-sm);
  }
  .hero-image {
    order: 2;
    margin-top: -8px;
  }
  .hero-particles,
  .code-trail-container {
    display: none;
  }
  .floating-code {
    max-width: 180px;
  }
  .news-grid {
    grid-template-columns: 1fr;
  }
  .contest-grid {
    grid-template-columns: repeat(4, 1fr);
    max-width: none;
  }
  .contest-card {
    padding: 16px 12px;
  }
  .contest-card-img {
    width: 60px;
    height: 44px;
  }
  .contest-card--xcpc {
    grid-column: 1 / -1;
  }
  .contest-card--xcpc .contest-card-sub-img {
    height: 44px;
  }
  .about {
    padding: var(--section-padding-mobile);
  }
  .news {
    padding: 60px 0 0;
  }
}
@media (max-width: 576px) {
  .hero {
    padding: calc(var(--header-height) + 30px) 0 var(--space-lg);
  }
  .hero-content {
    padding-top: var(--space-md);
  }
  .hero h2 {
    font-size: var(--font-size-3xl);
    white-space: normal;
    margin-bottom: var(--space-xs);
  }
  .hero p {
    font-size: var(--font-size-base);
    margin-bottom: var(--space-sm);
  }
  .hero-buttons {
    margin-top: var(--space-xs);
  }
  .floating-code {
    display: none;
  }
  .contest-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .about-heading {
    font-size: 1.5rem;
  }
}
</style>
