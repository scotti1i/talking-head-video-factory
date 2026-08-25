param(
  [string]$Config = "$PSScriptRoot\factory.config.psd1",
  [switch]$RequireHdr
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Config)) { throw "缺少配置文件: $Config" }
$settings = Import-PowerShellDataFile $Config
$hdr = if ($RequireHdr) { ' --require-hdr' } else { '' }
$command = "cd '$($settings.WslRepo)' && if [ -f ~/.config/talking-head-factory/env ]; then set -a; source ~/.config/talking-head-factory/env; set +a; fi && npm run doctor:deployment -- --production$hdr"
wsl.exe -d $settings.Distro -- bash -lc $command
if ($LASTEXITCODE -ne 0) { throw 'Factory doctor 未通过。' }
