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
# A new variable: assigning back to the [string] parameter would turn the
# list into one string again.
$PortList = @($Ports -split '[,\s]+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })

# PIDs listening on the given ports. netstat answers in ~25 ms where
# Get-NetTCPConnection takes ~500 ms, which made Quit feel slow.
function Get-ListenerPids([int[]]$OnPorts) {
    $found = @()
    foreach ($line in (netstat -ano -p tcp)) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            if ($OnPorts -contains [int]$Matches[1] -and [int]$Matches[2] -gt 4) { $found += [int]$Matches[2] }
        }
    }
    foreach ($line in (netstat -ano -p tcpv6)) {
        if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            if ($OnPorts -contains [int]$Matches[1] -and [int]$Matches[2] -gt 4) { $found += [int]$Matches[2] }
        }
    }
    return @($found | Sort-Object -Unique)
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force $LogDir | Out-Null }
# Its own file: a running server holds project.log open for writing.
$LogFile = Join-Path $LogDir "stop.log"

function Write-StopLog([string]$Message) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] [stop] $Message"
    Write-Host $line
    try { Add-Content -Path $LogFile -Value $line -Encoding utf8 -ErrorAction Stop } catch {}
}

# No wait for the HTTP reply: the server starts this only after the reply
# has been sent.

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
$starts += Get-ListenerPids $PortList

# Fallback, as in launch.ps1: node / cmd processes whose command line names
# this checkout (the hidden launcher's `cmd /c ... >> logs\project.log`).
$escapedRoot = [regex]::Escape($ProjectRoot)
$all.Values | Where-Object {
    ($_.Name -eq 'node.exe' -or $_.Name -eq 'cmd.exe') -and $_.CommandLine -and
    $_.CommandLine -match $escapedRoot -and
    $_.CommandLine -match '(?i)server[\\/]index\.ts|logs[\\/]project\.log'
} | ForEach-Object { $starts += [int]$_.ProcessId }

$roots = $starts | Where-Object { $all.ContainsKey([int]$_) } | Sort-Object -Unique |
    ForEach-Object { Get-TopAncestor $_ } | Sort-Object -Unique

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
$stillHeld = Get-ListenerPids $PortList
if ($stillHeld) {
    Write-StopLog "Port(s) $($PortList -join ', ') are still held by PID $($stillHeld -join ', ')."
    exit 1
}
Write-StopLog "Oberleaf stopped."
exit 0
