# Split - Migration des donnees utilisateurs entre 2 backends Railway
#
# Usage :
#   .\migrate-user-data.ps1 -OldUrl "https://old.up.railway.app" `
#                           -NewUrl "https://new.up.railway.app" `
#                           -AdminKey "<ADMIN_KEY>" `
#                           [-DumpPath "C:\path\to\dump.json.gz"] `
#                           [-DryRun]
#
# Etapes effectuees :
#   1. GET /api/admin/export-summary sur OLD (counts par table, verification rapide)
#   2. GET /api/admin/export-all?gz=1 sur OLD -> telecharge dump.json.gz
#   3. (optionnel) -DryRun: POST /api/admin/import-all?dry=1 sur NEW pour simuler
#   4. POST /api/admin/import-all sur NEW (upload du dump, restore en base)
#   5. GET /api/admin/export-summary sur NEW pour verifier
#
# Prerequis : ADMIN_KEY doit etre identique OLD et NEW (ou adapte via
#             -OldAdminKey / -NewAdminKey).

param(
  [Parameter(Mandatory=$true)] [string]$OldUrl,
  [Parameter(Mandatory=$true)] [string]$NewUrl,
  [Parameter(Mandatory=$true)] [string]$AdminKey,
  [string]$OldAdminKey = "",
  [string]$NewAdminKey = "",
  [string]$DumpPath = "split-migration-dump.json.gz",
  [switch]$DryRun
)

if (-not $OldAdminKey) { $OldAdminKey = $AdminKey }
if (-not $NewAdminKey) { $NewAdminKey = $AdminKey }

$OldUrl = $OldUrl.TrimEnd('/')
$NewUrl = $NewUrl.TrimEnd('/')

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "    [ERR] $msg" -ForegroundColor Red }

# --- 1. Summary OLD ---
Write-Step "1/5 - Summary OLD backend ($OldUrl)"
try {
  $summaryOld = Invoke-RestMethod -Method GET -Uri "$OldUrl/api/admin/export-summary?key=$OldAdminKey" -ErrorAction Stop
  Write-Ok ("users={0}  user_sync={1}  user_match_points={2}  follows={3}" -f `
    $summaryOld.summary.users, $summaryOld.summary.user_sync, `
    $summaryOld.summary.user_match_points, $summaryOld.summary.follows)
  $summaryOld.summary | Format-List
} catch { Write-Err $_.Exception.Message; exit 1 }

if ($summaryOld.summary.users -eq 0) {
  Write-Err "0 users dans la DB source — arret. Verifie DB_PATH sur l'OLD backend."
  exit 1
}

# --- 2. Download dump ---
Write-Step "2/5 - Telechargement du dump (gzippe) -> $DumpPath"
try {
  Invoke-WebRequest -Method GET -Uri "$OldUrl/api/admin/export-all?key=$OldAdminKey&gz=1" `
    -OutFile $DumpPath -ErrorAction Stop
  $size = (Get-Item $DumpPath).Length
  Write-Ok ("Dump sauve : {0} KB" -f [math]::Round($size / 1KB, 1))
} catch { Write-Err $_.Exception.Message; exit 1 }

# --- 3. Dry run (optionnel) ---
if ($DryRun) {
  Write-Step "3/5 - DRY RUN import sur NEW (ne modifie rien)"
  try {
    $dryResult = Invoke-RestMethod -Method POST -Uri "$NewUrl/api/admin/import-all?key=$NewAdminKey&dry=1" `
      -Headers @{ "Content-Encoding" = "gzip" } `
      -ContentType "application/octet-stream" `
      -InFile $DumpPath -ErrorAction Stop
    $dryResult.results | Format-Table table, inserted, updated, skipped, total
    Write-Ok "Dry run OK — relance sans -DryRun pour appliquer vraiment"
  } catch { Write-Err $_.Exception.Message; exit 1 }
  exit 0
}

# --- 4. Import NEW ---
Write-Step "4/5 - Import sur NEW backend ($NewUrl)"
try {
  $result = Invoke-RestMethod -Method POST -Uri "$NewUrl/api/admin/import-all?key=$NewAdminKey" `
    -Headers @{ "Content-Encoding" = "gzip" } `
    -ContentType "application/octet-stream" `
    -InFile $DumpPath -ErrorAction Stop
  $result.results | Format-Table table, inserted, updated, skipped, total
  Write-Ok "Import applique"
} catch { Write-Err $_.Exception.Message; exit 1 }

# --- 5. Summary NEW ---
Write-Step "5/5 - Verification summary NEW"
try {
  $summaryNew = Invoke-RestMethod -Method GET -Uri "$NewUrl/api/admin/export-summary?key=$NewAdminKey" -ErrorAction Stop
  $summaryNew.summary | Format-List
  if ($summaryNew.summary.users -eq $summaryOld.summary.users) {
    Write-Ok ("Match: {0} users sur OLD et NEW" -f $summaryNew.summary.users)
  } else {
    Write-Err ("Mismatch: OLD={0} users, NEW={1} users" -f $summaryOld.summary.users, $summaryNew.summary.users)
  }
} catch { Write-Err $_.Exception.Message; exit 1 }

Write-Host "`nMigration terminee. Pointe maintenant le frontend vers $NewUrl dans vercel.json ou VITE_API_BASE." -ForegroundColor Yellow
