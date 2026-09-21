# 江西财经大学程序设计竞赛协会

江西财经大学 ACM 程序设计竞赛协会官方网站，基于 Vue 3 重构的单页应用（SPA）。

在线地址：**https://jxufe-acm.cn**

---

## ✨ 特性

- **Vue 3 组件化** — `<script setup>` + Composition API，路由级懒加载，首屏极速
- **内容数据驱动** — 新闻、竞赛、成员、负责人、友链等全部抽离为 JSON，增删改无需改代码
- **手写 CSS 体系** — 设计令牌（`tokens.css`）+ 全局基础样式 + 组件 Scoped，无 UI 框架依赖
- **滚动入场动画** — 基于 IntersectionObserver 的 `v-reveal` 指令，声明式使用
- **大事记 Block 渲染** — 类型化内容块系统，支持 13 种块类型（文本、图片、奖项、表格、FAQ 等）
- **全局交互特效** — 光标涟漪（`useCursorRipple`）、代码拖尾（`useCodeTrail`）、骨架屏加载态
- **响应式设计** — 适配桌面端与移动端，导航栏支持汉堡菜单

## 🛠 技术栈

| 类别 | 选型 |
|------|------|
| 构建工具 | Vite 5 |
| 框架 | Vue 3（Composition API） |
| 路由 | Vue Router 4（HTML5 History 模式） |
| 样式 | 手写 CSS（设计令牌 + Scoped） |
| 图标 | Font Awesome 6（CDN） |
| 字体 | Google Fonts: Noto Sans SC, Noto Serif SC, ZCOOL KuaiLe |
| UI 框架 | 无 |

## 📁 目录结构

```
jxufe-acm-vue/
├── index.html                     # Vite 入口 HTML
├── vite.config.js                 # Vite 配置
├── package.json                   # 依赖：vue + vue-router + vite
├── deploy.bat                     # Windows 一键部署脚本
├── public/
│   ├── data/                      # ★ 所有内容数据（JSON），修改即生效，无需重新构建
│   │   ├── actions.json           # 大事记 / 新闻（含文章正文）
│   │   ├── competitions.json      # 竞赛信息 + 参赛历史
│   │   ├── events/                # 各赛事举办时间（参赛历史“日期”列 + 大事记比赛卡片共用）
│   │   │   ├── index.json         # 赛事清单（slug + 名称）
│   │   │   └── <slug>.json        # 每个赛事一个时间文件
│   │   ├── editions/              # 单届比赛详情（大事记卡片点击进入 /competition/<slug>/<year>）
│   │   │   └── <slug>/<year>.json # 每届一个文件：日期、参赛规模、国赛/省赛获奖（高校/团队/个人）
│   │   ├── leaders.json           # 历届协会负责人
│   │   ├── members.json           # 优秀成员列表
│   │   └── links.json             # 友情链接
│   └── images/                    # 静态图片
│       ├── slider/                # 首页轮播图（slider1.jpg ~ slider10.jpg）
│       ├── contest/               # 竞赛 logo
│       ├── leader/                # 负责人头像（2021.jpg ~ 2026.jpg）
│       ├── excellent_member/      # 优秀成员头像
│       ├── links/                 # 友链 logo + 二维码
│       └── ...
└── src/
    ├── main.js                    # 应用入口
    ├── App.vue                    # 根组件（Header + RouterView + Footer + FloatingJoin）
    ├── router.js                  # 9 条路由，全部懒加载
    ├── styles/
    │   ├── tokens.css             # 设计令牌（颜色 / 阴影 / 圆角 / 间距 / 字体）
    │   ├── base.css               # CSS 重置 + 全局样式 + 动画关键帧
    │   ├── honors.css             # 荣誉标签（按类型分色）+ 比赛战绩胶囊（两页共用）
    │   └── index.css              # 样式入口
    ├── components/
    │   ├── AppHeader.vue          # 导航栏（滚动变色 + 移动端汉堡菜单）
    │   ├── AppFooter.vue          # 页脚（三栏布局 + ICP 备案）
    │   ├── FloatingJoin.vue       # 右下角悬浮"加入我们"按钮
    │   └── action/
    │       ├── BlockRenderer.vue  # 大事记块类型渲染器（13 种块）
    │       └── OrganizerGrid.vue  # 招新二维码卡片网格
    ├── composables/
    │   ├── useJson.js             # 通用 JSON 数据加载器
    │   ├── useNews.js             # 首页最新动态（最近 5 条）
    │   ├── useTimeline.js         # 大事记按年分组 + 置顶
    │   ├── useSkeleton.js         # 骨架屏占位
    │   ├── useMasonry.js          # 瀑布流布局（仅优秀成员页用；负责人页是等高行）
    │   ├── useCodeTrail.js        # 代码字符拖尾特效
    │   └── useCursorRipple.js     # 光标涟漪特效
    ├── directives/
    │   └── reveal.js              # v-reveal 滚动入场指令
    ├── data/
    │   └── navigation.js          # 导航菜单 + 页脚链接
    ├── utils/
    │   ├── inline.js              # 内联标记解析（**加粗**、[链接](url)）
    │   ├── honorType.js           # 荣誉分类（比赛 / 毕业去向 / 荣誉职位 / 联系方式）
    │   ├── honorPills.js          # 比赛战绩胶囊：从竞赛数据自动汇总奖牌（四系列口径都在这）
    │   └── honorRanking.js        # 显示排名：奖牌 + 手写战绩 + 荣誉 → 分值（四张权重表都在这）
    └── views/
        ├── HomeView.vue           # 首页 /
        ├── AllActionView.vue      # 大事记列表 /all-action
        ├── ActionDetailView.vue   # 大事记详情 /action/:slug
        ├── ContestView.vue        # 竞赛信息 /contest
        ├── CompetitionDetailView.vue  # 竞赛详情 /competition/:slug
        ├── LeaderView.vue         # 协会负责人 /leader
        ├── ExcellentView.vue      # 优秀成员 /excellent
        ├── LinksView.vue          # 友链 /links
        └── NotFoundView.vue       # 404 页面
```

## 🚀 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器 → http://localhost:5173
npm run dev

# 构建生产版本 → dist/
npm run build

# 预览生产构建
npm run preview
```

## 📦 部署

项目使用 `deploy.bat` 一键部署到服务器：

1. 确保本机代码已 `git commit`
2. 双击 `deploy.bat`
3. 脚本自动：检测变更文件 → 增量上传 → 服务器构建 → 重载 Nginx

首次运行全量上传，后续只上传有变化的文件/目录。详见脚本内注释。

---

## 📝 内容维护指南

所有可变内容存放在 `public/data/` 目录下的 JSON 文件中。**修改后刷新页面即可生效，无需重启，无需重新构建。**

> **注意：** 如果你提交了 Pull Request 并被合并，但网站迟迟没有更新，请联系 **QQ：3200513041** 手动触发部署。

---

### 一、如何添加 / 修改 News（大事记）

**文件：** `public/data/actions.json`

每条记录的结构如下：

```json
{
  "slug": "2025-4-19-tts",          // 唯一标识，用于 URL（/action/2025-4-19-tts）
  "title": "时隔8年，我校再获天梯赛团体国一",
  "date": "2025-04-19",
  "isTop": false,                    // true = 置顶
  "summary": "简短摘要，显示在首页和列表页",
  "subtitle": "副标题（可选，详情页显示）",
  "blocks": [ ... ]                  // 文章正文，见下方 Block 类型
}
```

#### Block 类型一览

`blocks` 是一个数组，每个元素有一个 `type` 字段。**正文中的 `**加粗**` 和 `[文字](链接)` 会自动转换为 HTML。**

| type | 用途 | 关键字段 |
|------|------|---------|
| `text` | 正文段落 | `paras: string[]` |
| `heading` | 小标题 | `text`, `icon?`（Font Awesome 类名） |
| `images` | 图片 | `items: [{ src, alt?, caption? }]` |
| `awards` | 获奖卡片 | `heading?`, `cards: [{ title, fields, highlight?, images }]` |
| `highlight` | 引用 / 高亮文本 | `text: string` |
| `partners` | 合作高校 Logo 墙 | `logos: [{ src, alt }]`, `note?` |
| `list` | 列表 | `intro?`, `items: string[]` |
| `table` | 表格 | `headers?`, `rows: 二维数组` |
| `info` | 信息卡片网格 | `heading?`, `icon?`, `cards: [{ icon, title, desc }]` |
| `organizers` | 招新二维码卡片（可点击展开） | `heading?`, `icon?`, `items: [{ icon, name, qr?, text? }]` |
| `join` | 二维码加入区 | `heading?`, `icon?`, `qq?`, `images`, `note?` |
| `platformList` | 学习平台列表 | `items: [{ name, desc }]` |
| `faq` | 折叠问答（答案可嵌套任意 Block） | `items: [{ q, a: Block[] }]` |

#### 添加一条新 News

在 `actions.json` 数组最前面插入一条新对象即可。示例：

```json
{
  "slug": "2026-6-27-new-contest",
  "title": "我校在XX竞赛中取得佳绩",
  "date": "2026-06-27",
  "isTop": false,
  "summary": "简短的摘要描述",
  "subtitle": "副标题（可省略）",
  "blocks": [
    {
      "type": "text",
      "paras": ["第一段正文。**加粗文字**会自动渲染。", "第二段正文。访问 [官网](https://jxufe-acm.cn) 了解更多。"]
    },
    {
      "type": "heading",
      "text": "获奖详情",
      "icon": "fa-solid fa-trophy"
    },
    {
      "type": "images",
      "items": [
        { "src": "/images/slider/slider1.jpg", "alt": "描述", "caption": "图片说明" }
      ]
    }
  ]
}
```

---

### 二、如何添加 / 修改 Members（优秀成员）

**文件：** `public/data/members.json`

```json
{
  "name": "张三",
  "class": "22计算机科学与技术1班",
  "photo": "/images/excellent_member/zhangsan.png",
  "honors": [
    { "text": "全国大学生数学建模竞赛国家二等奖", "type": "contest" },
    { "text": "保研至XX大学", "type": "destination" },
    { "text": "国家奖学金", "type": "honor" },
    { "text": "🛰️：zhangsan123", "type": "contact" }
  ]
}
```

**honors 的每条荣誉都带一个类型，页面上按类型显示成不同颜色的标签：**

| type | 含义 | 颜色 | 例子 |
|------|------|------|------|
| `contest` | 比赛 | 蓝 | 数学建模国二、睿抗国一、传智杯国二 |
| `destination` | 毕业去向（保研 / 考研 / 就业） | 橙 | 保研至北京邮电大学、小米科技 |
| `honor` | 个人荣誉 / 职位 | 绿 | 国家奖学金、优秀学生干部、协会组织部负责人 |
| `contact` | 联系方式 / 社交主页等彩蛋 | 灰 | 🛰️：xxx、关注小羊谢谢喵 |

- `type` 也可以直接写中文：`"比赛"` / `"去向"` / `"荣誉"` / `"联系"`。
- **`type` 可以整个省略**（甚至把荣誉写回纯字符串，如 `"睿抗国一"`）：此时由
  `src/utils/honorType.js` 的关键词规则自动归类，判不准的按「比赛」显示，
  所以以后临时加一条也不会没颜色。
- 配色改 `src/styles/tokens.css` 里的 `--honor-*`（四类各一组：主色 / 淡底 / 描边 / hover），
  标签本身的几何与 hover 改 `src/styles/honors.css`——两个页面共用，改一处两页同时生效。

#### 比赛战绩胶囊（ICPC / CCPC / 天梯赛 / 百度之星 / 蓝桥杯 —— 不用手写）

这五个系列**不要在 `honors` 里手写了**：它们由站点自己的竞赛数据自动汇总，在荣誉列表
最前面显示成一枚枚战报胶囊，如 `xCPC 区域赛🥈2🥉1 邀请赛🥇1🥈3🥉4`、`蓝桥杯 国赛🥇1 省赛🥇2`。
汇总逻辑在 `src/utils/honorPills.js`，页面加载时读 `/data/editions/<slug>/<year>.json` 与
`/data/baidu.json`（就是竞赛页用到的同一批数据），**所以竞赛数据一更新，两页自动跟上**。

| 系列 | 胶囊分段 | 口径要点 |
|------|----------|----------|
| xCPC | `区域赛` `邀请赛` ＋ 独立一枚 `xCPC 省赛…` | ICPC 与 CCPC 合并成一个 xCPC；`ICPC全国邀请赛（南昌）暨江西省赛` 这类在邀请赛与省赛**各计一次**；**省赛只认江西省赛**——其他省的省赛 / 区赛（广东、河南、广西、山东、吉林、东北、湖北、福建、河北、贵州…）不计入省赛段，非江西的「暨X省赛」只计邀请赛那一次 |
| 天梯赛 | `团体` `个人` | 团体只统计国赛团队奖——分省团队奖在数据里没有成员名单，无法归属到人 |
| 百度之星 | `国赛` `省赛` | 数据只有决赛 / 初赛两档（百度之星没有省赛），胶囊里统一写成国赛 / 省赛 |
| 蓝桥杯 | `国赛` `省赛` | 优秀奖不计入（与竞赛页展示层一致） |

- 零奖牌的档位不显示；同一场团队奖，队内每人各计一枚；CCPC 女生专场不并进计数，
  按「2021 CCPC女生专场 铜牌」按届单独列一条。
- 站点数据里查不到的人（昵称、或刻意匿名）在 `honorPills.js` 的 `MANUAL_PILLS` 里逐人兜底
  （如 `vesper`）；「一位不愿透露姓名的学长」刻意匿名，其手写条目原样保留。
- **改动口径前先看 `honorPills.js` 文件头注释**——那里面是唯一权威的规则说明（含为什么这么定）。
- 胶囊样式：`src/styles/honors.css` 的 `.honor-tag--stat`（花色仍走比赛色，靠奖牌 emoji 区分档位）。

#### 卡片显示顺序（排名算法 —— 改 JSON 里的位置没有用）

优秀成员页的卡片**不按 `members.json` 里的先后顺序显示**，而是按 `src/utils/honorRanking.js`
算出的分值从高到低排。分值只来自站点自己的数据（竞赛数据 + `honors` 里的手写条目），
不依赖任何外部评级：

```
总分 = Σ(每个系列只取最高的那条奖牌 × 赛事层级权重 × 名次倍率)
                                        ← 同系列其余记录只值 10%
     + Σ(手写战绩分)                          ← 胶囊表达不了的名次类条目
     + Σ(荣誉加项) × HONOR_SCALE               ← 奖学金 / 绩点 / 职务 / 毕业去向
```

| 表 | 取值 | 位置 |
|----|------|------|
| 奖牌基分 | 金 10 / 银 5 / 铜 3（对应 ICPC 官方金银铜 ≈ 10%:20%:30% 的稀缺度） | `MEDAL_BASE` |
| 赛事层级权重 | 区域赛 1.0（基准）· 天梯赛 0.55 · 邀请赛 / 蓝桥国赛 / 百度国赛 0.5 · 女生专场 0.35 · xCPC 省赛 0.2 · 蓝桥省赛 / 百度省赛 0.12 | `LEVEL_WEIGHT` |
| 同系列只计最高 | **每个系列只把最高的那条算满分，其余一律 × 0.1**（2026-09 会长裁定：「单一比赛只计入最高，数量叠加只提供很小的贡献」）。系列 = xCPC / 天梯赛 / 蓝桥杯 / 百度之星 —— 即 xCPC 的区域赛＋邀请赛＋省赛只按最高那条算，天梯赛的团体＋个人也只按最高那条算 | `EXTRA_FACTOR` |
| 荣誉加项 | 保研 / 考研上岸 4.0 · 国奖 3.0 · 名企就业 2.5 · 绩点 / 年级第一 2.0 · 国励 1.5 · 优秀学生 / 干部 / 职务 1.0 · 党员 0.5 | `DESTINATION_RULES` `HONOR_RULES` |
| 总旋钮 | `HONOR_SCALE = 1.5`（2026-09 会长裁定：学业 / 职务类荣誉比比赛成绩略重） | `HONOR_SCALE` |

- 手写战绩按赛事关键词定层级（睿抗 0.4、传智杯 0.35、数学建模 0.45，含「区域赛 / 邀请赛 / 省赛」字样的按 xCPC 对应层级）；
  带名次的加成：冠军 ×1.6、亚军 ×1.3、**季军 ×1.2**，首刀单独 +0.5；只写赛事名没写档位的按「参赛经历」0.6 计。
  手写条目里的「×N」次数仍按 0.7 递减（会长只要求改比赛奖牌口径，手写条目保持原样）。
- **副作用要知道**：「同系列只计最高」对**奖牌多但档位平**的成员是重罚（实测李鑫 25 条奖牌从第 3 掉到第 10、
  林俊坤掉 12 位、张瑞杰掉 8 位），而对**荣誉重 / 手写条目强**的成员有利（王海峰 ↑2、李梦豪 ↑3、
  张锦宇 ↑5、吴松烨 ↑6）。想回到「区域赛与邀请赛各算一场」的粒度，就把分组键从 `family` 改回
  `family|segment`（`scoreRecords` 里一行）。
- **排序键是确定的**：总分 → 单条最高分 → 比赛记录条数 → 姓名拼音，所以同级不会每次刷新乱跳。
- 想调口径**只改 `honorRanking.js` 顶部那几张表**，不要动排序逻辑。改完把 `HONOR_SCALE`
  在 0.5 / 1 / 1.5 / 2 之间试几档：实测前 4 名在这几档下恒定，头部由比赛成绩决定。
- 数据取不到或超过 3 秒未就绪时，页面**退回 `members.json` 的原始顺序**并照常渲染，不会卡在加载态。

**添加步骤：**

1. 将成员头像放到 `public/images/excellent_member/` 目录
2. 在 `members.json` 数组末尾添加一条记录
3. 刷新页面即可看到新成员

**photo 字段**支持两种写法：
- 本地图片：`"/images/excellent_member/xxx.png"`
- 外部 URL：`"https://example.com/avatar.jpg"`

---

### 三、如何添加 / 修改 Leaders（协会负责人）

**文件：** `public/data/leaders.json`

```json
{
  "session": "2027届会长",
  "name": "李四",
  "class": "26计算机科学与技术2班",
  "avatar": "/images/leader/2027.jpg",
  "message": "对协会的寄语，一段话即可。",
  "achievements": [
    { "text": "睿抗编程技能赛国家一等奖", "type": "contest" },
    { "text": "国家奖学金", "type": "honor" },
    { "text": "...", "type": "more" }
  ]
}
```

**achievements 与优秀成员页的 honors 规则完全相同**（同一套分类与配色，见上一节）：

- **ICPC / CCPC / 天梯赛 / 百度之星 / 蓝桥杯 不要手写**：这五个系列同样由比赛战绩胶囊
  自动汇总（口径见上一节「比赛战绩胶囊」），手写的这几类条目已全部删除。
- 省略 `type` 写纯字符串（`"睿抗国一"`）也能用，由关键词规则自动归类。
- 结尾表示「还有更多荣誉」的省略号：写 `{ "text": "...", "type": "more" }` 显示成中性灰的虚线标签；
  直接写 `"..."` 也会被认出来，效果一样。

**添加步骤：**

1. 将负责人头像放到 `public/images/leader/` 目录
2. 在 `leaders.json` 数组最前面插入新一届负责人（按届数降序排列）
3. `achievements` 数组支持用 `"..."` 结尾表示"更多荣誉"

---

### 四、如何添加 / 修改 Competitions（竞赛）

**文件：** `public/data/competitions.json`

```json
{
  "slug": "icpc",
  "name": "ICPC 国际大学生程序设计竞赛",
  "image": "/images/contest/icpc.png",
  "desc": "简短描述",
  "subtitle": "国际级赛事",
  "intro": ["段落1", "段落2"],
  "details": [
    { "icon": "fa-solid fa-clock", "title": "比赛时间", "lines": ["每年9-12月"] }
  ],
  "history": [
    {
      "year": "2025",
      "entries": [
        {
          "title": "第50届 ICPC 西安邀请赛",
          "desc": "金牌（历史首金）",
          "level": "国际级",
          "members": "黄亦诚、王玛琪、石翰林"
        }
      ]
    }
  ]
}
```

#### 赛事举办时间（events 文件）

每个赛事在 `public/data/events/` 下有一个同名 JSON 文件（如 `gplt.json`），记录历届比赛的举办时间与获奖情况，**同时**驱动：

- 竞赛详情页参赛历史的 **“日期”列**（有具体日期显示完整日期，缺省回退显示年份）
- 大事记页时间轴中的 **比赛卡片**（与其他新闻卡片同样式、按日期排序，点击跳转竞赛详情页）

文件结构：

```json
{
  "slug": "gplt",
  "name": "团体程序设计天梯赛",
  "events": [
    { "year": "2026", "date": "2026-04-18", "title": "第十一届团体程序设计天梯赛", "summary": "国赛：团体🥇1🥈1🥉1、个人🥇1🥈13🥉18\n省赛：团体🥇2🥈1" },
    { "year": "2018", "date": null, "title": "第三届团体程序设计天梯赛", "summary": "国赛：团体🥈1\n省赛：团体🥇1🥈2" }
  ]
}
```

- 国赛与省赛之间用 `\n` 换行分隔（卡片内自动换行显示）；`团体`/`个人` 之间用 `、`
- 大事记页的比赛卡片点击后进入**单届比赛详情页** `/competition/<slug>/<year>`，数据来自 `public/data/editions/<slug>/<year>.json`：

```json
{
  "slug": "gplt",
  "year": "2026",
  "edition": "第十一届",
  "title": "第十一届团体程序设计天梯赛",
  "date": "2026-04-18",
  "scale": "来自全国 31 个省级行政区、595 所高校、1822 支队伍、18062 位参赛学生",
  "national": {
    "university": ["全国高校二等奖"],
    "teams": [{ "name": "JXUFE_1", "award": "全国团队一等奖", "members": "肖丛宇、钟明皓、…" }],
    "personal": [{ "name": "钟明皓", "award": "个人一等奖", "score": 256 }]
  },
  "provincial": {
    "university": ["江西省高校一等奖"],
    "teams": [{ "name": "JXUFE_1", "award": "分省团队一等奖" }]
  }
}
```

- `date` 未知填 `null`；`university` 为高校奖（学校获奖），`teams` 为团队奖（含成员），`personal` 为个人奖（含成绩），全部为空时详情页显示"本届无我校获奖记录"

> **参赛历史表**：存在 `editions/` 数据的赛事（当前为天梯赛），其竞赛详情页参赛历史自动渲染为"日期 / 届数 / 队名 / 国赛 / 省赛 / 参赛成员"六列表格（数据直接来自 events + editions，无需在 `competitions.json` 的 `history` 中重复维护）：同届多队合并日期与届数格子；成员姓名按个人奖项以金/银/铜牌色标注（未获奖为默认色）。其余赛事仍使用通用表格（`history` 字段）。

- `date` 为 `YYYY-MM-DD`；**未知日期填 `null`**（参赛历史回退显示年份，大事记卡片显示"2018年"并排在该年最后）
- `summary` 为获奖情况说明文本，显示在时间轴卡片上（取自协会工作目录 `01_竞赛赛季/天梯赛/` 下的各年获奖名单，提取后落盘到本文件，网页只读此文件）
- `title` 用于参赛历史表格按年份匹配日期，建议与 `history.entries[].title` 一致
- 新增赛事时需同步在 `public/data/events/index.json` 中登记 `slug` + `name`

### 五、维护页面导航

**文件：** `src/data/navigation.js`

修改导航文字、顺序、页脚链接。也是 JSON 结构，修改后刷新即可。

---

## 🎨 自定义样式

- **主题色 / 间距 / 阴影 / 字体：** `src/styles/tokens.css`
- **全局样式 / 动画：** `src/styles/base.css`
- **组件样式：** 每个 `.vue` 文件中的 `<style scoped>` 块

本项目不使用任何 UI 框架，所有样式均为手写 CSS，修改自由度极高。

### 两个页面的卡片排布（**不一样，别互相照搬**）

| 页面 | 排布 | 说明 |
|------|------|------|
| 优秀成员页 `/excellent` | **瀑布流** | 33 张卡、4 列，高度差异大 —— 逐张放进当前最短的列（保持源顺序），不浪费竖向空间 |
| 协会负责人页 `/leader` | **等高行** | 6 张卡、2 列 —— 同一行的两张卡上下边对齐，矮卡被拉到本行最高那张的高度 |

**优秀成员页**用瀑布流，算法在 `src/composables/useMasonry.js`，页面里只有一句
`const { containerRef } = useMasonry()`。改了卡片内容长短（多一条荣誉、换句寄语）不需要动任何布局代码
——卡片高度一变会自动重排。要调列数 / 间距，改 `ExcellentView.vue` 的 `<style scoped>` 里 `.grid` 上的两个变量：

```css
.grid {
  --masonry-columns: 4;           /* 列数，媒体查询里逐档改成 3 / 2 / 1 */
  --masonry-gap: var(--space-lg); /* 卡片间距 */
}
```

列数与断点必须写在这两个变量里（而不是 `grid-template-columns`）——JS 只读变量、负责算位置和容器高度；
`grid-template-columns` 那套留着只是 JS 接管前的兜底。改完记得跑一次 `npm run build` 看效果。

**协会负责人页刻意不用瀑布流**（会长 2026-09-22：「每行卡片还是要等高的」）：就是纯 CSS grid 的
`align-items: stretch`，没有 JS 参与。矮卡多出来的空白留在**卡片底部**，荣誉胶囊仍紧跟寄语、不贴底。
想在这一页也改用瀑布流：给 `.leader-grid` 加回 `--masonry-columns` / `--masonry-gap` 两个变量，
在页面里引 `const { containerRef } = useMasonry()`，并把 `ref="containerRef"` 挂到 `.leader-grid` 上。

---

## 📄 路由一览

| 路径 | 页面 | 数据源 |
|------|------|--------|
| `/` | 首页 | `actions.json`（最近 5 条） |
| `/all-action` | 大事记 | `actions.json`（全部，按年分组） |
| `/action/:slug` | 大事记详情 | `actions.json` |
| `/contest` | 竞赛信息 | `competitions.json` |
| `/competition/:slug` | 竞赛详情 | `competitions.json` |
| `/leader` | 协会负责人 | `leaders.json` |
| `/excellent` | 优秀成员 | `members.json` |
| `/links` | 友链 | `links.json` |

---

## ⚠️ 网站未更新？

如果你提交了 Pull Request 并被合并到 `master` 分支，但网站迟迟没有更新：

**联系 QQ：3200513041**

---

> 由原静态站 `jxufe-acm.cn` 迁移重构而来，以现代化前端工程体系重新组织。
