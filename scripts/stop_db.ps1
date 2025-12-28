param(
  [switch]$Down,
  [switch]$RemoveVolumes
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if ($Down) {
  if ($RemoveVolumes) {
    Write-Host "==> docker compose down -v"
    docker compose down -v | Out-Host
  } else {
    Write-Host "==> docker compose down"
    docker compose down | Out-Host
  }
} else {
  Write-Host "==> docker compose stop db"
  docker compose stop db | Out-Host
}

Write-Host "Done."
