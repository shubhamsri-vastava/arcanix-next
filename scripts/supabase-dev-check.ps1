[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$DevelopmentProjectRef = $env:ARCANIX_SUPABASE_DEV_PROJECT_REF,
  [switch]$ListMigrations
)

$productionProjectRef = 'tacaqmstvqbvkpibhlnz'

if ([string]::IsNullOrWhiteSpace($DevelopmentProjectRef)) {
  Write-Error 'Missing development project reference. Pass it as an argument or set ARCANIX_SUPABASE_DEV_PROJECT_REF.'
  exit 2
}

$target = $DevelopmentProjectRef.Trim().ToLowerInvariant()
Write-Host "Target development project reference: $target"

if ($target -eq $productionProjectRef) {
  Write-Error 'Refusing to continue: the supplied reference is the protected Arcanix production project.'
  exit 3
}

if ($target -notmatch '^[a-z0-9]{20}$') {
  Write-Error 'The supplied value does not look like a Supabase project reference. No action was taken.'
  exit 4
}

Write-Host 'Safety check passed. This helper does not link projects, apply migrations, reset databases, or call Supabase.'

if ($ListMigrations) {
  $migrationDirectory = Join-Path $PSScriptRoot '..\supabase\migrations'
  if (!(Test-Path -LiteralPath $migrationDirectory)) {
    Write-Error 'Migration directory was not found.'
    exit 5
  }

  Write-Host 'Local migration files:'
  Get-ChildItem -LiteralPath $migrationDirectory -File -Filter '*.sql' |
    Sort-Object Name |
    ForEach-Object { Write-Host " - $($_.Name)" }
}

exit 0
