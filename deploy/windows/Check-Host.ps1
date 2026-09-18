# ============================================================
# Check-Host.ps1 —— 学员自查：Windows 11？WSL 装了没？内存够不够？
# 用法：.\Check-Host.ps1（不需要管理员）
# 只查不改；所有项都打印出来，遇到硬门（不是 Win11 / 没 WSL）才报错退出。
# ============================================================
$ErrorActionPreference = 'Stop'

# wsl.exe 的 stdout 是 UTF-16LE，Windows PowerShell 5.1 按 OEM 代码页解码后每个字符夹一个 NUL、行尾残留 "\r"，
# 直接比较 / 打印都不对；统一在这里去 NUL、去首尾空白、丢空行。stderr 一并收（首次装机 wsl 会往 stderr 报「没有发行版」）。
function Invoke-Wsl {
  param([string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $raw = @(& wsl.exe @Arguments 2>&1) } finally { $ErrorActionPreference = $previous }
  $script:WslExitCode = $LASTEXITCODE
  foreach ($line in $raw) {
    $text = ([string]$line -replace "`0", '').Trim()
    if ($text -ne '') { $text }
  }
}

$os = Get-CimInstance Win32_OperatingSystem
$installedMemoryBytes = (Get-CimInstance Win32_PhysicalMemory |
  Measure-Object -Property Capacity -Sum).Sum
$memoryGb = [math]::Round($installedMemoryBytes / 1GB, 1)
$windows11 = [int]$os.BuildNumber -ge 22000
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue

Write-Host "Windows build: $($os.BuildNumber)  ($($os.Caption))"
Write-Host "Memory: ${memoryGb} GB"
Write-Host "WSL: $([bool]$wsl)"

if (-not $windows11) { throw '需要 Windows 11。请先升级系统。' }
if ($memoryGb -lt 16) { Write-Warning "内存 ${memoryGb}GB 低于 16GB：能跑，但渲染时可能被 WSL 因内存不足杀掉；建议加到 16GB 以上。" }
if (-not $wsl) { throw '缺少 WSL。请以管理员身份运行 deploy/windows/Install-Host.ps1。' }

Invoke-Wsl @('--status') | ForEach-Object { Write-Host $_ }
Write-Host ''
Write-Host '已安装的发行版：'
Invoke-Wsl @('--list', '--verbose') | ForEach-Object { Write-Host $_ }
if ($WslExitCode -ne 0) { throw "wsl.exe --list 退出码 $WslExitCode：WSL 装了但还没有发行版。请以管理员身份运行 deploy/windows/Install-Host.ps1。" }
