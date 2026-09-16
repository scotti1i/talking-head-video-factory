# ============================================================
# Install-Scheduled-Task.ps1 —— 注册每日心跳计划任务（幂等）
# 为什么：spec v2.0.3 §E——客户机每天 03:30 自动 heartbeat（体检 + 回流 + 自动升级），
# 不依赖人记得开工。任务名固定 TalkingHeadFactoryHeartbeat；重复运行只更新不重复注册。
# 用法（PowerShell，Bootstrap-Ubuntu.sh 结尾会自动调）：
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File Install-Scheduled-Task.ps1 [-Distro Ubuntu] [-WslRepo /home/x/repo]
# 验证：schtasks /Query /TN TalkingHeadFactoryHeartbeat
# 说明：任务以当前用户、登录态运行（WSL 需要交互会话）；错过时间点开机后补跑。
# ============================================================
param(
  [string]$Config = (Join-Path $PSScriptRoot 'factory.config.psd1'),
  [string]$Distro,
  [string]$WslRepo,
  [string]$TaskName = 'TalkingHeadFactoryHeartbeat',
  [string]$At = '03:30'
)

$ErrorActionPreference = 'Stop'

if (-not $Distro -or -not $WslRepo) {
  if (-not (Test-Path $Config)) { throw "缺少本机配置：$Config（或显式传 -Distro / -WslRepo）" }
  $settings = Import-PowerShellDataFile $Config
  if (-not $Distro) { $Distro = $settings.Distro }
  if (-not $WslRepo) { $WslRepo = $settings.WslRepo }
}
if (-not $Distro) { throw '配置缺少 Distro' }
if (-not $WslRepo) { throw '配置缺少 WslRepo' }

$script = "$WslRepo/deploy/windows/Run-Heartbeat.sh"
$action = New-ScheduledTaskAction -Execute 'wsl.exe' -Argument "-d $Distro -- bash $script"
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settingsSet = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$description = "talking-head-video-factory 每日心跳：doctor + 回流 + 自动升级（$WslRepo）"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Set-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settingsSet -Principal $principal | Out-Null
  Write-Output "计划任务已更新：$TaskName（每日 $At，wsl -d $Distro -- bash $script）"
} else {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settingsSet -Principal $principal -Description $description | Out-Null
  Write-Output "计划任务已注册：$TaskName（每日 $At，wsl -d $Distro -- bash $script）"
}
Write-Output "验证：schtasks /Query /TN $TaskName"
