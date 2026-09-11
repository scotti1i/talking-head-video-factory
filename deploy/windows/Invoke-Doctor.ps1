param(
  [string]$Config = "$PSScriptRoot\factory.config.psd1",
  [switch]$RequireHdr
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Config)) { throw "缺少配置文件: $Config" }
$settings = Import-PowerShellDataFile $Config
$runner = "$($settings.WslRepo)/deploy/windows/Run-Doctor.sh"
$arguments = @('-d', $settings.Distro, '--', 'bash', $runner)
if ($RequireHdr) { $arguments += '--require-hdr' }
& wsl.exe @arguments
if ($LASTEXITCODE -ne 0) { throw 'Factory doctor 未通过。' }
