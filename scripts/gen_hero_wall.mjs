#!/usr/bin/env node
/**
 * gen_hero_wall.mjs —— 首页 hero 头像墙的数据准备（唯一真源 = 图片文件夹）
 *
 * 输入：public/images/excellent_member/   你只管往这里丢图
 * 输出：public/data/hero_wall.manifest.json   （生成物：有哪些图，随便覆盖）
 *       public/data/hero_wall.json            （手写物：文案字典，只补不覆盖）
 *
 * 为什么需要 manifest：
 *   浏览器不能列目录（GET /images/xxx/ 不会返回文件列表），所以墙必须事先知道
 *   有哪些图。这个脚本就是那份清单的生成器。
 *
 * 两个文件的**分工**是刻意的：
 *   · manifest 是生成物 —— 每次重扫都整个重写；
 *   · hero_wall.json 是手写的 —— 只**新增缺失的条目**，已有条目一个字都不动。
 *   所以"加图片"永远不会冲掉你写过的文案。
 *
 * 运行时机（package.json 里挂了钩子，不用手动跑）：
 *   npm run dev   → predev   → 本脚本
 *   npm run build → prebuild → 本脚本（部署时服务器上也会跑一次，所以"丢图 → deploy.bat"就完事）
 *
 * 任何异常都**只告警不中断**：它挂在 prebuild 上，一旦抛错会把整个部署带崩，
 * 而最坏情况（清单没更新）远没有"部署失败"严重。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IMAGE_DIR = join(ROOT, 'public/images/excellent_member')
const IMAGE_URL = '/images/excellent_member/'
const MANIFEST_PATH = join(ROOT, 'public/data/hero_wall.manifest.json')
const COPY_PATH = join(ROOT, 'public/data/hero_wall.json')
const MEMBERS_PATH = join(ROOT, 'public/data/members.json')

/** 认这些扩展名（墙上用 object-fit: cover，非正方形也不会变形） */
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
/** 排除的基名：default 是"没有照片"的占位图，不该当成一个人铺到墙上 */
const EXCLUDE = new Set(['default'])

const log = (...a) => console.log('[hero-wall]', ...a)
const warn = (...a) => console.warn('[hero-wall]', ...a)

/** 读 JSON，读不到就返回兜底值（不抛） */
async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

/** 扫描图片目录 → 排序好的文件名数组 */
async function scanImages() {
  const entries = await readdir(IMAGE_DIR, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => EXTS.has(extname(name).toLowerCase()))
    .filter((name) => !EXCLUDE.has(name.slice(0, name.lastIndexOf('.')).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
}

async function main() {
  if (!existsSync(IMAGE_DIR)) {
    warn(`找不到图片目录 ${IMAGE_DIR}，跳过（保留上一次的清单）`)
    return
  }

  const images = await scanImages()
  if (!images.length) {
    warn('图片目录里没有可用图片，跳过（保留上一次的清单）')
    return
  }

  /* ── 1. manifest：整份重写 ── */
  const manifest = {
    _note: '生成物，请勿手改。由 scripts/gen_hero_wall.mjs 扫描 public/images/excellent_member/ 生成。',
    generated_at: new Date().toISOString(),
    source: IMAGE_URL,
    count: images.length,
    images,
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  log(`manifest: ${images.length} 张 → public/data/hero_wall.manifest.json`)

  /* ── 2. 文案字典：只补缺失条目，绝不覆盖已有内容 ── */
  const copy = await readJson(COPY_PATH, null)
  const tiles = copy && typeof copy.tiles === 'object' && copy.tiles ? copy.tiles : {}

  // members.json 里已有姓名/班级/奖项，按 photo 路径反查。
  // 只用来给**新建的**条目预填一份占位内容，让新图一丢进去就有东西可看；
  // 已有条目一个字都不动，所以你在 hero_wall.json 里写的文案永远是最终版本。
  const members = await readJson(MEMBERS_PATH, [])
  const seedByFile = new Map()
  for (const m of Array.isArray(members) ? members : []) {
    const photo = typeof m?.photo === 'string' ? m.photo : ''
    if (!photo.startsWith(IMAGE_URL)) continue
    const file = photo.slice(IMAGE_URL.length)
    if (!file || !m.name) continue
    const honors = Array.isArray(m.honors) ? m.honors.filter((h) => typeof h === 'string' && h.trim()) : []
    seedByFile.set(file, {
      name: m.name,
      line: typeof m.class === 'string' ? m.class : '',
      tags: honors.slice(0, 3),
      // members.json 里没有留言这个概念，预填一律留空
      message: '',
    })
  }

  const added = []
  for (const file of images) {
    if (tiles[file]) continue // 已有条目：一个字都不动
    const seed = seedByFile.get(file)
    tiles[file] = seed
      ? { name: seed.name, line: seed.line, tags: seed.tags, message: seed.message }
      : { name: '', line: '', tags: [], message: '' }
    added.push(file)
  }

  if (!copy) {
    log('新建 public/data/hero_wall.json（文案字典）')
  }
  if (added.length) {
    log(`新增 ${added.length} 条待填文案: ${added.join(', ')}`)
  } else {
    log('文案字典没有新增条目')
  }

  const out = {
    _note:
      '手写文件：key 是图片文件名，value 是悬浮卡片的内容。' +
      'name 是姓名，line 是一句话（通常是班级，可留空），tags 是奖项胶囊（可留空），' +
      'message 是本人的留言（可留空，长段落会自动截断成几行）。' +
      '全部留空就只显示头像——不编造内容。' +
      'gen_hero_wall.mjs 只会在新图片出现时补一条空条目，永远不会覆盖这里已有的内容。',
    tiles,
  }
  await writeFile(COPY_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8')
}

main().catch((err) => {
  // 见文件头：挂在 prebuild 上，任何异常都只告警，绝不中断构建/部署
  warn('生成失败，保留上一次的清单：', err?.message || err)
})
