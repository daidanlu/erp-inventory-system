param(
  [int]$DbPort = 5433,
  [string]$DbHost = "127.0.0.1",
  [string]$DbName = "erp",
  [string]$DbUser = "erp",
  [string]$DbPassword = "erp",
  [switch]$CreateSuperUser,
  [string]$AdminUser = "admin",
  [string]$AdminEmail = "admin@example.com",
  [string]$AdminPassword = "admin123",
  [switch]$RunServer
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  # Repo root is the parent of this scripts/ folder
  return (Split-Path -Parent $PSScriptRoot)
}

function Assert-DockerRunning {
  Write-Host "==> Checking Docker engine..."
  try {
    docker info | Out-Null
  } catch {
    throw "Docker engine not reachable. Please start Docker Desktop (or Docker service) and retry."
  }
}

function Wait-PostgresReady {
  param(
    [string]$ContainerId,
    [string]$User,
    [string]$Db,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    # Windows PowerShell quirk:
    # When the DB isn't ready yet, pg_isready often writes to stderr; PS can surface that as an error line.
    # Redirect BOTH stdout/stderr to $null and rely on $LASTEXITCODE.
    $null = docker exec $ContainerId pg_isready -U $User -d $Db 1>$null 2>$null

    if ($LASTEXITCODE -eq 0) {
      Write-Host "==> Postgres is ready."
      return
    }

    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for Postgres to be ready (>${TimeoutSeconds}s)."
}

$RepoRoot = Get-RepoRoot
$BackendDir = Join-Path $RepoRoot "erp-backend"

Write-Host "==> RepoRoot: $RepoRoot"
Write-Host "==> BackendDir: $BackendDir"

Assert-DockerRunning

Write-Host "==> Resetting DB (docker compose down -v)"
Set-Location $RepoRoot
docker compose down -v | Out-Host

Write-Host "==> Starting DB (docker compose up -d db)"
docker compose up -d db | Out-Host

$cid = (docker compose ps -q db).Trim()
if (-not $cid) { throw "Could not find db container id. Is the compose service name 'db'?" }

Wait-PostgresReady -ContainerId $cid -User $DbUser -Db $DbName -TimeoutSeconds 60

Write-Host "==> Activating backend venv"
Set-Location $BackendDir
. .\.venv\Scripts\Activate.ps1

Write-Host "==> Exporting env vars for Postgres"
$env:USE_POSTGRES = "1"
$env:PG_DB = $DbName
$env:PG_USER = $DbUser
$env:PG_PASSWORD = $DbPassword
$env:PG_HOST = $DbHost
$env:PG_PORT = "$DbPort"

Write-Host "==> Running migrations"
python manage.py migrate

if ($CreateSuperUser) {
  Write-Host "==> Creating Django superuser (non-interactive)"
  $env:DJANGO_SUPERUSER_USERNAME = $AdminUser
  $env:DJANGO_SUPERUSER_EMAIL = $AdminEmail
  $env:DJANGO_SUPERUSER_PASSWORD = $AdminPassword

  python manage.py createsuperuser --noinput

  Remove-Item Env:\DJANGO_SUPERUSER_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:\DJANGO_SUPERUSER_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:\DJANGO_SUPERUSER_PASSWORD -ErrorAction SilentlyContinue
}

if ($RunServer) {
  Write-Host "==> Starting Django dev server"
  python manage.py runserver
} else {
  Write-Host "Done. (Tip: add -RunServer to start the dev server.)"
}
