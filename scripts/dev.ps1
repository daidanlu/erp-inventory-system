param(
  [int]$DbPort = 5433,
  [string]$DbHost = "127.0.0.1",
  [string]$DbName = "erp",
  [string]$DbUser = "erp",
  [string]$DbPassword,
  [string]$EnvFile = "",
  [switch]$RunServer
)

$ErrorActionPreference = "Stop"

function Import-DotEnv([string]$PathToEnv) {
  if (-not (Test-Path $PathToEnv)) { return $false }

  Write-Host "==> Loading env file: $PathToEnv"
  Get-Content $PathToEnv | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }

    # support KEY=VALUE (VALUE may be quoted)
    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) { return }

    $key = $parts[0].Trim()
    $val = $parts[1].Trim()

    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }

    if (Test-Path "Env:$key") { return }

    Set-Item -Path "Env:$key" -Value $val
  }

  return $true
}

# Repo root is the parent of this scripts/ folder
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "erp-backend"
$DbCheckPath = Join-Path $RepoRoot "scripts\db_check.py"

Write-Host "==> RepoRoot: $RepoRoot"
Write-Host "==> BackendDir: $BackendDir"

Write-Host "==> Checking Docker engine..."
try {
  docker info | Out-Null
} catch {
  Write-Error "Docker engine not reachable. Start Docker Desktop (Linux containers) and try again."
  exit 1
}

# Load env file (optional)
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $c1 = Join-Path $RepoRoot ".env.local"
  $c2 = Join-Path $RepoRoot ".env"
  if (-not (Import-DotEnv $c1)) {
    Import-DotEnv $c2 | Out-Null
  }
} else {
  Import-DotEnv $EnvFile | Out-Null
}

# Parameters override env values
if ($DbHost) { $env:PG_HOST = $DbHost }
if ($DbPort) { $env:PG_PORT = "$DbPort" }
if ($DbName) { $env:PG_DB = $DbName }
if ($DbUser) { $env:PG_USER = $DbUser }
if ($DbPassword) { $env:PG_PASSWORD = $DbPassword }

Write-Host "==> Starting db container (docker compose up -d db)"
Set-Location $RepoRoot
docker compose up -d db | Out-Host

Write-Host "==> Activating backend venv"
Set-Location $BackendDir
. .\.venv\Scripts\Activate.ps1

Write-Host "==> Exporting env vars for Postgres"
$env:USE_POSTGRES = "1"
# If any PG_* are still missing, fallback to the classic defaults
if ([string]::IsNullOrEmpty($env:PG_DB)) { $env:PG_DB = "erp" }
if ([string]::IsNullOrEmpty($env:PG_USER)) { $env:PG_USER = "erp" }
if ([string]::IsNullOrEmpty($env:PG_PASSWORD)) { $env:PG_PASSWORD = "erp" }
if ([string]::IsNullOrEmpty($env:PG_HOST)) { $env:PG_HOST = "127.0.0.1" }
if ([string]::IsNullOrEmpty($env:PG_PORT)) { $env:PG_PORT = "5433" }

Write-Host "==> Checking DB connectivity (psycopg)"
python $DbCheckPath

Write-Host "==> Running migrations"
python manage.py migrate

if ($RunServer) {
  Write-Host "==> Starting Django dev server"
  python manage.py runserver
} else {
  Write-Host "Done. (Add -RunServer to start the dev server.)"
}
