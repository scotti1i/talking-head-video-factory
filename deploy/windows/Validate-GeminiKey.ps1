$ErrorActionPreference = 'Stop'

$envPath = '\\wsl.localhost\Ubuntu\home\factory\.config\talking-head-factory\env'
if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'WSL 私有配置不存在。'
}

$keyLine = Get-Content -LiteralPath $envPath |
  Where-Object { $_ -match '^GEMINI_API_KEY=.' } |
  Select-Object -Last 1
if (-not $keyLine) {
  throw 'GEMINI_API_KEY 未配置。'
}

$apiKey = $keyLine.Substring('GEMINI_API_KEY='.Length)
try {
  $result = Invoke-RestMethod `
    -Method Get `
    -Uri 'https://generativelanguage.googleapis.com/v1beta/models' `
    -Headers @{ 'x-goog-api-key' = $apiKey } `
    -TimeoutSec 30
  [pscustomobject]@{
    Configured = $true
    Valid = $true
    HttpStatus = 200
    ModelCount = @($result.models).Count
  } | Format-List
}
catch {
  $statusCode = $null
  $apiStatus = $null
  if ($_.Exception.Response) {
    $statusCode = [int]$_.Exception.Response.StatusCode
  }
  if ($_.ErrorDetails.Message) {
    try {
      $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
      $apiStatus = $errorBody.error.status
    }
    catch {
      $apiStatus = 'UNPARSEABLE_ERROR'
    }
  }
  [pscustomobject]@{
    Configured = $true
    Valid = $false
    HttpStatus = $statusCode
    ApiStatus = $apiStatus
  } | Format-List
  exit 2
}
finally {
  $apiKey = $null
  $keyLine = $null
}
