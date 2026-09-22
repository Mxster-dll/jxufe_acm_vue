/**
 * 荣誉显示方式（会长 2026-09-23 裁定）：三种视图，两个页面共用一份偏好。
 *
 *   count   🥇1🥈2🥉2                —— 只写每种奖牌的数量（一直以来的口径）
 *   icons   🥇🥈🥈🥉🥉                —— 每块奖牌各占一个图标，数量一眼看得出长短
 *   detail  第45届ICPC亚洲区域赛 南京站 铜牌  —— 逐条列出赛事全名与奖牌
 *
 * 偏好写 localStorage：切了之后两页一致、刷新也不丢。
 * 读取失败（隐私模式 / 老浏览器）一律退回 count —— 那是默认口径，不会把页面搞空。
 */
import { ref, watch } from 'vue'

export const HONOR_VIEWS = [
  {
    value: 'count',
    label: '计数',
    icon: 'fa-solid fa-hashtag',
    sample: '🥇1🥈2🥉2',
    hint: '只写每种奖牌的数量',
  },
  {
    value: 'icons',
    label: '图标',
    icon: 'fa-solid fa-medal',
    sample: '🥇🥈🥈🥉🥉',
    hint: '每块奖牌各占一个图标',
  },
  {
    value: 'detail',
    label: '明细',
    icon: 'fa-solid fa-list-ul',
    sample: '第45届ICPC亚洲区域赛 南京站 铜牌',
    hint: '逐条列出赛事全名与奖牌',
  },
]

export const DEFAULT_HONOR_VIEW = 'count'

const STORAGE_KEY = 'jxufe:honor-view'
const VALUES = HONOR_VIEWS.map((v) => v.value)

function readSaved() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return VALUES.includes(saved) ? saved : DEFAULT_HONOR_VIEW
  } catch {
    return DEFAULT_HONOR_VIEW
  }
}

export const honorView = ref(readSaved())

watch(honorView, (value) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* 存不下就算了，本次会话仍然有效 */
  }
})
