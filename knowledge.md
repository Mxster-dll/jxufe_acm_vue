# 内容维护手册

> 这份文档写给**往网站里加东西的人**。它不解释代码怎么写的，只回答两件事：
> **改哪个文件**、**每个字段是什么意思**。
>
> 站点是静态的：所有可变内容都在 `public/data/` 里，**改 JSON 不用动任何代码**。
> 代码层面的技术说明见 `README.md`。

---

## 0. 先记住三件事

**① 数据与代码是分开的。** 加人、加奖项、加大事记，全都只改 `public/data/` 下的 JSON。

**② 顺序敏感。** 大部分数据文件的**字段顺序**都被校验脚本强制检查（`npm run data:check`）。
   写的时候照抄本文档的字段顺序，别自己调整。

**③ 改完跑一次校验：**

```powershell
npm run data:check
```

输出 `全部通过。` 才算好；有问题它会指出是哪个文件第几条、哪个字段。

---

## 1. 速查表

| 我要做什么 | 改哪个文件 | 要不要跑命令 |
|---|---|---|
| 加一条大事记 / 活动通知 | `public/data/events/<年>.json` | 加图的话不用；跑 `data:check` |
| 把某条大事记置顶 | `public/data/events/top.json` | 跑 `data:check` |
| 加获奖记录 | `public/data/awards/<赛事>.json` | 跑 `data:check` |
| 加优秀成员 | `public/data/members.json` + 放头像图 | 不用 |
| 加协会负责人 | `public/data/leaders.json` + 放头像图 | 不用 |
| **首页头像墙**加/换图 | 图片丢进 `public/images/excellent_member/` | **要跑 `data:hero-wall` + `data:hero-thumbs`** |
| 改头像墙悬浮卡片的文案 | `public/data/hero_wall.json` | 不用 |
| 换首页轮播图 | 覆盖 `public/images/slider/sliderN.jpg` | 不用 |
| 上线 | 双击 `deploy.bat` | — |

---

## 2. 大事记

**页面：** `/all-action`（导航里的「大事记」）。首页中部的「最新动态」板块也取自这里（自动取最近 5 条 `kind: "news"`）。

### 2.1 文件结构

大事记**一年一个文件**，没有索引文件（前端会自动探测目录里有哪些年份）：

| 文件 | 装什么 |
|---|---|
| `public/data/events/top.json` | 置顶卡片（扁平数组，数组靠前 = 显示靠前） |
| `public/data/events/<年>.json` | 该年**全部**数据：卡片 + 文章正文 |

```jsonc
// public/data/events/2026.json
{
  "cards":    [ { kind, date, category, title, tagline, link }, … ],   // 时间轴卡片
  "articles": { "<id>": { title, date, blocks }, … }                   // 文章正文，key = id
}
```

> **为什么卡片和正文放在同一个文件**：HTTP 只能整文件下载。放一起，从时间轴点开文章时正文已在内存里，**0 额外请求**。代价是只看时间轴的访客也会下载该年正文。

**加一条大事记 = 在同一个文件里改两个地方**（`articles` 写正文 + `cards` 加卡片）。

### 2.2 卡片字段（`cards[]` 和 `top.json[]`）—— **顺序敏感**

字段顺序必须是 `kind, date, category, title, tagline, link`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `kind` | `"news"` \| `"event"` | `news` 纯协会动态；`event` 参赛/赛事战报 |
| `date` | `"YYYY-MM-DD"` \| `"YYYY-MM"` \| `"YYYY"` \| `null` | `null` = 日期待考。**必须倒序**（新→旧），`null` 排最末 |
| `category` | 见下表 | 决定时间轴上的彩色标签与左侧筛选 |
| `title` | string | 卡片标题。**`kind: "news"` 时，必须与 `articles` 里那条的 `title` 完全一致** |
| `tagline` | string | 卡片上的一行摘要（也只有一行） |
| `link` | string | **纯 id，不能含 `/`**。必须等于 `articles` 里的某个 key |

**`category` 全部取值**（顺序即左侧筛选条的展示顺序）：

| 代码 | 中文标签 | 什么时候用 |
|---|---|---|
| `inv` | 邀请赛 | ICPC / CCPC 全国邀请赛 |
| `reg` | 区域赛·全国赛 | ICPC 区域赛、CCPC 国赛 |
| `prov` | 省赛·区赛 | 省赛、区赛 |
| `net` | 网络赛 | 网络预选赛 |
| `tts` | 天梯赛 | 团体程序设计天梯赛 |
| `lanqiao` | 蓝桥杯 | 蓝桥杯 |
| `chuanzhi` | 传智杯 | 传智杯 |
| `baidu` | 百度之星 | 百度之星 |
| `school` | 校赛 | 校内选拔 |
| `club` | 社团活动 | 纳新、集训、讲座等协会自身的事 |
| `other` | 其他 | 兜底 |

### 2.3 文章字段（`articles["<id>"]`）—— **顺序敏感**

字段顺序必须是 `title, date, blocks`；可选的 `subtitle` 只能插在 `date` 之后 →
写作 `title, date, subtitle, blocks`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | string | 文章标题。`kind: "news"` 时必须与卡片一致 |
| `date` | 同卡片 | **年份必须与所在文件一致**（`2026.json` 里只能写 2026 年的日期） |
| `subtitle` | string（可省） | 副标题，只在详情页显示 |
| `blocks` | 数组，**不能为空** | 正文，见下 |

**`id` 的规则**（校验会检查）：
- 必须以**所在年份开头** + 一个连字符，例如 `2026-6-27-new-contest`
- 不能含 `/`
- 前端就是靠 id 的前 4 位定位到年份文件的，**没有映射表**

### 2.4 `blocks` 块类型全表

正文是一个「块」数组，按顺序渲染。共 13 种：

| `type` | 字段 | 渲染成 |
|---|---|---|
| `text` | `paras: string[]` | 段落（每个元素一段） |
| `heading` | `text`, `icon?` | 小标题（`icon` 是 FontAwesome 类名，如 `fa-solid fa-trophy`） |
| `images` | `items: [{ src, alt?, caption? }]` | 图片组（`caption` 是图注） |
| `awards` | `heading?`, `cards: [{ title, tone?, fields: [{label, value}], highlight?, images? }]` | 获奖卡片。`tone` 取 `gold`/`silver`/`bronze`/空，决定配色 |
| `highlight` | `text` | 高亮引述块 |
| `partners` | `logos: [{ src, alt }]`, `note?` | 合作高校 logo 墙 |
| `list` | `intro?`, `items: string[]` | 无序列表 |
| `table` | `headers?`, `rows: string[][]`, `left?` | 表格。单元格也可写成 `{ text, rowspan, colspan }` |
| `info` | `heading`, `icon?`, `cards: [{ icon, title, desc }]` | 信息卡网格（时间 / 平台 / 主页那种） |
| `organizers` | `heading?`, `icon?`, `items: [{ icon, name, qr }]` | 主办部门网格。`qr` 是点击展开的二维码图（如社团招新群） |
| `platformList` | `items: [{ name, desc }]` | 学习平台清单 |
| `related` | `text`, `to` | 「相关链接」按钮，`to` 形状必须是 `/competition/<slug>` 且 slug 存在 |
| `faq` | `items: [{ q, a: blocks[] }]` | 折叠问答（`a` 里可以再嵌任意块） |

**文本里能用的内联标记**（只有这两种）：

| 写法 | 效果 |
|---|---|
| `**加粗**` | **加粗** |
| `[文字](https://…)` | 超链接（自动新窗口打开） |

> 换行会变成 `<br>`；HTML 会被转义，所以**不能**在数据里手写标签。

### 2.5 完整例子：加一条协会通知

在 `public/data/events/2026.json` 里改两处：

```jsonc
{
  "cards": [
    {
      "kind": "news",
      "date": "2026-10-15",
      "category": "club",
      "title": "2026 年秋季纳新开始",
      "tagline": "10 月 15 日起接受报名，欢迎零基础同学",
      "link": "2026-10-15-recruit"
    }
    // …其余卡片保持原来的倒序
  ],
  "articles": {
    "2026-10-15-recruit": {
      "title": "2026 年秋季纳新开始",
      "date": "2026-10-15",
      "subtitle": "零基础也欢迎",
      "blocks": [
        { "type": "text", "paras": ["报名截止 **10 月 30 日**，详见 [纳新说明](https://jxufe-acm.cn)。"] },
        {
          "type": "info",
          "heading": "报名信息",
          "icon": "fa-info-circle",
          "cards": [{ "icon": "fa-calendar-alt", "title": "截止时间", "desc": "2026 年 10 月 30 日" }]
        }
      ]
    }
  }
}
```

### 2.6 大事记的规则与坑

- **卡片 `date` 必须倒序**（校验会报「date 未按倒序排列」）
- **`date` 必须与文章完全一致（所有 kind 都查）**；`title` 只有 `kind: "news"` 必须一致 —— `kind: "event"`（赛事战报）故意允许不同：卡片是短标签（「ICPC全国邀请赛（沈阳）」）、文章是官方全称
- **置顶**：卡片挪到 `events/top.json`，**正文仍然写在年份文件的 `articles` 里**。**切勿两处都放卡片**，否则时间轴出现两次（校验会报「新闻在时间轴里重复出现」）
- **只想给个直达链接、不上时间轴**：只写 `articles`，不写 `cards`。这是允许的（校验记为「无卡片入口的文章」，比如参赛未获奖的场次）
- 赛事卡片（天梯赛/蓝桥杯/百度之星）的文章是 `scripts/gen_events_articles.mjs` 从 `scripts/source/` 生成的，不要手改；手改的只针对 `kind: "news"` 的协会动态

---

## 3. 获奖记录

**页面：** 导航「竞赛信息」→ `/contest` → 点进某个赛事 `/competition/<slug>` → 点某一届 `/competition/<slug>/<年>`。

### 3.1 文件与三种 schema

获奖记录按赛事分文件，放在 `public/data/awards/`。**三种字段结构，别混用**：

| 文件 | 结构 | 用在哪 |
|---|---|---|
| `icpc.json`、`ccpc.json` | **团队赛** | ICPC / CCPC，三人一队 |
| `gplt-team.json` | **天梯赛团队奖** | 天梯赛的团队奖项 |
| `gplt-individual.json`、`lanqiao.json`、`baidu.json`、`chuanzhi.json` | **单人赛** | 天梯赛个人奖、蓝桥杯、百度之星、传智杯 |

### 3.2 字段表（**顺序敏感**）

**团队赛**（`icpc` / `ccpc`）—— 顺序：`competition_name, medal_level, team_name, medal_type, members, coach_names, date`

| 字段 | 说明 |
|---|---|
| `competition_name` | 站名，如 `"ICPC亚洲区域赛 南京站"`。**同一个赛事的每一届都写这个**，页面按它分组 |
| `medal_level` | 见 3.3 |
| `team_name` | 队名，不能为空 |
| `medal_type` | `gold` / `silver` / `bronze` |
| `members` | 队员姓名数组，**不能为空** |
| `coach_names` | 教练姓名数组，**可以是空数组** `[]` |
| `date` | `"YYYY-MM-DD"` 或 `null`（待考） |

**天梯赛团队奖**（`gplt-team`）—— 顺序：`session, team_name, medal_type, members, coach_names, date`

| 字段 | 说明 |
|---|---|
| `session` | **整数**，第几届（不是年份！），如 `3` |
| `team_name` | 队名 |
| `medal_type` | `gold` / `silver` / `bronze` |
| `members` | 队员姓名数组 |
| `coach_names` | 数组 |
| `date` | `"YYYY-MM-DD"` 或 `null` |

> ⚠️ 天梯赛团队奖**没有 `medal_level`**（团队奖不分级）。

**单人赛**（`gplt-individual` / `lanqiao` / `baidu` / `chuanzhi`）—— 顺序：`session, members, medal_level, medal_type, coach_names, date`

| 字段 | 说明 |
|---|---|
| `session` | **整数**，第几届 |
| `members` | 获奖人姓名数组（通常一个人） |
| `medal_level` | `provincial`（省赛/初赛）或 `national`（国赛/决赛） |
| `medal_type` | `gold` / `silver` / `bronze` |
| `coach_names` | 数组 |
| `date` | `"YYYY-MM-DD"` 或 `null` |

**`lanqiao.json` 额外两个字段**，位置固定插在 `members` 之后：
顺序变成 `session, members, language, group, medal_level, medal_type, coach_names, date`

| 字段 | 取值 |
|---|---|
| `language` | `"C++"` / `"Java"` / `"Python"` / `null` |
| `group` | `"A"` / `"B"` / `"研究生组"` / `null` |

### 3.3 枚举取值

| 字段 | 允许的值 |
|---|---|
| `medal_type` | `gold`、`silver`、`bronze`（**只有这三个**） |
| `medal_level`（团队赛） | `regional`、`invitational`、`provincial`、`final` |
| `medal_level`（单人赛） | `provincial`、`national` |
| `session` | 正整数（届数） |

### 3.4 真实例子（摘自现存数据）

```jsonc
// awards/ccpc.json —— 团队赛
{
  "competition_name": "CCPC全国邀请赛（贵州）暨贵州省赛",
  "medal_level": "invitational",
  "team_name": "喜欢只是错觉",
  "medal_type": "silver",
  "members": ["万俊哲", "张云菲", "衷铭川"],
  "coach_names": [],
  "date": "2026-06-07"
}
```

```jsonc
// awards/lanqiao.json —— 单人赛 + 两个额外字段
{
  "session": 1,
  "members": ["赵奕伟"],
  "language": "C++",
  "group": null,
  "medal_level": "provincial",
  "medal_type": "bronze",
  "coach_names": [],
  "date": null
}
```

```jsonc
// awards/gplt-team.json —— 天梯赛团队奖（注意：没有 medal_level）
{
  "session": 3,
  "team_name": "酱菜信管 1 队",
  "medal_type": "silver",
  "members": ["陈环宇", "邓未", "高莺", "…"],
  "coach_names": [],
  "date": null
}
```

### 3.5 加一条获奖记录

打开对应赛事的文件，按上表结构加一条，然后：

1. **`date` 必须升序**（旧→新，`null` 排末尾）—— 跟大事记卡片正好相反
2. 跑 `npm run data:check` 确认

### 3.6 新增一个赛事（进阶）

要动三个地方：

1. `public/data/competitions.json` 加一项：
   ```jsonc
   {
     "slug": "newcontest",            // URL 用：/competition/newcontest
     "name": "XX 程序设计竞赛",
     "shortName": "XX",               // 必填，缺了校验会报错
     "image": "/images/contest/xx.png",
     "desc": "一句话简介",
     "subtitle": "副标题",
     "intro": ["介绍第一段", "第二段"],
     "details": [{ "icon": "fa-calendar-alt", "title": "比赛时间", "lines": ["…"] }],
     "mode": "roster",                // 见下
     "awards": ["newcontest"],        // 指向 awards/newcontest.json
     "sessions": { "2026": 1 }        // 年份 → 届数，/competition/<slug>/2026 靠它换算
   }
   ```
   `mode` 取值：`xcpc`（ICPC/CCPC 那套表格）/ `gplt`（天梯赛）/ `roster`（名单式）/ `none`（无获奖数据）
2. 新建 `public/data/awards/newcontest.json`（按 3.1 选一种 schema）
3. **在 `scripts/check_awards.mjs` 的 `SCHEMA` 里登记这个新文件名**，否则校验会报「未在 schema 中登记」

> `awards/` 里**不允许有没人引用的文件**（校验会报「未被任何赛事引用的 awards 文件」）。

---

## 4. 优秀成员

**页面：** `/excellent` ｜ **文件：** `public/data/members.json`（一个扁平数组）

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 姓名 |
| `class` | string | 班级，如 `"22计算机科学与技术1班"`。没信息就写 `"---"` |
| `photo` | string | 头像路径，如 `"/images/excellent_member/whf.png"` |
| `honors` | string[] | 荣誉标签，**数组里每一项都会渲染成一个胶囊**，顺序即显示顺序 |

```jsonc
{
  "name": "王海峰",
  "class": "21计算机科学与技术1班",
  "photo": "/images/excellent_member/whf.png",
  "honors": [
    "2023区域赛银牌",
    "2024ICPC江西省赛季军",
    "保研至北京邮电大学"
  ]
}
```

**加一个人**：
1. 头像图丢进 `public/images/excellent_member/`
2. 在 `members.json` 里加一项
3. 头像加载失败会**自动回退**到 `/images/excellent_member/default.png`，所以图名写错只会显示默认头像，不会破版

> 这个文件同时也是**首页头像墙自动预填文案的来源**（见 6.1）。

---

## 5. 协会负责人

**页面：** `/leader` ｜ **文件：** `public/data/leaders.json`（数组，**新的放最前面**）

| 字段 | 类型 | 说明 |
|---|---|---|
| `session` | string | 届次，如 `"2026届会长"`。显示在卡片左上角的绶带上 |
| `name` | string | 姓名 |
| `class` | string | 班级 |
| `avatar` | string | 头像路径，如 `"/images/leader/2026.jpg"` |
| `message` | string | 寄语（一段话，会长自己写的） |
| `achievements` | string[] | 主要成绩，每项一个标签 |

```jsonc
{
  "session": "2026届会长",
  "name": "陈煜仕",
  "class": "25计算机科学与技术2班",
  "avatar": "/images/leader/2026.jpg",
  "message": "协会真正想给大家带来的，也许从来不是一块奖牌……",
  "achievements": [
    "CCPC 东盟国际大学生程序设计竞赛（桂林）银牌",
    "ICPC全国邀请赛（西安）铜牌",
    "蓝桥杯国一"
  ]
}
```

**加一位新负责人**：头像放 `public/images/leader/<年>.jpg` → 在数组**最前面**插一项。
数组顺序就是页面上的显示顺序（历任会长从左到右）。

---

## 6. 首页 hero 区

首页最上面那一屏（hero）由好几层叠成，从上到下：

| 层 | 内容 | 数据 / 文件 |
|---|---|---|
| 文案 + 轮播 | 「写码码，拿奖奖」+ 右上角轮播 | `src/views/HomeView.vue` 里的 `slides` |
| 横滚代码背景 | 缓慢横滚的代码字符串 | 代码里随机生成，不可配 |
| 浮动形状 / 粒子 | 装饰性圆圈与光点 | 代码里随机生成，不可配 |
| **头像墙（底图）** | 铺满整屏、缓慢漂移的成员头像墙 | `public/images/excellent_member/` + `public/data/hero_wall*.json` |

### 6.1 头像墙（hero 底图）

这是首页的**底图**：默认淡着铺在文案与轮播后面（悬停会出现模糊亮斑），
点那个**「成员墙」按钮**后（桌面在 hero 底部居中，手机在左下角），文案与轮播退场、
整面墙变成可浏览的成员墙。**两种看法**：

| 操作 | 看到什么 |
|---|---|
| 鼠标悬停某一格（仅桌面） | **预览卡**：头像 + 姓名 + 班级 + 奖项胶囊 + 留言（留言长了会截断，见下） |
| **点**某一格（桌面 / 手机都行） | **全文卡**：留言**一个字都不截**，长了自己在卡片里滚 |

> 手机没有「悬停」，所以只有「点一下」这一条路 —— 点开的就是全文卡。

涉及四个位置：

| 位置 | 是什么 | 谁写 |
|---|---|---|
| `public/images/excellent_member/` | **图片真源**，一个文件一个人 | **你** |
| `public/data/hero_wall.manifest.json` | 图片清单 | 自动生成 |
| `public/data/hero_wall.json` | 悬浮卡片的文案 | **你** |
| `public/images/hero_wall_thumbs/{384,256}/` | 两档缩略图 | 自动生成 |

#### 加一个人 / 换一张图（三步）

**① 把图片丢进 `public/images/excellent_member/`**

- 认 `.png` / `.jpg` / `.jpeg` / `.webp`
- `default.png` 会被**自动跳过**（那是"没有照片"的占位图）

**② 跑生成器：**

```powershell
npm run data:hero-wall
```

它自动做两件事：清单里多一张 + `hero_wall.json` 里补一条条目。
（`npm run dev` / `npm run build` 也会自动跑，不用记）

实测输出：
```
[hero-wall] manifest: 34 张 → public/data/hero_wall.manifest.json
[hero-wall] 新增 1 条待填文案: 新图片.png
```

**③ 生成缩略图 —— 这步不会自动跑，必须手动：**

```powershell
npm run data:hero-thumbs
```

是**增量**的（已有的且比原图新的会跳过），只处理新图。实测 34 张里新生成 1 张、跳过 33 张。

> **跳过第 ③ 步会坏吗？不会。** 缩略图路径是前端推导的，加载失败会自动回退加载原图 —— 只是那一格会多下 1MB 左右。所以忘了跑也只是慢，不会白图。

#### 改悬浮卡片的文案

编辑 `public/data/hero_wall.json`：key 是**图片文件名**，value 是卡片内容。

```jsonc
"whf.png": {
  "name": "王海峰",                                   // 姓名
  "line": "21计算机科学与技术1班",                     // 一句话（这里填的是班级，随便改）
  "tags": ["2023区域赛银牌", "保研至北京邮电大学"],    // 奖项胶囊，有几个显示几个
  "message": ""                                        // 留言，可留空；也可以是一整段话
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 姓名 |
| `line` | string | 卡片上那一行小字，一般是班级 |
| `tags` | string[] | 奖项胶囊，有几个显示几个 |
| `message` | string（可省） | **留言**，可以是一整段话（「给未来留一行」那种）。会自动换行 |

| 情况 | 预览卡上显示 |
|---|---|
| 四个字段都填 | 头像 + 姓名 + 班级 + 奖项胶囊 + 留言 |
| `line` 留空 | 头像 + 姓名 + 胶囊 + 留言 |
| `tags` 留空 | 头像 + 姓名 + 班级 + 留言 |
| `message` 留空 | 头像 + 姓名 + 班级 + 奖项胶囊（和以前一模一样） |
| 全部留空 | **只有头像**（不编造内容） |

> **留言很长会怎样 —— 分两级，长的都能读完**
>
> | | 触发方式 | 留言 |
> |---|---|---|
> | **预览卡** | 鼠标悬停（桌面） | 最多 10 行，被截断时尾部淡出 + 多一行「点击查看全文」 |
> | **全文卡** | **点**任意一格（桌面 / 手机） | **全文，一个字都不截**；长了只有正文区在滚，姓名和关闭钮始终在 |
>
> 「点击查看全文」**只在真被截断时出现** —— 是运行时实测的（`scrollHeight` 对比
> `clientHeight`），短留言的卡片上不会多这行字。
>
> 数据层（`hero_wall.json`）永远存全文，两级截断都是**纯 CSS / 纯显示**的事，原文一个字都没丢。
> 想调预览卡的行数上限：改 `src/components/HeroAvatarWall.vue` 里 `.wall__msg` 的
> `-webkit-line-clamp`（改代码要重新构建）。

> 只有写了 `message` 的条目才有这个键 —— 老条目没有 `message` 是**正常**的，按空处理。

**自动预填**：新图如果在 `public/data/members.json` 里有对应记录，生成器会自动填好
姓名 + 班级 + 前 3 条奖项；不在其中的就只补一条全空的，需要你自己填。
（`message` **永远**预填成空 —— `members.json` 里没有「留言」这个概念。）

**重扫永远不会覆盖你写过的内容** —— 它只补"缺失的条目"。

#### 三个实测出来的坑

| 坑 | 后果 | 怎么办 |
|---|---|---|
| 删图 | 清单会更新（少一张），但 `hero_wall.json` 里那条**会变成孤儿留着** | 不报错也不显示；想干净就手动删掉那个 key |
| 改图片文件名 | 键是文件名 → 旧文案变孤儿，新名字补一条空的 | 改名后去新键上重填 |
| 删图 | `hero_wall_thumbs/` 里那张 jpg 还在 | 不影响功能（清单里没有就不被引用），想干净手动删 |

#### 想调整观感

都在 `src/components/HeroAvatarWall.vue` 的组件参数里（改这里才需要重新构建）：

| 想要的效果 | 改哪里 |
|---|---|
| 墙滚得更快 / 更慢 | `speed`（激活态，默认 22 px/s）、`speedBackdrop`（底纹态，默认 11 px/s） |
| 底纹更浓 / 更淡 | `dimOpacity`（默认 0.18） |
| 头像格子更大 / 更小 | 样式里的 `--wall-tile`（桌面 188px，手机 96px，有媒体查询分档） |
| 按钮文字 | `label`（默认「成员墙」）、`labelActive`（默认「返回」） |
| 预览卡留言显示几行 | `.wall__msg` 的 `-webkit-line-clamp`（默认 10） |
| 预览卡多宽 | `.wall__card` 的 `--card-w`（默认 360px；有留言时 `.has-message` 放宽到 440px） |
| 全文卡多宽 / 多高 | `.wall-sheet__card` 的 `width`（默认 560px）与 `max-height`（默认一屏减 40px） |
| 全文卡正文排版 | `.wall-sheet__msg` 的 `font-size` / `line-height`（默认 15px / 1.9） |
| 手机什么时候变成贴底抽屉 | `@media (max-width: 599px)` 那个断点 |
| 墙上照片重复得明不明显 | **只能靠加图**（见下）。排布已经是打乱的，不会让同图挨着 |

#### 关于「照片重复」

墙上照片一定会重复：`n` 张图铺满一屏 `m` 格，就必然重复 `⌈m/n⌉` 次 ——
36 张图、桌面一屏 55 格时，一屏里大约有 19 格是「第二次出现」。**这是数学，躲不掉。**

能做的是让重复**看起来没有规律**，这部分已经做好了：

| 做了什么 | 效果 |
|---|---|
| 排布洗牌 + 冲突修复 | 一屏内同图的偏移会散成二三十种（老写法只有一两种，所以看着像规律图案） |
| 八邻域不排同图 | 一样的照片不会挨着（含对角、含环面接缝处） |
| 周期放大到视口的 1.2~1.5 倍 | 周期不再正好等于一屏，竖着滚一屏不会立刻回到原样 |
| 每次刷新换一批排布 | 刷新一次就是一面新墙 |

**想让它更不重复，唯一的办法是加图** —— 往 `public/images/excellent_member/`
里丢图就行，加到 60~80 张时一屏基本就是不同的人了。

### 6.2 轮播图

`public/images/slider/slider1.jpg` ~ `slider10.jpg`，**图片数量在代码里写死为 10 张**。

| 我要做的事 | 怎么做 |
|---|---|
| 换掉某一张 | 用同名文件覆盖（注意文件名必须还是 `sliderN.jpg`） |
| 增减张数 | 改 `src/views/HomeView.vue` 里的 `const slides = Array.from({ length: 10 }, …)` |

> ⚠️ **注意体积**：这 10 张目前合计 **15.23 MB**（`slider9.jpg` 一张就 9.9 MB），
> 首页一打开就会全部下载。换图前建议先压到 300 KB 以内（长边 1600px、JPEG 质量 80 左右）。

### 6.3 换 hero 的文案

「写码码，拿奖奖 / 加分分，领钱钱」和下面那行欢迎语，在 `src/views/HomeView.vue` 的模板里
（搜索 `hero-content`）。这部分是**代码**不是数据，改完要重新构建。

---

## 7. 更新与部署

### 7.1 本地看效果

```powershell
npm install          # 首次
npm run dev          # → http://localhost:5173  （改 public/ 下的 JSON，刷新即生效）
```

只想确认构建没问题：

```powershell
npm run build        # → dist/
npm run preview      # 预览生产构建
```

> ⚠️ `preview` 的地址是 **http://localhost:4173** —— 必须用 `localhost`，**别用 `127.0.0.1`**：
> Vite 只监听了 IPv6 的 `::1`，用 `127.0.0.1` 会得到「连接被拒绝」。

> `preview` 读的是 `dist/`，**改了 `public/` 之后要重新 `npm run build`** 才会反映出来；
> `dev` 是直接读 `public/` 的，刷新即可。

### 7.2 上线：双击 `deploy.bat`

脚本会按顺序做五件事（任何一步失败都会停下并打印原因）：

| 步骤 | 做什么 |
|---|---|
| 1 | 本地检查：部署密钥、`src/main.js`、`package.json`、`tar` |
| 2 | 把 `src public package.json package-lock.json vite.config.js index.html scripts/gen_hero_wall.mjs` 打成 tar.gz |
| 3 | 上传到服务器 `/tmp`，解包到 `/var/www/jxufe_acm_vue`（会先删掉旧的 `src` 和 `public`） |
| 4 | 服务器上 `npm install` + `npm run build`（**`prebuild` 会自动重扫头像墙清单**） |
| 5 | `nginx -t` → `systemctl reload nginx` → 用 curl 验证站点返回 200 |

最后会打印 `Deploy success!` 和 `HTTP 200`。

> ✅ **所以加完头像墙的图，只要双击 `deploy.bat` 就够了** —— 清单会在服务器上自动重生成。
> 但**缩略图是本地生成的**，必须先在本地跑过 `npm run data:hero-thumbs`（它依赖 Windows 的 Graphics 库，服务器是 Linux 跑不了）。

### 7.3 服务器信息

| 项 | 值 |
|---|---|
| IP / 用户 | `47.99.92.213` / `root` |
| 网站目录 | `/var/www/jxufe_acm_vue`（`src`、`public`、构建产物 `dist`） |
| **Nginx 根目录** | `/var/www/jxufe_acm_vue/dist` |
| 站点 | https://jxufe-acm.cn |
| 登录方式 | **SSH 密钥**（`.deploy/id_ed25519`），不用密码 |

> 密钥文件 `.deploy/id_ed25519` 等于服务器 root 权限，**别删、别外传**（已在 `.gitignore` 里）。
> 服务器重装后按 `deploy.bat` 头部注释里的命令把 `.deploy/id_ed25519.pub` 装回去。

### 7.4 应急热修（不用重新部署）

nginx 直接服务的是 `dist/` 里的文件，而 `dist/data/*.json` 就是数据的最终位置。
只想临时改一句文案、不想跑一次完整部署时，可以直接改服务器上的那份：

```bash
ssh root@47.99.92.213
vi /var/www/jxufe_acm_vue/dist/data/hero_wall.json     # 或 events/2026.json 等
```

**立刻生效，不用重启任何东西**（nginx 对这些文件设的是 `expires -1`，每次都回源校验）。

> ⚠️ 但**下次 `deploy.bat` 会被本地版本覆盖**。它只适合救急，改完记得同步回本地。

### 7.5 缓存行为

| 内容 | 缓存策略 | 换图后要做什么 |
|---|---|---|
| 带哈希的构建产物（`/assets/index-XXXX.js`） | 一年强缓存 | 不用管，文件名变了 |
| 图片、JSON（`/images/`、`/data/`） | 每次回源校验（304） | **刷新即生效**，不用清缓存 |

---

## 8. 数据校验

```powershell
npm run data:check
```

它会检查（`scripts/check_awards.mjs`）：

- `awards/*.json`：**字段名与顺序**、枚举取值、`members` 非空、`date` 格式、`date` 升序
- `competitions.json`：每个赛事的 `shortName` 是否存在、`awards` 指向的文件是否存在、`sessions` 是否合法
- 有没有**没人引用的 `awards` 文件**
- `events/`：卡片字段与顺序、`kind` / `category` / `date` 合法性、**卡片 date 倒序**、`link` 是纯 id
- 文章：字段与顺序、`date` 年份与所在文件一致、`blocks` 非空、`related.to` 指向的赛事存在
- **卡片 ↔ 文章一致性**：`link` 能否找到文章、`news` 的标题是否一致、日期是否一致、新闻有没有重复上时间轴

退出码 `0` = 全部通过，`1` = 有问题。

---

## 9. 常见问题

**Q：改完 JSON 刷新页面没变化？**
A：① 是不是在用 `npm run preview`（那读的是 `dist/`，要重新 `build`）；② JSON 语法错了（多一个逗号就会整份加载失败，按 F12 看控制台）。

**Q：时间轴上没出现我加的大事记？**
A：检查 `link` 和 `articles` 里的 key 是不是完全一致；`kind: "news"` 时 `title` / `date` 也要和文章一致。跑 `npm run data:check` 会直接指出问题。

**Q：新加的头像墙成员是空名字？**
A：说明这个人不在 `public/data/members.json` 里，生成器没有可预填的来源 → 去 `public/data/hero_wall.json` 手动填。

**Q：首页头像墙有一格明显比别的大/慢？**
A：那一格在加载原图（缩略图没生成）→ 本地跑一次 `npm run data:hero-thumbs`，然后重新部署。

**Q：`deploy.bat` 报 "Cannot connect … via SSH"？**
A：检查网络，或按脚本头部注释把 `.deploy/id_ed25519.pub` 重新装到服务器 `/root/.ssh/authorized_keys`。

**Q：网站改了但线上没变？**
A：浏览器强刷（Ctrl+F5）先排掉本地缓存；还不变就是没部署成功 —— 看 `deploy.bat` 最后有没有打印 `HTTP 200`。

---

## 10. 一页速查

```powershell
# ── 本地 ──
npm install                 # 首次
npm run dev                 # → http://localhost:5173
npm run build               # 构建到 dist/
npm run preview             # 预览构建 → http://localhost:4173

# ── 数据 ──
npm run data:check          # 校验所有 JSON（改完必跑）
npm run data:hero-wall      # 重扫头像墙图片清单（加图后）
npm run data:hero-thumbs    # 生成头像墙缩略图（加图后必跑，不会自动）

# ── 上线 ──
deploy.bat                  # 双击即可
```

| 数据 | 文件 |
|---|---|
| 大事记 | `public/data/events/<年>.json`、`events/top.json` |
| 获奖记录 | `public/data/awards/<赛事>.json` |
| 竞赛信息 | `public/data/competitions.json` |
| 优秀成员 | `public/data/members.json` |
| 协会负责人 | `public/data/leaders.json` |
| 头像墙底图 | `public/images/excellent_member/` + `public/data/hero_wall.json` |
| 轮播图 | `public/images/slider/slider1~10.jpg` |
| 导航链接 | `src/data/navigation.js`（代码，改了要重新构建） |
