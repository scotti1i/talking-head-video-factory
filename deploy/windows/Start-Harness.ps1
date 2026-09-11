param(
  [string]$Config = "$PSScriptRoot\factory.config.psd1"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Config)) { throw "缺少配置文件: $Config" }
$settings = Import-PowerShellDataFile $Config
$version = if ($settings.DshVersion) { $settings.DshVersion } else { '0.1.1-rc.2' }
$runner = "$($settings.WslRepo)/deploy/windows/Run-Harness.sh"
& wsl.exe -d $settings.Distro -- bash $runner $settings.WslOutbox $version
if ($LASTEXITCODE -ne 0) { throw 'DeepSeek Harness 启动失败。' }
