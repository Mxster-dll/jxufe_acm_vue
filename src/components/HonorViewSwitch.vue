<script setup>
/**
 * 荣誉显示方式的切换器 —— WinUI 3 的 **SelectorBar**（Fluent 里专管「同一内容换一种视图」
 * 的控件：整条槽 + 选中项一枚圆角指示块），而不是自造一排胶囊按钮。
 *
 * 为什么手写而不是装 @fluentui/web-components：本仓库已有一套自己的设计令牌
 * （styles/tokens.css，颜色/间距/圆角/过渡的唯一来源），只为这一个控件引一整套
 * 组件库 + 它自己的主题系统不划算，也会和现有观感打架。所以按 Fluent 的结构
 * 与栅格手写，取值全部走项目令牌：
 *   · 4px 栅格：槽内边距 4、项间距 4、项高 32、项内边距 16
 *   · ControlCornerRadius 4px → var(--radius-sm)（槽与选中块共用）
 *   · 字号 14px / 400 常规，选中 600 Semibold（Fluent 只用 Semibold，不用 Bold）
 *   · 颜色一律语义令牌：--bg-light 槽底、--bg-dark 悬停、--bg 选中块、--text-light
 *     未选中、--text 悬停、--primary 选中（强调色）
 *   · 焦点用 2px 主色描边（Fluent 的 focus rect），不用 outline: none
 */
import { HONOR_VIEWS, honorView } from '../utils/honorView'
</script>

<template>
  <div class="selector-bar" role="tablist" aria-label="荣誉显示方式">
    <button
      v-for="opt in HONOR_VIEWS"
      :key="opt.value"
      type="button"
      role="tab"
      class="selector-bar__item"
      :class="{ 'is-selected': honorView === opt.value }"
      :aria-selected="honorView === opt.value"
      :title="`${opt.sample}　${opt.hint}`"
      @click="honorView = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.selector-bar {
  display: inline-flex;
  gap: var(--space-xs);
  padding: var(--space-xs);
  background: var(--bg-light);
  border: 1px solid var(--bg-dark);
  border-radius: var(--radius-sm);
}

.selector-bar__item {
  min-height: 32px;
  padding: 0 var(--space-md);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-light);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.selector-bar__item:hover {
  background: var(--bg-dark);
  color: var(--text);
}

.selector-bar__item.is-selected {
  background: var(--bg);
  color: var(--primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.selector-bar__item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
</style>
