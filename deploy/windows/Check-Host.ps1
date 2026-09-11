$ErrorActionPreference = 'Stop'

$os = Get-CimInstance Win32_OperatingSystem
$installedMemoryBytes = (Get-CimInstance Win32_PhysicalMemory |
  Measure-Object -Property Capacity -Sum).Sum
$memoryGb = [math]::Round($installedMemoryBytes / 1GB, 1)
$windows11 = [int]$os.BuildNumber -ge 22000
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
$nvidia = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue

Write-Host "Windows build: $($os.BuildNumber)"
Write-Host "Memory: ${memoryGb} GB"
Write-Host "WSL: $([bool]$wsl)"
Write-Host "NVIDIA driver: $([bool]$nvidia)"

if (-not $windows11) { throw '生产机需要升级到 Windows 11。' }
if ($memoryGb -lt 16) { throw '内存低于 16GB，无法稳定运行。' }
if ($memoryGb -lt 32) { Write-Warning '可以试点，但建议升级到 32GB。' }
if (-not $wsl) { throw '缺少 WSL2。请先以管理员身份运行 wsl --install。' }
if (-not $nvidia) { throw '缺少 NVIDIA 驱动或 nvidia-smi 不在 PATH。' }

wsl.exe --status
nvidia-smi.exe
