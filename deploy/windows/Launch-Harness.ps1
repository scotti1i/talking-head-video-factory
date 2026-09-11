param(
  [string]$Url = 'http://127.0.0.1:3080',
  [int]$StartupTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$startScript = Join-Path $PSScriptRoot 'Start-Harness.ps1'
$config = Join-Path $PSScriptRoot 'factory.config.psd1'
$logDir = 'D:\AutoEdit\Install\logs'
$stdoutLog = Join-Path $logDir 'harness.stdout.log'
$stderrLog = Join-Path $logDir 'harness.stderr.log'

function Test-Harness {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return [int]$response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Show-LaunchError([string]$Message) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($Message, '工厂口播 Harness', 'OK', 'Error') | Out-Null
}

$launcherMutex = New-Object System.Threading.Mutex($false, 'Local\FactoryTalkingHeadHarnessLauncher')
if (-not $launcherMutex.WaitOne(0)) { exit 0 }

if (Test-Harness) {
  Start-Process $Url
  exit 0
}

if (-not (Test-Path $startScript)) { Show-LaunchError "缺少启动脚本：$startScript"; exit 1 }
if (-not (Test-Path $config)) { Show-LaunchError "缺少本机配置：$config"; exit 1 }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$startScript`"",
  '-Config', "`"$config`""
)
Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
do {
  Start-Sleep -Seconds 1
  if (Test-Harness) {
    Start-Process $Url
    exit 0
  }
} while ((Get-Date) -lt $deadline)

Show-LaunchError "Harness 在 ${StartupTimeoutSeconds} 秒内未启动。请检查日志：`n$stdoutLog`n$stderrLog"
exit 1
