[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$sumFile = Join-Path $bundleRoot 'SHA256SUMS.txt'

if (-not (Test-Path -LiteralPath $sumFile -PathType Leaf)) {
  throw "缺少校验文件: $sumFile"
}

$checked = 0
foreach ($line in Get-Content -LiteralPath $sumFile) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = $line -split "`t", 2
  if ($parts.Count -ne 2) { throw "无效校验行: $line" }
  $expected = $parts[0].Trim().ToLowerInvariant()
  $relative = $parts[1].Trim().Replace('/', [IO.Path]::DirectorySeparatorChar)
  $file = Join-Path $bundleRoot $relative
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少文件: $relative" }
  $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "文件校验失败: $relative" }
  $checked += 1
}

Write-Host "模板包完整性校验通过: $checked 个文件"
