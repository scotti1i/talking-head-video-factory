param(
  [string]$Config = "$PSScriptRoot\factory.config.psd1"
)

# 与 Invoke-Doctor.ps1 同构：只读本机配置拿 Distro / WslRepo，
# 真正的校验在 WSL 内由 Validate-GeminiKey.sh 完成，密钥不经过 Windows 侧。
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Config)) { throw "缺少配置文件: $Config" }
$settings = Import-PowerShellDataFile $Config
$runner = "$($settings.WslRepo)/deploy/windows/Validate-GeminiKey.sh"
& wsl.exe -d $settings.Distro -- bash $runner
if ($LASTEXITCODE -ne 0) { throw 'Gemini Key 校验未通过。' }
