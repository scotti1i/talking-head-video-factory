#Requires -RunAsAdministrator
param(
  [string]$DataRoot = 'D:\AutoEdit',
  [string]$Distro = 'Ubuntu'
)

$ErrorActionPreference = 'Stop'
$os = Get-CimInstance Win32_OperatingSystem
$installedMemoryBytes = (Get-CimInstance Win32_PhysicalMemory |
  Measure-Object -Property Capacity -Sum).Sum
$memoryGb = [math]::Round($installedMemoryBytes / 1GB, 1)

if ([int]$os.BuildNumber -lt 22000) {
  throw '正式部署要求 Windows 11。请先升级系统并重启。'
}
if ($memoryGb -lt 16) { throw '内存低于 16GB，不能稳定运行。' }
if ($memoryGb -lt 32) { Write-Warning "当前 ${memoryGb}GB 仅建议试点，生产建议 32GB。" }

$drive = Split-Path -Qualifier $DataRoot
if (-not $drive) { throw "DataRoot 必须包含盘符: $DataRoot" }
$driveName = $drive.TrimEnd(':')
$disk = Get-PSDrive -Name $driveName
$freeGb = [math]::Round($disk.Free / 1GB, 1)
if ($freeGb -lt 50) { throw "${drive} 可用空间只有 ${freeGb}GB，至少需要 50GB。" }
if ($freeGb -lt 100) { Write-Warning "${drive} 可用空间 ${freeGb}GB；建议预留 100GB。" }

if (-not (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue)) {
  throw '未检测到 NVIDIA Windows 驱动。请安装适配当前 RTX 显卡的最新生产/Studio 驱动并重启。'
}
nvidia-smi.exe

New-Item -ItemType Directory -Force -Path `
  "$DataRoot\Install", `
  "$DataRoot\Inbox", `
  "$DataRoot\Outbox" | Out-Null

$installed = @()
$previousErrorActionPreference = $ErrorActionPreference
try {
  # A missing WSL feature is the expected state on a first-time install. Windows
  # PowerShell 5.1 otherwise promotes wsl.exe's stderr to a terminating error.
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
  Write-Host "正在安装 WSL2 与 $Distro。命令完成后必须重启 Windows，再打开 Ubuntu 创建 Linux 用户。"
  wsl.exe --install -d $Distro
  exit 3010
}

wsl.exe --set-default-version 2
wsl.exe --update
wsl.exe --list --verbose
wsl.exe -d $Distro -- nvidia-smi
Write-Host "Windows 宿主准备完成。下一步在 WSL 仓库中运行 deploy/windows/Bootstrap-Ubuntu.sh。"
