# ============================================================
# Check-Host.ps1 —— 学员自查：Windows 11？WSL 装了没？内存够不够？
# 用法：.\Check-Host.ps1（不需要管理员）
# 只查不改；所有项都打印出来，遇到硬门（不是 Win11 / 没 WSL）才报错退出。
# ============================================================
$ErrorActionPreference = 'Stop'

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

wsl.exe --status
Write-Host ''
Write-Host '已安装的发行版：'
wsl.exe --list --verbose
