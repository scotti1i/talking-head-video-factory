#Requires -RunAsAdministrator
# ============================================================
# Install-Host.ps1 —— 学员 Windows 侧一次性准备：装 WSL2 + Ubuntu
# 用法（管理员 PowerShell）：
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   .\Install-Host.ps1
# 第一次跑会装 WSL 并要求重启；重启后打开「Ubuntu」创建 Linux 用户，再跑 Bootstrap-Ubuntu.sh。
# NVIDIA 显卡不是必需：没有显卡照样能剪，只是 whisper 转录慢（10 分钟原片约 3-6 分钟）。
# 出处：从分支 v2 的部署脚本精简（去掉 DataRoot / Inbox / 显卡硬门）—— 2026-09-18
# ============================================================
param(
  [string]$Distro = 'Ubuntu'
)

$ErrorActionPreference = 'Stop'
$os = Get-CimInstance Win32_OperatingSystem
$installedMemoryBytes = (Get-CimInstance Win32_PhysicalMemory |
  Measure-Object -Property Capacity -Sum).Sum
$memoryGb = [math]::Round($installedMemoryBytes / 1GB, 1)

# ---------- 硬件门槛：Windows 11 是硬门，内存与显卡只提示
if ([int]$os.BuildNumber -lt 22000) {
  throw '需要 Windows 11（内部版本 22000 以上）。请先升级系统并重启。'
}
if ($memoryGb -lt 16) {
  Write-Warning "内存 ${memoryGb}GB 低于 16GB：Remotion 渲染 + Chromium 抽帧可能被 WSL 杀掉。能装，但建议加内存。"
} elseif ($memoryGb -lt 32) {
  Write-Host "内存 ${memoryGb}GB：够用。想更稳可把 wslconfig-16gb.example 复制为 %USERPROFILE%\.wslconfig。"
}

$systemDrive = Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))
$freeGb = [math]::Round($systemDrive.Free / 1GB, 1)
if ($freeGb -lt 30) {
  throw "$($env:SystemDrive) 可用空间只有 ${freeGb}GB。WSL 发行版 + 依赖 + whisper 模型约需 15GB，再加原片和成片，至少留 30GB。"
}

# ---------- NVIDIA 可选：有就提示后面可编 CUDA 版 whisper，没有照样跑
if (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue) {
  Write-Host 'INFO 检测到 NVIDIA 驱动：WSL 里装 CUDA Toolkit 后，Bootstrap-Ubuntu.sh 会自动编 GPU 版 whisper（转录快 5-10 倍）。'
} else {
  Write-Host 'INFO 未检测到 NVIDIA 显卡：不影响安装，转录走 CPU，只是慢一些。'
}

# ---------- WSL：缺就装（第一次必须重启）
$installed = @()
$previousErrorActionPreference = $ErrorActionPreference
try {
  # 第一次装机 wsl.exe 会报「没有已安装的发行版」，Windows PowerShell 5.1 会把 stderr 当终止错误，先放行
  $ErrorActionPreference = 'Continue'
  $wslOutput = @(wsl.exe --list --quiet 2>$null)
  if ($LASTEXITCODE -eq 0) {
    $installed = $wslOutput -replace "`0", ''
  }
}
finally {
  $ErrorActionPreference = $previousErrorActionPreference
}
if ($installed -notcontains $Distro) {
  Write-Host "正在安装 WSL2 与 $Distro ……装完必须重启 Windows。"
  Write-Host "重启后从开始菜单打开「$Distro」，按提示创建 Linux 用户名和密码（密码输入时不显示，正常）。"
  wsl.exe --install -d $Distro
  Write-Host ''
  Write-Host '>>> 现在重启电脑。重启后打开 Ubuntu 建好用户，再回到 deploy/windows/README.md 做第 3 步。'
  exit 3010
}

wsl.exe --set-default-version 2
wsl.exe --update
wsl.exe --list --verbose
Write-Host ''
Write-Host "Windows 侧准备完成。下一步：打开「$Distro」，按 deploy/windows/README.md 第 3 步跑 Bootstrap-Ubuntu.sh。"
