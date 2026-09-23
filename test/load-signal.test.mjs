/**
 * 荣誉数据降级必须留信号（2026-09-24 审查 A5）。
 *
 * 单独一个文件是有意的：`loadHonorRecords()` 把结果缓存在模块级，而 `node --test` 每个
 * 测试文件跑在独立进程里 —— 只有新进程才能测「第一次加载就失败」这条路径。
 *
 * 原问题：逐文件 `.catch(() => [])` / `.catch(() => null)`，连一行日志都没有，
 * 于是「某个系列在胶囊与排名里凭空消失」在页面上完全看不出来。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { AWARD_FILES } from '../src/utils/contestTaxonomy.js'
import { loadHonorRecords, missingHonorSources } from '../src/utils/honorPills.js'

test('数据文件全部取不到时：返回空索引 + 记下缺失清单 + 只报一次警', async () => {
  const warns = []
  const originalWarn = console.warn
  const originalFetch = globalThis.fetch
  console.warn = (...args) => warns.push(args.join(' '))
  globalThis.fetch = async () => ({ ok: false, status: 404 })

  try {
    const records = await loadHonorRecords()

    // 降级本身是有意的（缺一份数据不该让整页报错），所以返回空索引
    assert.equal(records.size, 0)

    // 但必须留下可查的信号：6 个 awards 文件 + competitions.json
    assert.equal(missingHonorSources.length, AWARD_FILES.length + 1)
    assert.ok(missingHonorSources.every((m) => m.url.startsWith('/data/') && m.message.includes('404')))

    // 而且只 warn 一次（把所有失败合成一条，不刷屏）
    const honorWarns = warns.filter((w) => w.includes('[honorPills]'))
    assert.equal(honorWarns.length, 1)
    assert.match(honorWarns[0], /7 份战绩数据没读到/)
    assert.match(honorWarns[0], /awards\/lanqiao\.json/)
  } finally {
    console.warn = originalWarn
    globalThis.fetch = originalFetch
  }
})
