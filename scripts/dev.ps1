param(
  [int]$DbPort = 5433,
  [string]$DbHost = "127.0.0.1",
  [string]$DbName = "erp",
  [string]$DbUser = "erp",
  [string]$DbPassword = "erp",
  [switch]$RunServer
)

$ErrorActionPreference = "Stop"

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

Write-Host "==> Starting db container (docker compose up -d db)"
Set-Location $RepoRoot
docker compose up -d db | Out-Host

Write-Host "==> Activating backend venv"
if (!(Test-Path "$BackendDir\.venv\Scripts\Activate.ps1")) {
  Write-Error "Backend venv not found at: $BackendDir\.venv. Create it first (python -m venv .venv) and install deps."
  exit 1
}
Set-Location $BackendDir
. .\.venv\Scripts\Activate.ps1

Write-Host "==> Exporting env vars for Postgres"
$env:USE_POSTGRES = "1"
$env:PG_DB = $DbName
$env:PG_USER = $DbUser
$env:PG_PASSWORD = $DbPassword
$env:PG_HOST = $DbHost
$env:PG_PORT = "$DbPort"

Write-Host "==> Checking DB connectivity (psycopg)"
if (!(Test-Path $DbCheckPath)) {
  Write-Error "db_check.py not found at: $DbCheckPath. Ensure it exists under repo root scripts/."
  exit 1
}
python $DbCheckPath
if ($LASTEXITCODE -ne 0) {
  Write-Error "ERROR: DB connectivity check failed. Verify DbHost/DbPort and credentials."
  exit $LASTEXITCODE
}

Write-Host "==> Running migrations"
python manage.py migrate

if ($RunServer) {
  Write-Host "==> Starting Django dev server"
  python manage.py runserver
} else {
  Write-Host "Done. (Add -RunServer to start the dev server.)"
}
