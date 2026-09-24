/**
 * 跨组件的 DOM 标记：**一个组件写在 `<body>` / `<html>` 上、别的组件（或全局 CSS）去读**
 * 的那些类名，以及跨组件使用的选择器。
 *
 * 为什么单独放一个文件：这些字符串的**写方与读方分处不同文件** —— 改名的人只会改到自己
 * 那一半，页面不报错，只是行为悄悄不对（例如成员卡开着时遮罩还在跟着手指滚）。
 * 使用方清单（2026-09-24 审查时逐一实测）：
 *
 *   BODY_WALL_PRESENT    「这一页有头像墙」—— HeroAvatarWall setup 期就挂上（组件 :120，
 *                        晚一帧挂会看到首屏高度抖动）、卸载时摘（:917）；读方是它自己的
 *                        全局 CSS（:1907 / :1910 / :1936）与 AppHeader.vue:307 那条选择器。
 *   BODY_WALL_ON         进墙 / 退墙的过渡态 —— HeroAvatarWall :867 切换，读方是自己的全局 CSS（:1893）。
 *   BODY_WALL_SHEET      成员卡（浮窗）打开中 —— HeroAvatarWall :931（lockPage）切换，
 *                        读方是 useMaskReveal.js:123（浮窗开着就不许再动遮罩）与全局 CSS
 *                        （:1918，把「加入我们」悬浮球藏掉）。
 *   APP_HEADER_SELECTOR  顶部导航栏 —— HeroAvatarWall :644 的 headerBottom() 读它，
 *                        用来把卡片挡在导航栏下面。
 *   ROOT_MASK_OUT        遮罩整层已推出视口 —— useMaskReveal.js:228 写，AppHeader.vue:301
 *   ROOT_MASK_RETURNING  遮罩正在回程 —— useMaskReveal.js:229 写，与 HomeView 的遮罩层读。
 *
 * ⚠ CSS 里那几处**只能写字面量**（自定义属性拼不进选择器），所以它们与这里同名靠注释指路：
 *   改这里的名字时，全仓库搜一遍字符串一起改（`git grep hero-wall` 一次就能看全）。
 */

/** 本页有头像墙（影响手机端「hero 一屏高」这类布局规则，故 setup 期就要挂上） */
export const BODY_WALL_PRESENT = 'hero-wall-present'
/** 头像墙正在「进入 / 退出」的动态过程 */
export const BODY_WALL_ON = 'hero-wall-on'
/** 成员卡（浮窗）打开中 */
export const BODY_WALL_SHEET = 'hero-wall-sheet'
/** 顶部导航栏元素（CSS 里另有若干处同名字面量，见文件头） */
export const APP_HEADER_SELECTOR = '#app > header'
/** 遮罩整层已推出视口（露墙） */
export const ROOT_MASK_OUT = 'is-mask-out'
/** 遮罩正在回程（请回） */
export const ROOT_MASK_RETURNING = 'is-mask-returning'
