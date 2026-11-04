param([string]$PostgresBin = 'D:\PostgreSQL\New folder\bin')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.local'
$clusterDir = Join-Path $runtimeDir 'postgres'
if (Test-Path -LiteralPath (Join-Path $runtimeDir 'postgres-path.txt')) {
  $clusterDir = (Get-Content -LiteralPath (Join-Path $runtimeDir 'postgres-path.txt') -Raw).Trim()
}
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  $dbPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  $demoPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16))
  $totpSecret = -join (1..32 | ForEach-Object { 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[[Security.Cryptography.RandomNumberGenerator]::GetInt32(32)] })
  @("DATABASE_URL=postgresql://autoparts:$dbPassword@127.0.0.1:55432/autoparts",'PORT=4310','HOST=127.0.0.1','APP_ORIGIN=http://localhost:4173','NODE_ENV=development','DEMO_MODE=true',"DEMO_PASSWORD=$demoPassword", "DEMO_TOTP_SECRET=$totpSecret") | Set-Content -LiteralPath $envFile -Encoding utf8
  @('# Isolated local demonstration credentials', '', 'Do not use these for production. These are synthetic staff accounts.', '', "Password: $demoPassword", "Owner authenticator setup secret: $totpSecret", '', 'Account names are listed in the seed script. Generate a current owner MFA code with npm run demo:otp.') | Set-Content -LiteralPath (Join-Path $runtimeDir 'DEMO-ACCESS.md') -Encoding utf8
}
$envValues = @{}
if (-not (Select-String -LiteralPath $envFile -Pattern '^TSX_DISABLE_CACHE=' -Quiet)) {
  Add-Content -LiteralPath $envFile -Value 'TSX_DISABLE_CACHE=1'
}
if (-not (Select-String -LiteralPath $envFile -Pattern '^MFA_ENCRYPTION_KEY=' -Quiet)) {
  $mfaLocalKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  Add-Content -LiteralPath $envFile -Value "MFA_ENCRYPTION_KEY=$mfaLocalKey"
}
Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { $envValues[$Matches[1]] = $Matches[2] } }
$dbUri = [Uri]$envValues['DATABASE_URL']
$passwordFile = Join-Path $runtimeDir 'init-password.tmp'
if (-not (Test-Path -LiteralPath (Join-Path $clusterDir 'PG_VERSION'))) {
  ($dbUri.UserInfo.Split(':')[1]) | Set-Content -LiteralPath $passwordFile -NoNewline
  try { & (Join-Path $PostgresBin 'initdb.exe') -D $clusterDir -U autoparts --pwfile=$passwordFile --auth=scram-sha-256 --encoding=UTF8 --locale=C; if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed' } }
  finally { if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile } }
  @("listen_addresses = '127.0.0.1'", 'port = 55432', 'max_connections = 150', 'shared_buffers = 128MB', 'log_min_duration_statement = 500') | Add-Content -LiteralPath (Join-Path $clusterDir 'postgresql.conf')
}
& (Join-Path $PostgresBin 'pg_ctl.exe') -D $clusterDir status *> $null
if ($LASTEXITCODE -ne 0) {
  $pgLog = Join-Path $runtimeDir 'postgres.log'
  $startArgs = @('-D', ('"' + $clusterDir + '"'), '-l', ('"' + $pgLog + '"'), '-w', 'start')
  $pgProcess = Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru
  $pgProcess.WaitForExit()
  if ($pgProcess.ExitCode -ne 0) { throw 'Database did not start; inspect .local/postgres.log' }
}
$env:PGPASSWORD = $dbUri.UserInfo.Split(':')[1]
try {
  $exists = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p 55432 -U autoparts -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='autoparts'"
  if ($exists -ne '1') { & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U autoparts autoparts }
} finally { Remove-Item Env:PGPASSWORD }
Write-Output 'Isolated PostgreSQL is ready at 127.0.0.1:55432. Credentials are stored only in ignored local files.'
