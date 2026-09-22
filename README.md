# 江西财经大学程序设计竞赛协会

江西财经大学 ACM 程序设计竞赛协会官方网站，基于 Vue 3 重构的单页应用（SPA）。

在线地址：**https://jxufe-acm.cn**

---

## ✨ 特性

- **Vue 3 组件化** — `<script setup>` + Composition API，路由级懒加载，首屏极速
- **内容数据驱动** — 新闻、竞赛、成员、负责人、友链等全部抽离为 JSON，增删改无需改代码
- **首页头像墙** — hero 区底纹：成员头像铺成一面缓慢漂移的墙，点按钮切换成可悬停交互的成员墙（见「头像墙」一节）
- **手写 CSS 体系** — 设计令牌（`tokens.css`）+ 全局基础样式 + 组件 Scoped，无 UI 框架依赖
- **滚动入场动画** — 基于 IntersectionObserver 的 `v-reveal` 指令，声明式使用
- **大事记 Block 渲染** — 类型化内容块系统，支持 13 种块类型（文本、图片、奖项、表格、FAQ 等）
- **全局交互特效** — 光标涟漪（`useCursorRipple`）、代码拖尾（`useCodeTrail`）、骨架屏加载态
- **响应式设计** — 适配桌面端与移动端，导航栏支持汉堡菜单

> 📖 **要往网站里加内容，先看 [`knowledge.md`](./knowledge.md)** —— 它按「我要做什么」组织，
> 逐字段说明大事记 / 获奖记录 / 优秀成员 / 负责人 / 头像墙怎么加，以及怎么部署。
> 本 README 偏技术实现。

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
│   │   ├── awards/                # ★★ 获奖数据唯一真源（每个赛事一个文件，见「获奖数据格式」）
│   │   │   ├── icpc.json          # ICPC 获奖（团队赛）
│   │   │   ├── ccpc.json          # CCPC 获奖（团队赛）
│   │   │   ├── gplt-team.json     # 天梯赛（国赛）团队奖
│   │   │   ├── gplt-individual.json # 天梯赛（国赛）个人奖
│   │   │   ├── lanqiao.json       # 蓝桥杯（单人赛）
│   │   │   ├── baidu.json         # 百度之星（单人赛）
│   │   │   └── chuanzhi.json      # 传智杯（单人赛，暂空）
│   │   ├── competitions.json      # 竞赛展示元信息：slug / 名称 / logo / 简介 / 详情卡 / mode / awards / sessions
│   │   ├── events/                # ★ 大事记的全部数据（一年一个文件，卡片 + 文章正文）
│   │   │   │                       #   与 competitions.json / awards/ 完全独立，允许重复
│   │   │   ├── top.json           # 置顶卡片
│   │   │   └── <year>.json        # 该年全部数据：{ cards: [...], articles: { <id>: {...} } }
│   │   │                           #   每张卡片的 link 恒等于本文件 articles 里的一个 key
│   │   ├── leaders.json           # 历届协会负责人
│   │   ├── members.json           # 优秀成员列表
│   │   ├── hero_wall.json         # ★ 头像墙悬浮卡片的文案（手写；key = 图片文件名）
│   │   ├── hero_wall.manifest.json # 头像墙图片清单（由 scripts/gen_hero_wall.mjs 生成）
│   │   └── links.json             # 友情链接
│   └── images/                    # 静态图片
│       ├── slider/                # 首页轮播图（slider1.jpg ~ slider10.jpg）
│       ├── contest/               # 竞赛 logo
│       ├── leader/                # 负责人头像（2021.jpg ~ 2026.jpg）
│       ├── excellent_member/      # ★ 头像墙图片真源（一个文件一个人）
│       ├── hero_wall_thumbs/      # 头像墙缩略图 384/ 与 256/ 两档（由 ps1 脚本生成）
│       ├── links/                 # 友链 logo + 二维码
│       └── ...
├── knowledge.md                   # ★ 内容维护手册（加内容 / 改字段 / 部署，面向内容维护者）
├── scripts/
│   ├── check_awards.mjs           # 全量数据校验
│   ├── gen_events_articles.mjs    # 由 scripts/source/ 生成「赛事卡片」的大事记文章
│   ├── gen_hero_wall.mjs          # 扫头像墙图片目录 → 生成清单 + 补齐文案骨架（挂在 predev/prebuild）
│   ├── gen_hero_wall_thumbs.ps1   # 生成头像墙缩略图（本地 Windows 专用，不参与服务器构建）
│   └── source/                    # 生成器专用输入（不参与运行时，不部署）
│       ├── editions/gplt/<年>.json    # 天梯赛：国赛/省赛 × 高校奖/团队奖/个人奖 + scale
│       ├── editions/lanqiao/<年>.json # 蓝桥杯：国赛/省赛 × 个人奖（含科目/排名）
│       └── baidu.json                 # 百度之星：决赛/初赛场次 × 获奖名单

└── src/
    ├── main.js                    # 应用入口
    ├── App.vue                    # 根组件（Header + RouterView + Footer + FloatingJoin）
    ├── router.js                  # 10 条路由，全部懒加载
    ├── styles/
    │   ├── tokens.css             # 设计令牌（颜色 / 阴影 / 圆角 / 间距 / 字体）
    │   ├── base.css               # CSS 重置 + 全局样式 + 动画关键帧
    │   └── index.css              # 样式入口
    ├── components/
    │   ├── AppHeader.vue          # 导航栏（滚动变色 + 移动端汉堡菜单）
    │   ├── AppFooter.vue          # 页脚（三栏布局 + ICP 备案）
    │   ├── FloatingJoin.vue       # 右下角悬浮"加入我们"按钮
    │   ├── HeroAvatarWall.vue     # ★ 首页 hero 头像墙（环面漂移 + 悬停卡 + 触屏交互 + 开关按钮）
    │   ├── action/
    │   │   ├── BlockRenderer.vue  # 大事记块类型渲染器
    │   │   └── OrganizerGrid.vue  # 招新二维码卡片网格
    │   └── lanqiao/
    │       └── RosterGroup.vue    # 获奖分组名单（奖等徽章 + 姓名表格）
    ├── composables/
    │   ├── useJson.js             # 通用 JSON 数据加载器
    │   ├── useNews.js             # 首页最新动态（从 events/ 按年取最近 5 条新闻）
    │   ├── useTimeline.js         # ★ 大事记数据源（按年懒加载 + 归一化 + 分组）
    │   ├── useSkeleton.js         # 骨架屏占位
    │   ├── useCodeTrail.js        # 代码字符拖尾特效
    │   └── useCursorRipple.js     # 光标涟漪特效
    ├── directives/
    │   └── reveal.js              # v-reveal 滚动入场指令
    ├── data/
    │   └── navigation.js          # 导航菜单 + 页脚链接
    ├── utils/
    │   ├── inline.js              # 内联标记解析（**加粗**、[链接](url)）
    │   ├── awardGroups.js         # ★ 获奖数据展示工具（两个竞赛页共用）
    │   └── eventsSource.js        # ★ 大事记数据源读写封装（events/ 目录唯一入口：卡片/置顶/索引/文章）
    └── views/
        ├── HomeView.vue           # 首页 /
        ├── AllActionView.vue      # 大事记列表 /all-action
        ├── PostView.vue           # 大事记文章 /post/:id（新闻 / 战报 / 赛事卡片文章共用）
        ├── ContestView.vue        # 竞赛信息 /contest
        ├── CompetitionDetailView.vue  # 竞赛详情 /competition/:slug
        ├── CompetitionEventView.vue   # 单届详情 /competition/:slug/:year
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

> ⚠️ `preview` 的地址必须用 **http://localhost:4173** —— 别用 `127.0.0.1`。
> Vite 只监听了 IPv6 的 `::1`，用 `127.0.0.1` 会得到「连接被拒绝」。

`dev` 与 `build` 都会先自动执行 `scripts/gen_hero_wall.mjs`（`predev` / `prebuild` 钩子），
重扫头像墙图片目录 —— 所以往 `public/images/excellent_member/` 丢完图，不用手动跑任何命令。
唯一的例外是**缩略图**，它得单独跑：

```bash
npm run data:hero-wall      # 只重扫清单（dev/build 会自动跑，一般不用手动）
npm run data:hero-thumbs    # 生成头像墙缩略图 ← 加图后必须跑，不会自动
npm run data:check          # 数据校验
```

## 📦 部署

**双击 `deploy.bat` 即可**（Windows 一键脚本，SSH 密钥免密登录，全程无需输入密码）。

脚本按顺序做五件事，任何一步失败都会停下并打印原因：

| 步骤 | 做什么 |
|---|---|
| 1 | 本地检查：部署密钥、`src/main.js`、`package.json`、`tar` 是否就位 |
| 2 | 把 `src` `public` `package.json` `package-lock.json` `vite.config.js` `index.html` `scripts/gen_hero_wall.mjs` 打成 tar.gz |
| 3 | 上传到服务器 `/tmp`，解包到 `/var/www/jxufe_acm_vue`（会先删掉远端的旧 `src` 与 `public`） |
| 4 | 服务器上 `npm install` + `npm run build`（`prebuild` 钩子会自动重扫头像墙清单） |
| 5 | `nginx -t` → `systemctl reload nginx` → curl 验证站点返回 `HTTP 200` |

最后打印 `Deploy success!` 与 `https://jxufe-acm.cn`。

| | |
|---|---|
| 服务器 | `root@47.99.92.213` |
| 站点目录 | `/var/www/jxufe_acm_vue`（Nginx 根目录是其中的 `dist/`） |
| 登录方式 | SSH 密钥 `.deploy/id_ed25519`（**不要删、不要外传**，已在 `.gitignore` 里） |

> **每次都是全量上传 `src` 与 `public`**（约 36 MB），不做增量比对 —— 用一轮 tar 换掉逐文件
> 判断，出问题的可能性更低。第一次部署与第十次耗时相同。

> ⚠️ **头像墙的缩略图必须在本地先生成**（`npm run data:hero-thumbs`）——
> 那个脚本依赖 Windows 的图形库，服务器是 Linux 跑不了。忘了跑不会坏版（会回退加载原图），只是慢。
> 图片清单则相反，服务器构建时会自动重扫。

详见 `deploy.bat` 内注释，以及 [`knowledge.md` 第 7 节](./knowledge.md)。

---

## 📝 内容维护指南

> 📖 **只想加内容、不想读代码？直接看 [`knowledge.md`](./knowledge.md)。**
> 那份文档按「我要做什么」组织（开头就是速查表），逐字段说明大事记 / 获奖记录 /
> 优秀成员 / 协会负责人 / 首页头像墙怎么改，以及更新部署的全流程。
> 下面这一节讲的是**数据格式与设计取舍**，偏实现。

所有可变内容存放在 `public/data/` 目录下的 JSON 文件中。**修改后刷新页面即可生效，无需重启，无需重新构建。**

> **注意：** 如果你提交了 Pull Request 并被合并，但网站迟迟没有更新，请联系 **QQ：3200513041** 手动触发部署。

---

### 一、如何添加 / 修改 News（大事记）

大事记的数据**全部在 `public/data/events/` 一个目录里，一年一个文件**：

| 文件 | 装什么 |
|---|---|
| `events/top.json` | 置顶卡片（扁平数组；置顶的不要同时留在年份文件里） |
| `events/<年>.json` | 该年**全部**数据：`cards`（时间轴卡片）+ `articles`（该年所有文章正文，key = id） |

```
events/2026.json
├── cards     [ { kind, date, category, title, tagline, link }, … ]   19 张时间轴卡片
└── articles  { "<id>": { title, date, subtitle?, blocks }, … }        16 篇文章正文
```

> **为什么卡片和正文不分成两个文件**：HTTP 只能整文件下载。放在同一个文件里，从时间轴点开文章时正文已经在内存里（**0 额外请求**）；代价是只看时间轴的访客也要把该年正文一起下载（首屏约 123 KB，压成单行约 69 KB）。这个取舍是按「一年一个文件」的要求做的。

#### 添加一条新 News

**两步，都在同一个文件 `public/data/events/<年>.json` 里：**

**① 在 `articles` 里写正文**（key = 文章 id）：

```json
"articles": {
  "2026-6-27-new-contest": {
    "title": "我校在XX竞赛中取得佳绩",
    "date": "2026-06-27",
    "subtitle": "副标题（可省略，仅详情页显示）",
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
}
```

**② 在同一个文件的 `cards` 里加一张时间轴卡片**（字段顺序保持 `kind, date, category, title, tagline, link`）：

```json
{
  "kind": "news",
  "date": "2026-06-27",
  "category": "club",
  "title": "我校在XX竞赛中取得佳绩",
  "tagline": "简短的摘要描述",
  "link": "2026-6-27-new-contest"
}
```

`link` 就是 ① 里的 id（**纯 id，不带任何路由前缀**）—— 值必须与 `articles` 的 key 完全一致。

> 全部 114 张卡片的 `link` 无一例外都是 `articles` 里的 key。赛事卡片（天梯赛 / 蓝桥杯 / 百度之星）的文章由 `scripts/gen_events_articles.mjs` 从 `scripts/source/` 生成，见下文「大事记与竞赛数据的关系」。

- 要**置顶**：卡片放到 `public/data/events/top.json`（数组最前面 = 最先显示），**正文照旧写在年份文件的 `articles` 里**。切勿两处都放卡片，否则时间轴会出现两次（校验会报「新闻在时间轴里重复出现」）
- 卡片的 `title` / `date` 必须与 `articles` 里那条一致，校验脚本会强制检查
- 只想给个直达链接、**不上时间轴**：就只写 `articles`，不写 `cards`（校验会把它记为「无卡片入口的文章」，这是允许的）
- 加完跑 `npm run data:check` 校验。**没有索引文件需要维护**：目录里有哪些年份由前端自动探测，月份与分类计数随年份文件加载实时算出

---

### 二、如何添加 / 修改 Members（优秀成员）

**文件：** `public/data/members.json`

```json
{
  "name": "张三",
  "class": "22计算机科学与技术1班",
  "photo": "/images/excellent_member/zhangsan.png",
  "honors": [
    "2024 ICPC 区域赛金牌",
    "蓝桥杯国家级一等奖",
    "保研至XX大学"
  ]
}
```

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
    "ICPC 区域赛银牌",
    "天梯赛个人国家级一等奖",
    "..."
  ]
}
```

**添加步骤：**

1. 将负责人头像放到 `public/images/leader/` 目录
2. 在 `leaders.json` 数组最前面插入新一届负责人（按届数降序排列）
3. `achievements` 数组支持用 `"..."` 结尾表示"更多荣誉"

---

### 四、如何添加 / 修改 Competitions（竞赛）

竞赛相关数据分三层，各司其职：

| 文件 | 职责 | 是否含获奖数据 |
|---|---|---|
| `public/data/awards/*.json` | **获奖数据唯一真源** | ✅ 是 |
| `public/data/competitions.json` | 展示元信息（名称 / logo / 简介 / 详情卡 / 渲染模式 / 年份→届数） | ❌ 否 |
| `public/data/events/` | 大事记时间轴节点（该年的新闻 + 比赛卡片） | ❌ 否 |

---

#### 4.1 获奖数据 `public/data/awards/*.json`

**这是获奖数据的唯一来源。** 竞赛详情页与单届详情页的获奖名单、参赛历史、分组名单全部由它渲染，字段使用统一 schema（不再有 `history` / `editions` 两套并存的数据）。

| 文件 | 赛事 | 记录粒度 |
|---|---|---|
| `icpc.json` | ICPC | 一支队伍在一个场次中的成绩 |
| `ccpc.json` | CCPC | 同上 |
| `gplt-team.json` | 天梯赛（仅国赛） | 一支队伍 |
| `gplt-individual.json` | 天梯赛（仅国赛） | 一个人 |
| `lanqiao.json` | 蓝桥杯 | 一个人次 |
| `baidu.json` | 百度之星 | 一个人次 |
| `chuanzhi.json` | 传智杯 | 一个人次（当前为空数组） |

**团队赛（ICPC / CCPC）**——数组，按 `date` 升序：

```json
{
  "competition_name": "ICPC全国邀请赛（南昌）暨江西省赛",
  "medal_level": "invitational",
  "team_name": "天空之矛",
  "medal_type": "bronze",
  "members": ["张瑞杰", "曹京顺", "李鑫"],
  "coach_names": [],
  "date": "2026-05-24"
}
```

**天梯赛团队奖（gplt-team）**——无 `medal_level`（数据源只收录国赛）：

```json
{ "session": 11, "team_name": "JXUFE_C1", "medal_type": "gold", "members": ["…"], "coach_names": ["李季"], "date": "2025-04-19" }
```

**单人赛（gplt-individual / lanqiao / baidu / chuanzhi）**——`members` 固定一个元素；蓝桥杯额外含 `language` / `group`：

```json
{
  "session": 17,
  "members": ["万俊哲"],
  "language": "C++",
  "group": "B",
  "medal_level": "provincial",
  "medal_type": "gold",
  "coach_names": [],
  "date": "2026-04-12"
}
```

字段取值：

| 字段 | 取值 |
|---|---|
| `session` | 届数（int），如 `11` = 第十一届 |
| `medal_level` | `regional` / `invitational` / `provincial` / `final`（团队赛）；`provincial` / `national`（单人赛） |
| `medal_type` | `gold` / `silver` / `bronze`（分别渲染为 金/银/铜奖 或 一/二/三等奖） |
| `language` | `C++` / `Java` / `Python` / `null`（仅蓝桥杯） |
| `group` | `A` / `B` / `研究生组` / `null`（仅蓝桥杯） |
| `date` | `YYYY-MM-DD`；**未知填 `null`**（数组内 `null` 排末尾） |

> 新增/修改获奖记录：直接编辑对应文件即可（保持数组按 `date` 升序、`null` 末尾）。
> 改完执行 `npm run data:check` 校验格式。

#### 4.2 赛事元信息 `public/data/competitions.json`

只放展示所需字段，**不含任何获奖记录**：

```json
{
  "slug": "gplt",
  "name": "团体程序设计天梯赛",
  "shortName": "团体程序设计天梯赛",
  "image": "/images/contest/gplt.png",
  "desc": "简短描述",
  "subtitle": "副标题",
  "intro": ["段落1", "段落2"],
  "details": [
    { "icon": "fa-solid fa-clock", "title": "比赛时间", "lines": ["每年 4 月"] }
  ],
  "mode": "gplt",
  "awards": ["gplt-team", "gplt-individual"]
}
```

- `shortName`：届次标题用的简称（如「第十七届**蓝桥杯**（2026年）」）
- `mode`：决定竞赛详情页用哪种渲染，`xcpc`（团队赛表格）/ `gplt`（天梯赛六列表）/ `roster`（分组名单）/ `none`（无数据）
- `awards`：该赛事对应的 `awards/*.json` 文件名列表；视图只用这个列表去加载获奖数据，**新增赛事时改这里即可，无需改代码**
- `sessions`：`{ "年份": 届数 }` 对照表，供单届详情页把 URL 里的自然年换算成 awards 的 `session`（如 `{"2026": 11}`）。ICPC/CCPC 标题不含届数，故为空对象
- 页面标题里的 xCPC 合并页（`/competition/xcpc`）由代码在运行时合并 `icpc` + `ccpc` 得到

#### 4.3 大事记时间轴 `public/data/events/`

**一年一个文件**，该年的卡片与全部文章正文都在里面：

```
events/
├── top.json      置顶卡片（扁平数组）
├── 2026.json     { cards: [...19 张卡片], articles: {...16 篇文章} }
├── 2025.json     { cards: [...24], articles: {...25} }
└── …             共 17 个年份文件
```

**`cards`** —— 该年的时间轴卡片，按 `date` 倒序、`null` 排最后。`year` 由文件名给出，卡片内不重复存：

```json
{
  "kind": "event",
  "date": "2026-04-18",
  "category": "tts",
  "title": "第十一届团体程序设计天梯赛",
  "tagline": "时隔八年，再夺团队国一",
  "link": "2026-4-18-gplt"
}
```

| 字段 | 说明 |
|---|---|
| `kind` | `news`（新闻）或 `event`（比赛） |
| `date` | `YYYY-MM-DD` / `YYYY-MM` / `YYYY`，**未知填 `null`**（此时按所在年份文件归年） |
| `category` | 决定卡片左边框配色与筛选 chips，取值见下 |
| `title` | 卡片标题 |
| `tagline` | 卡片正文 |
| `link` | **纯 id**，恒等于本文件 `articles` 里的一个 key（不允许出现 `/`）。路由侧固定拼成 `/post/<id>` |

**`articles`** —— 该年所有文章的正文，key 是文章 id，内容 `{ title, date, subtitle?, blocks }`。

id 统一为 `<年>-<月>-<日>-<名字>` 风格（月/日不补零，与 `date` 字段的补零写法不同），例如：

| 类型 | id 示例 |
|---|---|
| 协会新闻 | `2026-8-24-xcpc-select` |
| 比赛战报 | `2026-7-29-icpc-invitational-shenyang` |
| 省赛战报 | `2024-5-12-gxcpc9th` |
| 赛事卡片文章（生成） | `2026-4-18-gplt`、`2026-4-12-lanqiao-provincial`、`2026-9-3-baidu-preliminary-1` |

> **新闻的卡片标题与文章标题必须一致**；**战报/赛事的卡片是短标签（「ICPC全国邀请赛（沈阳）」）、文章是官方全称（「2026 年 ICPC 国际大学生程序设计竞赛全国邀请赛（沈阳）」），故意不同**，校验脚本对此不作要求。
> **没有卡片入口的文章**（参赛但未获奖的场次、网络预选赛共 44 篇）也在 `articles` 里，手输 `/post/<id>` 能打开，但不上时间轴。

### 没有索引文件：年份是自动探出来的

`public/data/events/` 里**只有一个 `top.json` + 若干个 `<年>.json`**，没有 index 之类的清单文件。
静态站没法列目录，所以前端启动时自己探一遍（`src/utils/eventsSource.js` 的 `discoverYears()`）：

1. 从「今年 + 1」向上探 1 年（新一年的文件可能已准备好）
2. 从今年开始向下，**每批 24 年并行发 `HEAD` 请求**（无响应体，一次往返）
3. 某一批的末尾连续两年都不存在 → 认为到底了，停止
4. 结果缓存在模块作用域，一次会话只探一次

> ⚠️ 探测会同时检查 `content-type`。很多托管（含 `vite preview`）对不存在的路径也返回
> `200 + index.html`（SPA 兜底），只看状态码会把所有年份都误判为存在。

实测：17 个年份文件 → 25 个 HEAD 请求（一批并发，约一次往返）。

**新增一年的数据，不需要改任何配置**：放上 `2027.json`，刷新页面侧栏就有 2027。

其余东西全部由读到的文件实时算出，也不存在需要重建的派生文件：

| 界面上的 | 怎么来的 |
|---|---|
| 侧栏年份列表 | `discoverYears()` 的探测结果 |
| 侧栏月份 | 该年文件加载完成后，从卡片日期算出（未加载则该年不展开月份） |
| 分类 chips 计数 | 已加载年份的卡片 + `top.json` 实时统计（点「全部」后即全量） |
| 打开某篇文章 | id 前 4 位就是年份（如 `2026-4-18-gplt` → `2026.json`），不需要 id→年份 映射表 |
| 首页「最新动态」5 条 | 从最新年份往下读，凑够 5 条新闻就停（最多读 3 个年份文件） |


### 大事记与竞赛数据的关系

两者是**完全独立的两套数据**，刻意允许重复：

| | 大事记 | 竞赛信息 / 获奖列表 |
|---|---|---|
| 数据 | `public/data/events/`（自给自足） | `public/data/competitions.json` + `awards/*.json` |
| 入口 | `/all-action` → `/post/<id>` | `/contest` → `/competition/<slug>` |
| 获奖内容 | 写死在文章 `blocks` 里（团队奖全列 + 省赛/国赛个人奖统计表） | 由结构化获奖记录实时渲染 |
| 维护 | 编辑文章 JSON（赛事文章可由脚本重新生成） | 维护 `awards/*.json` |

改一边不会影响另一边。大事记文章末尾的 `related` block 只是**一个链接**，指向 `/competition/<slug>` 竞赛介绍页，不产生数据依赖。

**赛事卡片文章重新生成**（源数据在 `scripts/source/`，改完重跑即可）：

```bash
node scripts/gen_events_articles.mjs   # 幂等：重复运行结果一致
```

它会为每张 `赛事卡片` 生成：摘要（赛事规模）→ 国赛/省赛 `heading` → 高校奖/团队奖 `awards` block → 个人奖 `table`（组别 / 奖项 / 人数 / 名单）→ `related` 链接。

`category` 取值（侧栏分类 chips 与卡片配色共用）：

| 值 | 含义 | | 值 | 含义 |
|---|---|---|---|---|
| `inv` | 邀请赛 | | `lanqiao` | 蓝桥杯 |
| `reg` | 区域赛·全国赛 | | `chuanzhi` | 传智杯 |
| `prov` | 省赛·区赛 | | `baidu` | 百度之星 |
| `net` | 网络赛 | | `school` | 校赛 |
| `tts` | 天梯赛 | | `club` | 社团活动 / `other` 其他 |

**加载策略**（`useTimeline.js` / `useNews.js` / `eventsSource.js`）：

| 时机 | 请求 |
|---|---|
| 首页 LATEST NEWS | `top.json` + 最新的 1~3 个年份文件（凑够 5 条新闻就停） |
| 大事记首屏 | `top.json` + **最新的两个年份**（年份清单由启动时的探测得到） |
| 点击侧栏某年 | 该年文件（首次，之后走内存缓存） |
| 打开一篇文章 | id 前 4 位就是年份 → 该年文件；**若从时间轴点进去则该年已在内存，0 请求** |

> 已加载的年份文件会被缓存（`eventsSource.js`），所以同一页面内点开文章不会再发请求。

#### 4.4 单届页如何取数

`/competition/<slug>/<year>` 的数据全部来自 `competitions.json` + `awards/*.json`（两次请求，无 events 文件）：

1. 读 `comp.sessions[year]` 得到该届的 `session`（届数）
2. 加载该赛事 `awards` 列出的文件
3. 按 `session` 过滤，再按 `medal_level` 分成「国赛 / 省赛」两段
4. 段内按有无 `team_name` 区分团队奖（卡片）与个人奖（蓝桥杯走分组名单，其余走表格）

> **参赛历史表**：`mode` 决定渲染形态——
> - `xcpc`：按场次分组的「日期 / 赛事 / 队名 / 成绩 / 参赛成员」表格（数据来自 `awards/icpc|ccpc.json`，**只含获奖记录**）
> - `gplt`：「日期 / 届数 / 队名 / 国赛 / 省赛 / 参赛成员」六列表格，成员姓名按 `gplt-individual.json` 的个人奖以金/银/铜牌色标注
> - `roster`：按届 → 国赛/省赛 → 分组 → 奖等 → 姓名的分组名单（蓝桥杯按语言×组别分组）
>
> 表格与卡片视图可切换（桌面默认表格、移动端默认卡片，选择记入 localStorage）。

- 新增赛事时需要：① `competitions.json` 加条目（含 `shortName` / `mode` / `awards` / `sessions`）；② 按需新增 `awards/<file>.json`；③ 若该赛事要上大事记时间轴，再往 `events/<年>.json` 加卡片 + 一篇自己的文章（两者互不影响）

### 五、维护页面导航

**文件：** `src/data/navigation.js`

修改导航文字、顺序、页脚链接。也是 JSON 结构，修改后刷新即可。

---

## 🖼 头像墙（首页 hero 底纹）

组件：`src/components/HeroAvatarWall.vue` ｜ 数据：`public/data/hero_wall*.json` ｜
图片：`public/images/excellent_member/` ｜ 缩略图：`public/images/hero_wall_thumbs/{384,256}/`

首页 hero 铺一层成员头像，**两种状态共用同一套几何**（同样的瓷砖、同样的环面），切换只是一次纯淡入淡出，
不重排、不重启动画：

| | 底纹态（默认） | 激活态（点「成员墙」按钮） |
|---|---|---|
| 不透明度 | `0.18`（`dimOpacity`） | `1` |
| 速度 | `11 px/s`（`speedBackdrop`） | `22 px/s`（`speed`） |
| 悬停 | 该格亮起并模糊成一团软斑 | 弹出姓名 / 班级 / 奖项卡片 |
| 点击 | 无响应 | 触屏弹居中卡 |
| 其他 | 文案与轮播正常 | 文案与轮播淡出、顶栏加白纱+阴影 |

### 运动模型：一张环面 + 两条锯齿

把整面墙铺成一张**环面** —— 第 `(r, c)` 格取 `list[((r % Py) * Px + (c % Px)) % n]`
（横向周期 `Px` 列、纵向周期 `Py` 行）。环面的周期是轴对齐的，所以要让两个轴**各自**走满一个周期
（`0 → ±Px·step`、`0 → ±Py·step`，时长各 = 自己的周期 ÷ 自己轴上的速度）：
任一轴走到头时画面正好平移了自己一整个周期，**逐像素与起点相同**，那次跳回看不见；
两个轴各跳各的，合起来就是一条**任意角度的匀速直线**。

- ⚠️ 两条动画必须落在**两个不同的元素**上（这里是两层嵌套 wrapper），否则同元素上的两条
  `transform` 动画会互相覆盖。刻意**不用 `translate` 这个独立变换属性** —— 它 iOS 14.1 以下
  不支持，一旦不支持横向那条整条失效。
- ⚠️ 前提是**瓷砖边界本身不可见**（gap 0、无边框、无圆角）。给瓷砖加圆角或间隙，这套立刻就露馅。
- 周期取值：装得下所有图（`Px × Py ≥ n`）**且**不小于视口（视口里看不到重复图案），
  在此前提下取网格总格数最小的一组。tile 只给目标值，实际尺寸由组件按容器盒子扫描决定。
- **图不够会重复**：`n` 张图铺 `m` 格就重复 `⌈m/n⌉` 次。往图片目录加图不用改代码 ——
  `n` 变大 → 周期变大 → 重复自然减少。

### 响应式与兼容

- 几何量的是**组件自己的盒子**（= hero 的盒子）而不是视口 → 手机地址栏收放、横竖屏切换、
  `min-height: auto` 全都自动跟随；`100vh` 而非 `dvh`，避免地址栏变化导致几何反复重算。
- 瓷砖尺寸由 CSS 变量 `--wall-tile` + 媒体查询分档（188 / 148 / 132 / 96 px），组件读它再扫描，
  断点因此留在 CSS 里。
- 交互按能力检测分两套：`(hover: hover) and (pointer: fine)` → 悬停卡；否则 → 点击弹居中卡。
- 瓷砖必须 `touch-action: pan-y`，否则墙会吃掉触摸事件、手机上在 hero 区域滑不动页面。
- 悬停穿透：`.hero-inner` 设 `pointer-events: none`，只给圆点和按钮放行；
  激活态改用 `visibility: hidden`（保留布局占位、同时退出命中测试与绘制）。

### 增删图片

见 [`knowledge.md` 第 6.1 节](./knowledge.md) —— 一句话版本：**图片丢进
`public/images/excellent_member/`，然后 `npm run data:hero-thumbs`**（清单会在 dev/build 时自动重扫）。

---

## 🎨 自定义样式

- **主题色 / 间距 / 阴影 / 字体：** `src/styles/tokens.css`
- **全局样式 / 动画：** `src/styles/base.css`
- **组件样式：** 每个 `.vue` 文件中的 `<style scoped>` 块

本项目不使用任何 UI 框架，所有样式均为手写 CSS，修改自由度极高。

---

## 📄 路由一览

| 路径 | 页面 | 数据源 |
|------|------|--------|
| `/` | 首页 | `events/top.json` + 最新 1~3 个年份文件，直接拼 `/post/<id>`；hero 底纹另有 `hero_wall.manifest.json` + `hero_wall.json` |
| `/all-action` | 大事记 | `events/`（置顶 + 年份文件按需懒加载，年份靠 HEAD 探测，**无索引文件**） |
| `/post/:id` | 大事记文章（新闻 / 战报 / 赛事，共用一页） | `events/<年>.json` 的 `articles`（**靠 id 前 4 位定位年份文件**） |
| `/contest` | 竞赛信息 | `competitions.json`（元信息） |
| `/competition/:slug` | 竞赛详情 | `competitions.json` + `awards/*.json` |
| `/competition/:slug/:year` | 单届获奖详情 | `competitions.json`（sessions）+ `awards/*.json` |
| `/leader` | 协会负责人 | `leaders.json` |
| `/excellent` | 优秀成员 | `members.json` |
| `/links` | 友链 | `links.json` |
| `*` | 404 | — |

---

## ✅ 数据校验

```bash
npm run data:check         # 全量校验（awards + competitions + events + top）
npm run data:gen           # 由 scripts/source/ 重新生成「赛事卡片」的大事记文章（幂等）
npm run data:hero-wall     # 重扫头像墙图片目录，刷新清单并补文案骨架（幂等，dev/build 会自动跑）
npm run data:hero-thumbs   # 生成头像墙缩略图（384/256 两档；增量，本机 Windows 专用）
```

`check_awards.mjs` 校验内容：

- `awards/*.json`：字段名与顺序、枚举取值、类型、日期格式与升序排列
- `competitions.json`：`awards` 引用、`shortName`、`sessions` 合法性
- `events/<年>.json` 的 `cards`：字段与顺序、`kind` / `category` 取值、`link` 必须是纯 id（不含 `/`）、日期倒序
- `events/<年>.json` 的 `articles`：文章字段与顺序、`blocks` 非空、日期年份与所在文件一致、`related` block 指向的赛事必须存在、**id 必须以所在年份开头**（前端靠它定位文件）
- `events/top.json`：节点格式，且置顶条目不得在年份文件里重复出现
- **每一张卡片的 `link` 必须在 `articles` 里存在对应文章**，`date` 与卡片一致（`kind: news` 还要求 `title` 一致）；无卡片入口的文章允许存在，报告里会列出数量

存在问题时以退出码 1 结束，可挂在提交前或 CI 上。

---

## ⚠️ 网站未更新？

如果你提交了 Pull Request 并被合并到 `master` 分支，但网站迟迟没有更新：

**联系 QQ：3200513041**

---

> 由原静态站 `jxufe-acm.cn` 迁移重构而来，以现代化前端工程体系重新组织。
