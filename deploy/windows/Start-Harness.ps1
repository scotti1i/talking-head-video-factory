param(
  [string]$Config = "$PSScriptRoot\factory.config.psd1"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Config)) { throw "缺少配置文件: $Config" }
$settings = Import-PowerShellDataFile $Config
$version = if ($settings.DshVersion) { $settings.DshVersion } else { '0.1.1-rc.2' }
$command = "cd '$($settings.WslRepo)' && export FACTORY_OUTBOX='$($settings.WslOutbox)' && export NODE_OPTIONS='--max-old-space-size=6144' && if [ -f ~/.config/talking-head-factory/env ]; then set -a; source ~/.config/talking-head-factory/env; set +a; fi && npx --yes @deepseek-ai/dsh@$version web"
wsl.exe -d $settings.Distro -- bash -lc $command
if ($LASTEXITCODE -ne 0) { throw 'DeepSeek Harness 启动失败。' }
