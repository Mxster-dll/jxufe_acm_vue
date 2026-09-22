<#
  gen_group_wall_thumbs.ps1 —— 协会成员头像墙的缩略图生成器

  输入：public/data/group_wall.json 的 tiles（每条的 file 与 full）
  输出：public/images/group_wall_thumbs/<尺寸>/<基名>.jpg      （384 与 256 两档）

  为什么源来自 tiles 而不是像 gen_hero_wall_thumbs.ps1 那样扫目录：
    首页那面墙的 33 张原图都在一个目录里；而这面墙的 138 张原图分散在三处 ——
    群头像 public/images/group_members/full/、优秀成员 public/images/excellent_member/、
    负责人 public/images/leader/。逐条读 tiles 的 full 才不会漏。

  为什么要缩略图：
    原图最 1.79 MB（优秀成员那批 PNG），而墙上瓷砖在 2× 屏上最大只要 ~376 物理像素；
    384 档足够，256 档给移动端（瓷砖 96px × 2 = 192 ≤ 256）。

  为什么用 Windows PowerShell 而不是 node：
    System.Drawing（GDI+）是 Windows 自带的，零依赖零安装。pwsh 7 不带
    System.Drawing.Common，所以必须用 powershell.exe（5.1）跑。
    注意 GDI+ **不支持 webp** —— 好在原图只有 jpg / png，输出统一 .jpg。

  运行：
    powershell -ExecutionPolicy Bypass -File scripts/gen_group_wall_thumbs.ps1
    可加 -Force 强制重建（默认增量：源文件没更新就跳过）。

  本脚本是**本地**跑的（Windows）。服务器上 npm run build 只跑 gen_group_wall.mjs
  （纯 node）；缩略图缺失时组件会自动回退到原图，所以不影响线上能看。
#>
[CmdletBinding()]
param(
  [string]$TilesJson,
  [string]$OutDir,
  [int[]]$Sizes = @(384, 256),
  [int]$Quality = 85,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
if (-not $TilesJson) { $TilesJson = Join-Path $root 'public\data\group_wall.json' }
if (-not $OutDir)    { $OutDir    = Join-Path $root 'public\images\group_wall_thumbs' }

if (-not (Test-Path $TilesJson)) {
  Write-Host "[thumbs] 找不到 $TilesJson —— 先跑 node scripts/gen_group_wall.mjs"
  exit 1
}

# 注意：PS 5.1 的 Get-Content 默认按 ANSI(GBK) 读，而站点的 JSON 是 UTF-8 无 BOM ——
# 直接 Get-Content -Raw | ConvertFrom-Json 会把中文打烂并抛 ArgumentException（踩过）。
# 必须显式按 UTF-8 读。
$json = [System.IO.File]::ReadAllText($TilesJson, [System.Text.Encoding]::UTF8)
$tiles = ($json | ConvertFrom-Json).tiles
$entries = @()
foreach ($prop in $tiles.PSObject.Properties) {
  $file = $prop.Name
  $full = $prop.Value.full
  if (-not $full) { continue }
  $src = Join-Path $root ('public' + $full)
  if (-not (Test-Path $src)) {
    Write-Host "[thumbs] 跳过（原图不存在）: $full"
    continue
  }
  $entries += [pscustomobject]@{ Base = [System.IO.Path]::GetFileNameWithoutExtension($file); Src = $src }
}

if (-not $entries) { Write-Host '[thumbs] tiles 里没有可用的原图，跳过'; exit 0 }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1

function Resize-One {
  param([string]$InPath, [string]$OutPath, [int]$Size)
  $img = [System.Drawing.Image]::FromFile($InPath)
  try {
    $bmp = New-Object System.Drawing.Bitmap ([int]$Size), ([int]$Size)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        # 非正方形的走 cover 语义（居中裁切），与墙上 object-fit: cover 一致
        $scale = [Math]::Max($Size / $img.Width, $Size / $img.Height)
        $dw = [int][Math]::Round($img.Width * $scale)
        $dh = [int][Math]::Round($img.Height * $scale)
        $g.DrawImage($img, [int](($Size - $dw) / 2), [int](($Size - $dh) / 2), $dw, $dh)
      } finally { $g.Dispose() }

      if ($codec) {
        $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
        try { $bmp.Save($OutPath, $codec, $ep) } finally { $ep.Dispose() }
      } else {
        $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      }
    } finally { $bmp.Dispose() }
  } finally { $img.Dispose() }
}

$grandTotal = 0
foreach ($size in $Sizes) {
  $dir = Join-Path $OutDir $size
  New-Item -ItemType Directory -Force $dir | Out-Null

  $made = 0; $skipped = 0
  foreach ($e in $entries) {
    $out = Join-Path $dir ($e.Base + '.jpg')
    if (-not $Force -and (Test-Path $out) -and ((Get-Item $out).LastWriteTime -ge (Get-Item $e.Src).LastWriteTime)) {
      $skipped++
      continue
    }
    Resize-One -InPath $e.Src -OutPath $out -Size $size
    $made++
  }

  $files = Get-ChildItem $dir -File -Filter *.jpg
  $total = ($files | Measure-Object Length -Sum).Sum
  $grandTotal += $total
  Write-Host ("[thumbs] {0}px: 共 {1} 张，{2} KB（本次新生成 {3}，跳过 {4}）" -f `
    $size, $files.Count, [math]::Round($total / 1KB), $made, $skipped)
}

Write-Host ("[thumbs] 两档合计 {0} KB → {1}" -f [math]::Round($grandTotal / 1KB), $OutDir)
