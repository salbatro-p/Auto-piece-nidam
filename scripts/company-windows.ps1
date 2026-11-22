[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Install','Start','Stop','Status','Update')][string]$Action,
  [Parameter(Mandatory)][string]$Directory,
  [string]$CompanyName,[string]$OwnerName,[string]$OwnerEmail,
  [ValidateSet('ar','fr','en')][string]$Language='fr',
  [ValidateRange(1024,65535)][int]$DatabasePort=55451,
  [ValidateRange(1024,65535)][int]$ApiPort=4357,
  [ValidateRange(1024,65535)][int]$WebPort=4267,
  [string]$OpenSsl
)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$root=Split-Path $PSScriptRoot
$privateDir=[IO.Path]::GetFullPath($Directory)
$cluster=Join-Path $privateDir 'postgres'
$marker=Join-Path $privateDir 'installation.json'
$node=(Get-Command node).Source
$pgctl=(Get-Command pg_ctl.exe).Source
function Confirm-Exit([string]$step) { if($LASTEXITCODE -ne 0){throw "$step failed. Review the private installation directory."} }
function Start-Database {
  & $pgctl -D $cluster status *> $null
  if($LASTEXITCODE -eq 0){return}
  $pglog=Join-Path $privateDir 'database.log'
  $job=Start-Process $pgctl -ArgumentList '-D',('"' + $cluster + '"'),'-l',('"' + $pglog + '"'),'-w','start' -WindowStyle Hidden -PassThru
  $job.WaitForExit()
  if($job.ExitCode){throw 'Dedicated database did not start'}
}
function Start-Business {
  & $node --import=tsx scripts/company-local.mjs status $privateDir *> $null
  if($LASTEXITCODE -eq 0){Write-Output 'Company already online'; return}
  $tag=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $job=Start-Process $node -WorkingDirectory $root -ArgumentList '--import=tsx','scripts/company-local.mjs','start',('"' + $privateDir + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $privateDir "service-$tag.log") -RedirectStandardError (Join-Path $privateDir "service-$tag.err")
  for($i=0;$i -lt 30;$i++){
    Start-Sleep -Milliseconds 400
    if($job.HasExited){throw 'Service exited. Check its private service log.'}
    & $node --import=tsx scripts/company-local.mjs status $privateDir 2>$null
    if($LASTEXITCODE -eq 0){return}
  }
  throw 'Company did not report ready'
}
Push-Location $root
try{
 if($Action -eq 'Install'){
  if(Test-Path -LiteralPath $privateDir){throw 'Installation needs a new directory'}
  if(-not $CompanyName -or -not $OwnerName -or $OwnerEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$'){throw 'Supply company name, owner name and owner email'}
  if((@($DatabasePort,$ApiPort,$WebPort)|Sort-Object -Unique).Count -ne 3){throw 'Choose three different ports'}
  foreach($port in @($DatabasePort,$ApiPort,$WebPort)){
    $probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
    try{$probe.Start()}finally{$probe.Stop()}
  }
  if(-not $OpenSsl){$OpenSsl=Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'usr/bin/openssl.exe'}
  if(-not (Test-Path -LiteralPath $OpenSsl)){throw 'Supply the path to OpenSSL 3 with -OpenSsl'}
  [IO.Directory]::CreateDirectory($privateDir)|Out-Null
  $user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $privateDir /inheritance:r /grant:r ("${user}:(OI)(CI)F") '*S-1-5-18:(OI)(CI)F' |Out-Null
  Confirm-Exit 'Private Windows access'
  $secret=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $tmp=Join-Path $privateDir 'init-password.tmp'
  [IO.File]::WriteAllText($tmp,$secret)
  try{& initdb.exe -D $cluster -U autoparts_admin --pwfile=$tmp --auth=scram-sha-256 --encoding=UTF8 --locale=C *> (Join-Path $privateDir 'init.log');Confirm-Exit 'Initialize PostgreSQL'}
  finally{if(Test-Path -LiteralPath $tmp){Remove-Item -LiteralPath $tmp}}
  [IO.File]::AppendAllText((Join-Path $cluster 'postgresql.conf'),"`nlisten_addresses='127.0.0.1'`nport=$DatabasePort`n")
  [IO.File]::WriteAllText((Join-Path $privateDir 'admin.env'),"DATABASE_URL=postgresql://autoparts_admin:$secret@127.0.0.1:$DatabasePort/postgres")
  $null=[IO.Directory]::CreateDirectory((Join-Path $privateDir 'media'))
  Start-Database
  & $node scripts/prepare-local-cluster.mjs $privateDir $ApiPort $WebPort
  Confirm-Exit 'Prepare private company role'
  & $OpenSsl req -x509 -newkey rsa:3072 -nodes -subj '/CN=AutoParts private localhost' -addext 'subjectAltName=IP:127.0.0.1' -keyout (Join-Path $privateDir 'localhost.key') -out (Join-Path $privateDir 'localhost.crt') -days 365 2> (Join-Path $privateDir 'certificate.log')
  Confirm-Exit 'Generate loopback certificate'
  $cfg=@{database='autoparts_company';company=$CompanyName;locale=$Language;owner=@{name=$OwnerName;email=$OwnerEmail};warehouses=@(@{code='MAIN';name='Main'})}
  [IO.File]::WriteAllText((Join-Path $privateDir 'company.json'),($cfg|ConvertTo-Json -Depth 4))
  & $node "--env-file=$privateDir/application.env" --import=tsx apps/api/src/migrate.ts
  Confirm-Exit 'Migrate'
  & $node "--env-file=$privateDir/application.env" --import=tsx apps/api/src/setup-company.ts (Join-Path $privateDir 'company.json') (Join-Path $privateDir 'owner-ticket')
  Confirm-Exit 'Create private owner invitation'
  [IO.File]::WriteAllText($marker,(@{version=1;directory=$privateDir;origin="https://127.0.0.1:$WebPort"}|ConvertTo-Json))
 }else{
  $saved=Get-Content -LiteralPath $marker -Raw|ConvertFrom-Json
  if($saved.version -ne 1 -or $saved.directory -ne $privateDir){throw 'Unrecognized installation directory'}
 }
 if($Action -eq 'Status'){& $node --import=tsx scripts/company-local.mjs status $privateDir;Confirm-Exit 'Status';return}
 if($Action -eq 'Stop'){
  & $node --import=tsx scripts/company-local.mjs stop $privateDir;Confirm-Exit 'Stop company';
  & $pgctl -D $cluster -m fast -w stop;Confirm-Exit 'Stop dedicated PostgreSQL';return
 }
 Start-Database
 if($Action -eq 'Update'){
  & $node --import=tsx scripts/company-local.mjs status $privateDir *> $null
  if($LASTEXITCODE -eq 0){throw 'Stop the service and verify your backup before updating from the new release'}
  & $node "--env-file=$privateDir/application.env" --import=tsx apps/api/src/migrate.ts
  Confirm-Exit 'Upgrade schema'
 }
 if($Action -in @('Install','Update')){ & npm.cmd run build;Confirm-Exit 'Build business application' }
 Start-Business
}finally {Pop-Location}
