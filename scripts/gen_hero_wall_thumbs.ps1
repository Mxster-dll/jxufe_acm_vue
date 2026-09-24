<#
  gen_hero_wall_thumbs.ps1 —— 首页 hero 头像墙的缩略图生成器

  输入：public/images/excellent_member/*.png|jpg|jpeg|webp
  输出：public/images/hero_wall_thumbs/<尺寸>/<基名>.jpg     （384 与 256 两档）

  为什么需要缩略图：
    真源是 33 张 200×200~1170×1173 的照片，合计 13.78 MB（平均 415 KB，最大 1.75 MB）。
    墙上瓷砖在 2× 屏上最大只要 ~376 物理像素，铺 384 宽就够；实测 384 档共 925 KB，
    256 档共 481 KB —— 分别只有原图的 6.7% 和 3.5%。
    移动端瓷砖只有 96px（96×2=192 ≤ 256），所以自动走 256 档，再省一半。

  为什么用 Windows PowerShell 而不是 node：
    System.Drawing（GDI+）是 Windows 自带的，零依赖、零安装。pwsh 7 不带
    System.Drawing.Common，所以必须用 powershell.exe（5.1）跑。

  运行：
    powershell -ExecutionPolicy Bypass -File scripts/gen_hero_wall_thumbs.ps1
    可加 -Force 强制重建（默认增量：源文件没更新就跳过）。

  注意：本脚本是**本地**跑的（Windows）。服务器上 npm run build 只跑
  gen_hero_wall.mjs（纯 node），不会碰这个文件。
#>
[CmdletBinding()]
param(
  [string]$SourceDir,
  [string]$OutDir,
  [int[]]$Sizes = @(384, 256),
  [int]$Quality = 85,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot 'lib\thumbs.ps1')

$root = Split-Path -Parent $PSScriptRoot
if (-not $SourceDir) { $SourceDir = Join-Path $root 'public\images\excellent_member' }
if (-not $OutDir)    { $OutDir    = Join-Path $root 'public\images\hero_wall_thumbs' }

if (-not (Test-Path $SourceDir)) { Write-Host "[thumbs] 找不到源目录 $SourceDir，跳过"; exit 0 }

$exts = @('.png', '.jpg', '.jpeg', '.webp')
$excludeBase = @('default')   # 占位图，不是某个人
# 交给 lib\thumbs.ps1 的形状：Base = 输出基名、Src = 原图绝对路径
$entries = Get-ChildItem $SourceDir -File |
  Where-Object { $exts -contains $_.Extension.ToLower() } |
  Where-Object { $excludeBase -notcontains $_.BaseName.ToLower() } |
  ForEach-Object { [pscustomobject]@{ Base = $_.BaseName; Src = $_.FullName } }

if (-not $entries) { Write-Host "[thumbs] 源目录里没有可用图片，跳过"; exit 0 }

# 缩放、按档位循环、增量跳过、统计打印都在 lib\thumbs.ps1（与 group 那面墙共用同一份）
Write-ThumbSet -Entries $entries -OutDir $OutDir -Sizes $Sizes -Quality $Quality -Force:$Force
