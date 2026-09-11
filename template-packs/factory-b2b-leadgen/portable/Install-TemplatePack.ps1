[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TargetRoot,
  [switch]$Force,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$payloadRoot = Join-Path $bundleRoot 'payload'
$target = [IO.Path]::GetFullPath($TargetRoot)

& (Join-Path $bundleRoot 'Verify-Bundle.ps1')

foreach ($required in @('package.json', 'scripts', 'template-packs', 'themes', 'components', 'profiles', 'fine-cut', 'aroll-beauty')) {
  if (-not (Test-Path -LiteralPath (Join-Path $target $required))) {
    throw "目标不是兼容的 talking-head-video-factory 仓库，缺少: $required"
  }
}

foreach ($requiredFile in @(
  'scripts\template-pack.mjs',
  'scripts\qa-caption-voice.mjs',
  'scripts\qa-dialogue-continuity.mjs',
  'scripts\timeline\aroll-cues.mjs'
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $target $requiredFile) -PathType Leaf)) {
    throw "目标剪辑系统版本过旧，缺少能力文件: $requiredFile。请先迁移完整系统便携包。"
  }
}

$zoomRuntime = Join-Path $target 'scripts\timeline\aroll-cues.mjs'
foreach ($capability in @('attackFrames', 'releaseFrames', 'focusX', 'focusY')) {
  if (-not (Select-String -LiteralPath $zoomRuntime -SimpleMatch $capability -Quiet)) {
    throw "目标剪辑系统不支持完整的渐进式人脸 Zoom: $capability。请先更新完整系统。"
  }
}

$profileRegistry = Get-Content -Raw -LiteralPath (Join-Path $target 'profiles\registry.json') | ConvertFrom-Json
if ($null -eq $profileRegistry.profiles.'factory-acquisition') {
  throw '目标系统缺少 factory-acquisition profile；模板不能安全代替内容流程，请先更新完整系统。'
}
$fineCutRegistry = Get-Content -Raw -LiteralPath (Join-Path $target 'fine-cut\registry.json') | ConvertFrom-Json
if ($null -eq $fineCutRegistry.presets.'social-fast') {
  throw '目标系统缺少 social-fast 精剪预设；请先更新完整系统。'
}
$beautyRegistry = Get-Content -Raw -LiteralPath (Join-Path $target 'aroll-beauty\registry.json') | ConvertFrom-Json
if ($null -eq $beautyRegistry.presets.'factory-neutral-skin-v1') {
  throw '目标系统缺少 factory-neutral-skin-v1 美颜预设；请先更新完整系统。'
}

function Test-SameTree {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path -LiteralPath $Destination -PathType Container)) { return $false }
  $sourceFiles = @(Get-ChildItem -LiteralPath $Source -File -Recurse)
  foreach ($sourceFile in $sourceFiles) {
    $relative = [IO.Path]::GetRelativePath($Source, $sourceFile.FullName)
    $destinationFile = Join-Path $Destination $relative
    if (-not (Test-Path -LiteralPath $destinationFile -PathType Leaf)) { return $false }
    if ((Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash) { return $false }
  }
  return $true
}

function Install-Directory {
  param([string]$SourceRelative, [string]$DestinationRelative)
  $source = Join-Path $payloadRoot $SourceRelative
  $destination = Join-Path $target $DestinationRelative
  if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "payload 缺少: $SourceRelative" }
  if (Test-SameTree -Source $source -Destination $destination) {
    Write-Host "已是相同版本: $DestinationRelative"
    return
  }
  if ((Test-Path -LiteralPath $destination) -and -not $Force) {
    throw "目标已存在不同版本: $DestinationRelative；确认升级后请加 -Force"
  }
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destination -Recurse -Force
  Write-Host "已安装: $DestinationRelative"
}

function Install-File {
  param([string]$SourceRelative, [string]$DestinationRelative)
  $source = Join-Path $payloadRoot $SourceRelative
  $destination = Join-Path $target $DestinationRelative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "payload 缺少: $SourceRelative" }
  if (Test-Path -LiteralPath $destination -PathType Leaf) {
    $same = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -eq
      (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    if ($same) { Write-Host "已存在相同文件: $DestinationRelative"; return }
    if (-not $Force) { throw "目标已存在不同文件: $DestinationRelative；确认升级后请加 -Force" }
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
  Write-Host "已安装: $DestinationRelative"
}

Install-Directory 'template-packs\factory-b2b-leadgen' 'template-packs\factory-b2b-leadgen'
Install-Directory 'themes\commerce-pop' 'themes\commerce-pop'
foreach ($component in @('media-pop-sticker', 'product-domain-pop', 'ui-click-sticker', 'keyword-burst', 'hook-stack-banner', 'cta-badge')) {
  Install-Directory ("components\$component") ("components\$component")
}
Install-File 'themes\_shared\fonts\Inter-700-latin.woff2' 'themes\_shared\fonts\Inter-700-latin.woff2'
Install-File 'themes\_shared\fonts\LXGWWenKaiTC-400-latin.woff2' 'themes\_shared\fonts\LXGWWenKaiTC-400-latin.woff2'

$packRegistryFile = Join-Path $target 'template-packs\registry.json'
$packRegistry = Get-Content -Raw -LiteralPath $packRegistryFile | ConvertFrom-Json
if (-not (@($packRegistry.packs) -contains 'factory-b2b-leadgen')) {
  $packRegistry.packs = @($packRegistry.packs) + 'factory-b2b-leadgen'
  $packRegistry | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $packRegistryFile -Encoding utf8
}

$themeRegistryFile = Join-Path $target 'themes\registry.json'
$themeRegistry = Get-Content -Raw -LiteralPath $themeRegistryFile | ConvertFrom-Json
if (-not (@($themeRegistry.themes) -contains 'commerce-pop')) {
  $themeRegistry.themes = @($themeRegistry.themes) + 'commerce-pop'
  $themeRegistry | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $themeRegistryFile -Encoding utf8
}

if (-not $SkipTests) {
  Push-Location $target
  try {
    & npm run test:contracts
    if ($LASTEXITCODE -ne 0) { throw '模板合同测试失败' }
    & npm run test:visual-library
    if ($LASTEXITCODE -ne 0) { throw '视觉组件测试失败' }
  } finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'factory-b2b-leadgen 1.0.0 安装完成。'
Write-Host '新项目请选择: profile=factory-acquisition, fineCutPreset=social-fast, templatePack=factory-b2b-leadgen'
