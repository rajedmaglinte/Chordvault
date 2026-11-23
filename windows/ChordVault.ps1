<#
  ChordVault for a Windows PC on the church network.

    ChordVault.ps1 start      start the server hidden (no window) and show the address for phones
    ChordVault.ps1 start -Quiet   same, but no pop-up (used when Windows starts)
    ChordVault.ps1 stop       stop the server
    ChordVault.ps1 status     is it running? which address do phones open?
    ChordVault.ps1 setup      one-time: secret, folders, desktop icons, start with Windows, firewall

  Works with Windows PowerShell 5.1 (built into Windows 10/11). Needs Node.js 24 installed.
#>
param(
  [Parameter(Position = 0)] [ValidateSet('start', 'stop', 'status', 'setup', 'remove-autostart')] [string] $Action = 'status',
  [switch] $Quiet
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot          # the chordvault folder
$Port = 3100
$DataDir = Join-Path $Root 'data'
$LogDir = Join-Path $Root 'logs'
$PidFile = Join-Path $DataDir 'server.pid'
$EnvFile = Join-Path $Root '.env'
$Title = 'ChordVault'

Add-Type -AssemblyName System.Windows.Forms | Out-Null

function Show-Message([string] $Text, [string] $Icon = 'Information') {
  if ($Quiet) { return }
  [System.Windows.Forms.MessageBox]::Show($Text, $Title, 'OK', $Icon) | Out-Null
}

function Get-PortFromEnv {
  if (Test-Path $EnvFile) {
    $line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*PORT\s*=\s*(\d+)\s*$' } | Select-Object -First 1
    if ($line -match '(\d+)') { return [int]$Matches[1] }
  }
  return $Port
}

function Test-Listening([int] $P) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync('127.0.0.1', $P)
    return ($task.Wait(700) -and $client.Connected)
  } catch { return $false } finally { $client.Dispose() }
}

function Get-LanAddresses {
  try {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
      Select-Object -ExpandProperty IPAddress
  } catch {
    [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
      Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -notlike '127.*' } |
      ForEach-Object { $_.ToString() }
  }
}

function Get-PhoneAddresses([int] $P) {
  $list = @(Get-LanAddresses | ForEach-Object { "http://$($_):$P" })
  if ($list.Count -eq 0) { return '(no network connection found)' }
  return ($list -join "`n")
}

function Get-ServerProcess {
  if (-not (Test-Path $PidFile)) { return $null }
  $id = [int](Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'node') { return $proc }
  return $null
}

function Get-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

function Start-Server {
  $p = Get-PortFromEnv
  if (Test-Listening $p) {
    Show-Message "ChordVault is already running.`n`nPhones on this Wi-Fi open:`n$(Get-PhoneAddresses $p)"
    return
  }
  $node = Get-NodePath
  if (-not $node) { Show-Message "Node.js was not found. Install Node.js 24 LTS from nodejs.org, then try again." 'Error'; exit 1 }
  if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    Show-Message "ChordVault's packages are not installed yet.`n`nRun 'Setup ChordVault' first (or 'npm ci --omit=dev' in the chordvault folder)." 'Error'; exit 1
  }
  if (-not (Test-Path $EnvFile)) { New-EnvFile }
  New-Item -ItemType Directory -Force -Path $DataDir, $LogDir | Out-Null

  # Keep the previous log, start a fresh one.
  $log = Join-Path $LogDir 'server.log'
  $errLog = Join-Path $LogDir 'server-error.log'
  foreach ($f in @($log, $errLog)) { if (Test-Path $f) { Move-Item -Force $f "$f.previous" } }

  $proc = Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError $errLog -PassThru
  Set-Content -Path $PidFile -Value $proc.Id -Encoding ASCII

  for ($i = 0; $i -lt 40; $i++) {
    if (Test-Listening $p) {
      Show-Message "ChordVault is running.`n`nPhones on this Wi-Fi open:`n$(Get-PhoneAddresses $p)`n`n(It keeps running in the background. Use 'Stop ChordVault' to stop it.)"
      return
    }
    if ($proc.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  $tail = ''
  foreach ($f in @($errLog, $log)) { if (Test-Path $f) { $tail += (Get-Content $f -Tail 8) -join "`n" } }
  Show-Message "ChordVault did not start.`n`n$tail`n`nFull log: $LogDir" 'Error'
  exit 1
}

function Stop-Server {
  $proc = Get-ServerProcess
  if ($proc) {
    Stop-Process -Id $proc.Id -Force
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Show-Message 'ChordVault stopped. Phones can no longer reach it until you start it again.'
  } elseif (Test-Listening (Get-PortFromEnv)) {
    Show-Message "Something is running on port $(Get-PortFromEnv), but it was not started by this ChordVault folder.`nClose it from Task Manager (node.exe) if needed." 'Warning'
  } else {
    Show-Message 'ChordVault was not running.'
  }
}

function Show-Status {
  $p = Get-PortFromEnv
  if (Test-Listening $p) {
    Show-Message "ChordVault is running.`n`nPhones on this Wi-Fi open:`n$(Get-PhoneAddresses $p)"
  } else {
    Show-Message "ChordVault is NOT running.`n`nDouble-click 'Start ChordVault' to start it." 'Warning'
  }
}

function New-EnvFile {
  # A random secret that stays the same, so sign-ins survive restarts.
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  Set-Content -Path $EnvFile -Value @("JWT_SECRET=$secret", "PORT=$Port") -Encoding ASCII
}

function New-Shortcut([string] $Path, [string] $Arguments, [string] $Description) {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($Path)
  $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" $Arguments"
  $lnk.WorkingDirectory = $Root
  $lnk.WindowStyle = 7   # minimized: no flash of a window
  $lnk.Description = $Description
  $icon = Join-Path $PSScriptRoot 'chordvault.ico'
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  $lnk.Save()
}

function Invoke-Setup {
  $Quiet = $false
  $node = Get-NodePath
  if (-not $node) { Show-Message "Install Node.js 24 LTS from nodejs.org first, then run Setup again." 'Error'; exit 1 }

  if (-not (Test-Path $EnvFile)) { New-EnvFile; $envNote = 'Created .env with a new secret.' }
  else { $envNote = 'Kept your existing .env (sign-ins stay valid).' }
  New-Item -ItemType Directory -Force -Path $DataDir, $LogDir | Out-Null

  if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    $npm = Join-Path (Split-Path $node) 'npm.cmd'
    $p = Start-Process -FilePath $npm -ArgumentList 'ci', '--omit=dev', '--no-audit', '--no-fund' -WorkingDirectory $Root -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { Show-Message 'Installing packages failed (npm ci). Check the internet connection and run Setup again.' 'Error'; exit 1 }
  }

  $desktop = [Environment]::GetFolderPath('Desktop')
  $startup = [Environment]::GetFolderPath('Startup')
  New-Shortcut (Join-Path $desktop 'Start ChordVault.lnk') 'start' 'Start the ChordVault server (no window)'
  New-Shortcut (Join-Path $desktop 'Stop ChordVault.lnk') 'stop' 'Stop the ChordVault server'
  New-Shortcut (Join-Path $desktop 'ChordVault Status.lnk') 'status' 'Is ChordVault running? Which address do phones open?'
  New-Shortcut (Join-Path $startup 'ChordVault.lnk') 'start -Quiet' 'Start ChordVault silently when Windows starts'

  # Firewall: let phones on the local network reach the port (asks for administrator permission once).
  $p = Get-PortFromEnv
  $rule = "New-NetFirewallRule -DisplayName 'ChordVault (port $p)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $p -Profile Private,Domain -ErrorAction SilentlyContinue | Out-Null"
  $exists = Get-NetFirewallRule -DisplayName "ChordVault (port $p)" -ErrorAction SilentlyContinue
  $fwNote = 'Firewall rule already present.'
  if (-not $exists) {
    try {
      Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $rule
      $fwNote = "Allowed port $p through Windows Firewall (Private networks)."
    } catch { $fwNote = "Firewall not changed (administrator permission was declined). Phones may not connect until port $p is allowed." }
  }

  Show-Message ("Setup finished.`n`n- $envNote`n- Desktop icons: Start ChordVault, Stop ChordVault, ChordVault Status.`n- ChordVault starts by itself when you log in to Windows.`n- $fwNote`n`n" +
    "Tip: in Windows Settings > System > Power, set 'Sleep' to Never while plugged in, so phones can always reach it.`n`nStarting ChordVault now...")
  Start-Server
}

function Remove-Autostart {
  Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'ChordVault.lnk') -ErrorAction SilentlyContinue
  Show-Message 'ChordVault will no longer start with Windows. The desktop icons still work.'
}

switch ($Action) {
  'start' { Start-Server }
  'stop' { Stop-Server }
  'status' { Show-Status }
  'setup' { Invoke-Setup }
  'remove-autostart' { Remove-Autostart }
}
