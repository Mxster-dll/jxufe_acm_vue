<#
  thumbs.ps1 —— 两面头像墙的缩略图脚本共用的 GDI+ 缩放与批量生成

  两个调用方的差别**只有「源从哪来」**，其余全在这里：
    gen_hero_wall_thumbs.ps1    扫 public/images/excellent_member/ 目录
    gen_group_wall_thumbs.ps1   读 public/data/group_wall.json 的 tiles（原图分散在三处）

  为什么抽出来（2026-09-24 屎山审查）：两份脚本的 `Resize-One`、
  「按档位循环 + 增量跳过 + 统计打印」此前逐字重复（只差一行注释），
  改一处忘另一处就会出现两档尺寸 / 质量不一致，而且不会有任何报错。

  dot-source 用法（必须点源，不要当模块导入 —— 这些是普通函数）：
    . (Join-Path $PSScriptRoot 'lib\thumbs.ps1')
  调用方自己负责 `Add-Type -AssemblyName System.Drawing`。

  为什么用 Windows PowerShell 而不是 node：System.Drawing（GDI+）是 Windows 自带的，
  零依赖零安装。pwsh 7 不带 System.Drawing.Common，所以必须用 powershell.exe(5.1) 跑。
#>

# JPEG 编码器：输出统一 .jpg（GDI+ 不支持 webp 输入，好在原图只有 jpg / png）
function Get-JpegCodec {
  [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
}

# 单张：cover 语义（居中裁切）缩放到 $Size × $Size，按 $Quality 编码成 jpg
function Resize-One {
  param(
    [Parameter(Mandatory)][string]$InPath,
    [Parameter(Mandatory)][string]$OutPath,
    [Parameter(Mandatory)][int]$Size,
    [int]$Quality = 85,
    $Codec
  )
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

      if ($Codec) {
        $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
        try { $bmp.Save($OutPath, $Codec, $ep) } finally { $ep.Dispose() }
      } else {
        $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      }
    } finally { $bmp.Dispose() }
  } finally { $img.Dispose() }
}

<#
  批量：$Entries 里每条都要有
    Base —— 输出基名（<OutDir>/<尺寸>/<Base>.jpg）
    Src  —— 原图绝对路径
  默认增量（源文件没更新就跳过），-Force 强制重建。只打印统计、**不返回值** ——
  在这里 `return $grandTotal` 的话，调用方不接它就会往 stdout 漏一行裸数字
  （实测跑出来是 `1628905`），别再加回来。
#>
function Write-ThumbSet {
  param(
    [Parameter(Mandatory)]$Entries,
    [Parameter(Mandatory)][string]$OutDir,
    [int[]]$Sizes = @(384, 256),
    [int]$Quality = 85,
    [switch]$Force
  )

  $codec = Get-JpegCodec
  $grandTotal = 0

  foreach ($size in $Sizes) {
    $dir = Join-Path $OutDir $size
    New-Item -ItemType Directory -Force $dir | Out-Null

    $made = 0; $skipped = 0
    foreach ($e in $Entries) {
      $out = Join-Path $dir ($e.Base + '.jpg')
      if (-not $Force -and (Test-Path $out) -and ((Get-Item $out).LastWriteTime -ge (Get-Item $e.Src).LastWriteTime)) {
        $skipped++
        continue
      }
      Resize-One -InPath $e.Src -OutPath $out -Size $size -Quality $Quality -Codec $codec
      $made++
    }

    $files = Get-ChildItem $dir -File -Filter *.jpg
    $total = ($files | Measure-Object Length -Sum).Sum
    $grandTotal += $total
    Write-Host ("[thumbs] {0}px: 共 {1} 张，{2} KB（本次新生成 {3}，跳过 {4}）" -f `
      $size, $files.Count, [math]::Round($total / 1KB), $made, $skipped)
  }

  Write-Host ("[thumbs] 两档合计 {0} KB → {1}" -f [math]::Round($grandTotal / 1KB), $OutDir)
}
