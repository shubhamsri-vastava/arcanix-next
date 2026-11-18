param(
  [switch]$Replace
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$targetPath = Join-Path $repoRoot '.env.development.local'
$productionProjectRef = 'tacaqmstvqbvkpibhlnz'

if ((Test-Path -LiteralPath $targetPath) -and -not $Replace) {
  throw '.env.development.local already exists. Review it in your environment editor, or rerun with -Replace to replace it.'
}

$projectRef = (Read-Host 'Development Supabase project reference (non-secret)').Trim()
if ($projectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'Project reference format is invalid; expected the 20-character Supabase reference.'
}
if ($projectRef -eq $productionProjectRef) {
  throw 'Refusing to configure the known production Supabase project.'
}

$urlText = (Read-Host 'Development Project URL (https://<project-ref>.supabase.co)').Trim()
try { $url = [Uri]$urlText } catch { throw 'Project URL is invalid.' }
if ($url.Scheme -ne 'https' -or $url.Host -ne "$projectRef.supabase.co" -or $url.AbsolutePath -ne '/' -or $url.Query -or $url.Fragment) {
  throw 'Project URL must be https://<same-development-project-ref>.supabase.co with no path or query.'
}

$secureKey = Read-Host 'Development publishable key (input is hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $publishableKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($publishableKey) -or $publishableKey -match '\s|[\r\n]') {
    throw 'Publishable key is empty or contains whitespace.'
  }

  $contents = @(
    "NEXT_PUBLIC_SUPABASE_URL=$urlText"
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$publishableKey"
    "ARCANIX_SUPABASE_DEV_PROJECT_REF=$projectRef"
    "NEXT_PUBLIC_ARCANIX_SUPABASE_DEV_PROJECT_REF=$projectRef"
  ) -join [Environment]::NewLine
  [IO.File]::WriteAllText($targetPath, $contents, [Text.UTF8Encoding]::new($false))
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  $publishableKey = $null
}

$ignoreRules = Get-Content -LiteralPath (Join-Path $repoRoot '.gitignore')
if ($ignoreRules -notcontains '.env*.local') {
  Remove-Item -LiteralPath $targetPath -Force
  throw '.gitignore does not contain the expected .env*.local ignore rule; removed the just-created environment file.'
}

Write-Host "Development environment configured for project $projectRef. Credential values were not printed."
Write-Host 'The .env*.local ignore rule covers .env.development.local.'
