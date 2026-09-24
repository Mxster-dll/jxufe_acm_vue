<script setup>
/**
 * 荣誉显示方式的切换器（三种视图：计数 / 图标 / 明细）。
 *
 * 样式用项目**既有**的 `.view-toggle` / `.view-btn`（styles/view-toggle.css，
 * 与竞赛信息页「表格 / 卡片」那枚同源）—— 会长 2026-09-23 指定复用，不自造控件。
 * 所以这里只有模板，没有自己的样式。
 */
import { HONOR_VIEWS, honorView } from '../utils/honorView'
</script>

<template>
  <div class="view-toggle" role="group" aria-label="荣誉显示方式">
    <button
      v-for="opt in HONOR_VIEWS"
      :key="opt.value"
      type="button"
      class="view-btn"
      :class="{ active: honorView === opt.value }"
      :aria-pressed="honorView === opt.value"
      :title="`${opt.sample}　${opt.hint}`"
      @click="honorView = opt.value"
    >
      <i :class="opt.icon"></i> {{ opt.label }}
    </button>
  </div>
</template>
