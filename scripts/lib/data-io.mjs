/**
 * 数据文件读取的统一策略 —— scripts/ 下所有生成器共用这一份，别再各写各的。
 *
 * 为什么要有这个文件（2026-09-24 代码审查）：同一条 `prebuild` 链上有三种失败态度 ——
 *   · gen_group_wall.mjs     直接 `JSON.parse(fs.readFileSync())`：缺一份就抛，
 *                            报错却只有一句 ENOENT，看不出该补哪份数据、谁要的；
 *   · gen_event_badges.mjs   逐文件 `.catch(() => fallback)`：缺一个 awards 文件，
 *                            那个系列在时间轴角标里**无声消失**，零信号；
 *   · gen_hero_wall.mjs      文件头声明「任何异常都只告警不中断」。
 * 三种态度并存，维护者没法预期「缺数据时会发生什么」。现在只有两条路：
 *
 *   readJsonRequired(file, label)      必需数据：读不到就**停下来**，并且报错里写清
 *                                      「哪份文件、谁要的、怎么补」。理由：静默少一份数据，
 *                                      页面上表现为「某个系列凭空消失」，没人会发现；
 *                                      构建停一次，五秒就能看懂。
 *   readJsonOptional(file, fallback)   可选数据：读不到用调用方给的回落值继续，
 *                                      但**必须**打一行 warn —— 降级可以有，无声降级不行。
 *
 * 什么算「必需」：随仓库提交、缺了页面就少内容的站点数据 —— public/data 下的
 *   members.json / leaders.json / duties.json / scholarships.json / group_members.json /
 *   competitions.json / awards/*.json / events/<年份>.json。
 * 什么算「可选」：会长手写、缺了不影响页面结构的那几份 —— wall_rules.json（入墙规则）、
 *   hero_wall.json（留言），以及 gen_hero_wall.mjs 那份「只补空条目」的产物。
 */
import fs from 'node:fs'

/** 必需数据：读不到 / 不是合法 JSON 都直接抛，报错里带上是「谁要的」。 */
export function readJsonRequired(file, label = '') {
  const who = label ? `\n       需要它的地方：${label}` : ''
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    throw new Error(
      `[data] 找不到必需的数据文件：${file}${who}\n` +
        `       修法：确认它已随仓库提交（git ls-files --error-unmatch ${file}），` +
        `或跑对应的生成器重新产出。\n` +
        `       原始错误：${err.message}`
    )
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`[data] 数据文件不是合法 JSON：${file}${who}\n       原始错误：${err.message}`)
  }
}

/** 可选数据：读不到就用 fallback 继续，但一定留下 warn（不静默降级）。 */
export function readJsonOptional(file, fallback, label = '') {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    const who = label ? `（${label}）` : ''
    console.warn(`[data] 读不到可选数据 ${file}${who} —— 用回落值继续：${err.code || err.message}`)
    return fallback
  }
}
