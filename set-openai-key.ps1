$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot ".env"
$key = Read-Host "请输入你的 OPENAI_API_KEY"

if ([string]::IsNullOrWhiteSpace($key)) {
  throw "OPENAI_API_KEY 不能为空。"
}

if (-not (Test-Path $envPath)) {
  @(
    "APP_USERNAME=demo"
    "APP_PASSWORD=demo123"
    "OPENAI_API_KEY="
    "OPENAI_MODEL=gpt-5.4-mini"
    "OPENAI_PROXY_URL=http://127.0.0.1:7890"
    "PORT=3000"
  ) | Set-Content -LiteralPath $envPath -Encoding UTF8
}

$lines = Get-Content -LiteralPath $envPath
$found = $false
$updated = foreach ($line in $lines) {
  if ($line -match "^OPENAI_API_KEY=") {
    $found = $true
    "OPENAI_API_KEY=$key"
  } else {
    $line
  }
}

if (-not $found) {
  $updated += "OPENAI_API_KEY=$key"
}

$updated | Set-Content -LiteralPath $envPath -Encoding UTF8
Write-Host "OPENAI_API_KEY 已写入 .env。请重启服务器：.\run.ps1"
