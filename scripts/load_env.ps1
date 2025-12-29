param(
  [Parameter(Mandatory=$true)][string]$EnvFile
)

if (!(Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }

  $parts = $line.Split("=", 2)
  if ($parts.Count -ne 2) { return }

  $key = $parts[0].Trim()
  $val = $parts[1].Trim()

  # strip optional quotes
  if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
    $val = $val.Substring(1, $val.Length - 2)
  }

  [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
}
