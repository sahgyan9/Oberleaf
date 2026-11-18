# Stops every Oberleaf process: the API server, the Vite dev server, and the
# npm / concurrently / tsx-watch / cmd processes that started them, so no
# terminal or hidden console is left running in the background.
#
# Run by:
#   - the Quit button in the page (server/index.ts, /api/system/quit), which
#     passes its own PID as -ServerPid
#   - Stop-Oberleaf.bat and `npm run stop`, by hand
#
# How: start from the processes holding the Oberleaf ports (and -ServerPid),
# climb to the top-most node.exe / non-interactive cmd.exe ancestor, and end
# that whole tree with taskkill /T. Climbing stops at an interactive shell
# (cmd.exe without /c, PowerShell, Windows Terminal, Explorer), so a terminal
# the user typed `npm start` into returns to its prompt instead of closing.

[CmdletBinding()]
param(
    [int]$ServerPid = 0,
    # A comma-separated string: `powershell -File` passes arguments as text.
    [string]$Ports = "3001,5173"
)
$Ports = @($Ports -split '[,\s]+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "project.log"

function Write-StopLog([string]$Message) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] [stop] $Message"
    Write-Host $line
    try { Add-Content -Path $LogFile -Value $line -Encoding utf8 } catch {}
}

# Give the quit request's HTTP reply time to reach the page.
if ($ServerPid -gt 0) { Start-Sleep -Milliseconds 400 }

$all = @{}
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { $all[[int]$_.ProcessId] = $_ }

function Test-StoppableHost($proc) {
    if (-not $proc) { return $false }
    if ($proc.ProcessId -eq $PID) { return $false }
    if ($proc.Name -eq 'node.exe') { return $true }
    # cmd.exe only when it was started to run one command (cmd /c ...), never
    # an interactive console the user is typing into.
    if ($proc.Name -eq 'cmd.exe') { return ($proc.CommandLine -match '(?i)\s/c\s') }
    return $false
}

function Get-TopAncestor([int]$StartPid) {
    $current = $all[$StartPid]
    if (-not (Test-StoppableHost $current)) { return $StartPid }
    $seen = @{}
    while ($true) {
        $seen[[int]$current.ProcessId] = $true
        $parent = $all[[int]$current.ParentProcessId]
        # A parent created after the child is a reused PID, not the real parent.
        if (-not $parent -or $seen.ContainsKey([int]$parent.ProcessId) -or
            $parent.CreationDate -gt $current.CreationDate -or
            -not (Test-StoppableHost $parent)) {
            return [int]$current.ProcessId
        }
        $current = $parent
    }
}

$starts = @()
if ($ServerPid -gt 0) { $starts += $ServerPid }
foreach ($port in $Ports) {
    try {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -gt 4 } |
            ForEach-Object { $starts += [int]$_.OwningProcess }
    } catch {}
}

# Fallback, as in launch.ps1: node / cmd processes whose command line names
# this checkout (the hidden launcher's `cmd /c ... >> logs\project.log`).
$escapedRoot = [regex]::Escape($ProjectRoot)
$all.Values | Where-Object {
    ($_.Name -eq 'node.exe' -or $_.Name -eq 'cmd.exe') -and $_.CommandLine -and
    $_.CommandLine -match $escapedRoot -and
    $_.CommandLine -match '(?i)server[\\/]index\.ts|logs[\\/]project\.log'
} | ForEach-Object { $starts += [int]$_.ProcessId }

$roots = $starts | Sort-Object -Unique | ForEach-Object { Get-TopAncestor $_ } | Sort-Object -Unique

if (-not $roots) {
    Write-StopLog "No Oberleaf processes are running."
    exit 0
}

foreach ($rootPid in $roots) {
    $p = $all[$rootPid]
    $label = if ($p) { "$($p.Name) $rootPid" } else { "PID $rootPid" }
    Write-StopLog "Ending process tree of $label."
    & taskkill.exe /F /T /PID $rootPid 2>&1 | Out-Null
}

# Confirm the ports are free.
$stillHeld = @()
foreach ($port in $Ports) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 }) {
        $stillHeld += $port
    }
}
if ($stillHeld) {
    Write-StopLog "Port(s) $($stillHeld -join ', ') are still in use."
    exit 1
}
Write-StopLog "Oberleaf stopped."
exit 0
