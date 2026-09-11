#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$Distro = 'Ubuntu',
  [string]$DataRoot = 'D:\AutoEdit',
  [switch]$Force,
  [switch]$SkipBootstrap
)

$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$payloadRepo = Join-Path $bundleRoot 'payload\talking-head-video-factory'
$verifyScript = Join-Path $bundleRoot 'Verify-Package.ps1'

if (-not (Test-Path -LiteralPath $payloadRepo -PathType Container)) {
  throw "部署包不完整，缺少仓库 payload: $payloadRepo"
}
if (-not (Test-Path -LiteralPath $verifyScript -PathType Leaf)) {
  throw "部署包不完整，缺少校验器: $verifyScript"
}

& $verifyScript

$hostInstaller = Join-Path $payloadRepo 'deploy\windows\Install-Host.ps1'
Write-Host '阶段 1/4：检查 Windows、磁盘、NVIDIA 驱动与 WSL2。'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hostInstaller -DataRoot $DataRoot -Distro $Distro
$hostExit = $LASTEXITCODE
if ($hostExit -eq 3010) {
  Write-Warning 'WSL/Ubuntu 已安排安装。请重启 Windows，打开一次 Ubuntu 并创建 Linux 用户，然后重新运行本脚本。'
  exit 3010
}
if ($hostExit -ne 0) { throw "Windows 宿主安装失败，退出码: $hostExit" }

Write-Host '阶段 2/4：把仓库复制到 WSL Linux 文件系统。'
$linuxHome = (& wsl.exe -d $Distro -- bash -lc 'printf %s "$HOME"').Trim()
if ($LASTEXITCODE -ne 0 -or -not $linuxHome.StartsWith('/')) {
  throw "无法读取 $Distro 的 Linux HOME。请先打开 Ubuntu 完成首次用户创建。"
}
$targetRepo = "$linuxHome/talking-head-video-factory"
$payloadWsl = (& wsl.exe -d $Distro -- wslpath -a -u $payloadRepo).Trim()
if ($LASTEXITCODE -ne 0 -or -not $payloadWsl.StartsWith('/mnt/')) {
  throw '无法把部署包路径转换为 WSL 路径。请把 ZIP 解压到本机固定目录后重试。'
}

$bundleId = (Get-Content -Raw -LiteralPath (Join-Path $bundleRoot 'bundle-manifest.json') | ConvertFrom-Json).bundleId
$exists = (& wsl.exe -d $Distro -- bash -c 'test -f "$1/.factory-portable-bundle" && cat "$1/.factory-portable-bundle" || true' bash $targetRepo).Trim()

if ($exists -eq $bundleId) {
  Write-Host "已安装相同部署包，跳过仓库复制: $targetRepo"
} else {
  $nonEmpty = (& wsl.exe -d $Distro -- bash -c 'test -d "$1" && test -n "$(find "$1" -mindepth 1 -maxdepth 1 -print -quit)" && printf yes || true' bash $targetRepo).Trim()
  if ($nonEmpty -eq 'yes' -and -not $Force) {
    throw "目标仓库已存在且不是同一部署包: $targetRepo。确认覆盖更新后请加 -Force；脚本不会删除目标中已有文件。"
  }
  & wsl.exe -d $Distro -- bash -c 'mkdir -p "$2" && cp -a "$1"/. "$2"/ && printf "%s" "$3" > "$2/.factory-portable-bundle"' bash $payloadWsl $targetRepo $bundleId
  if ($LASTEXITCODE -ne 0) { throw '复制仓库到 WSL 失败。' }
}

if ($SkipBootstrap) {
  Write-Host "仓库复制完成，已按要求跳过依赖安装: $targetRepo"
  exit 0
}

Write-Host '阶段 3/4：安装 Node、FFmpeg、Whisper、字体与项目依赖。此阶段会要求输入 Ubuntu sudo 密码。'
& wsl.exe -d $Distro -- bash -c 'bash "$1/deploy/windows/Bootstrap-Ubuntu.sh"' bash $targetRepo
if ($LASTEXITCODE -ne 0) { throw 'WSL 依赖安装失败。修复网络或依赖问题后可直接重跑本脚本。' }

Write-Host '阶段 4/4：运行模板、工作流和视觉组件测试。'
& wsl.exe -d $Distro -- bash -c 'source "$HOME/.nvm/nvm.sh" && cd "$1" && npm run test:contracts && npm run test:workflow && npm run test:visual-library && npm run doctor:deployment' bash $targetRepo
if ($LASTEXITCODE -ne 0) { throw '部署后测试未全部通过。请把终端错误交给 Codex 继续修复。' }

Write-Host ''
Write-Host '完整剪辑系统部署完成。'
Write-Host "仓库: \\wsl.localhost\$Distro$($targetRepo.Replace('/', '\'))"
Write-Host "收件箱: $DataRoot\Inbox"
Write-Host "交付目录: $DataRoot\Outbox"
Write-Host '下一步：安装并登录 Codex，打开上述 WSL 仓库，然后粘贴 CODEX-NEW-COMPUTER-PROMPT.md 中的提示词。'
