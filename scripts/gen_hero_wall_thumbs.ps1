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

$root = Split-Path -Parent $PSScriptRoot
if (-not $SourceDir) { $SourceDir = Join-Path $root 'public\images\excellent_member' }
if (-not $OutDir)    { $OutDir    = Join-Path $root 'public\images\hero_wall_thumbs' }

if (-not (Test-Path $SourceDir)) { Write-Host "[thumbs] 找不到源目录 $SourceDir，跳过"; exit 0 }

$exts = @('.png', '.jpg', '.jpeg', '.webp')
$excludeBase = @('default')   # 占位图，不是某个人
$sources = Get-ChildItem $SourceDir -File |
  Where-Object { $exts -contains $_.Extension.ToLower() } |
  Where-Object { $excludeBase -notcontains $_.BaseName.ToLower() }

if (-not $sources) { Write-Host "[thumbs] 源目录里没有可用图片，跳过"; exit 0 }

# JPEG 编码器 + 质量参数
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
        # 真源大多是正方形，非正方形的走 cover 语义（居中裁切），与墙上 object-fit: cover 一致
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
  foreach ($src in $sources) {
    $out = Join-Path $dir ($src.BaseName + '.jpg')
    if (-not $Force -and (Test-Path $out) -and ((Get-Item $out).LastWriteTime -ge $src.LastWriteTime)) {
      $skipped++
      continue
    }
    Resize-One -InPath $src.FullName -OutPath $out -Size $size
    $made++
  }

  $files = Get-ChildItem $dir -File -Filter *.jpg
  $total = ($files | Measure-Object Length -Sum).Sum
  $grandTotal += $total
  Write-Host ("[thumbs] {0}px: 共 {1} 张，{2} KB（本次新生成 {3}，跳过 {4}）" -f `
    $size, $files.Count, [math]::Round($total / 1KB), $made, $skipped)
}

Write-Host ("[thumbs] 两档合计 {0} KB → {1}" -f [math]::Round($grandTotal / 1KB), $OutDir)
