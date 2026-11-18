# Renders frames of the startup splash (scripts/splash.ps1) to PNG files
# without opening a window, to check the design after a change.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\splash-render.ps1 [-OutDir <folder>] [-Dark] [-Step 1]
# Output: frame_00.png ... in -OutDir (default: .tmp\splash-frames), one per
# time in -Times (seconds since the splash opened).

[CmdletBinding()]
param(
    [string]$OutDir = '',
    # Comma-separated: `powershell -File` passes arguments as text.
    [string]$Times = '1.2,3.6,5.0,9.2,13.0,16.1,20.5,24.0,25.6,27.0',
    [switch]$Dark,
    [int]$Step = 1
)

$root = Split-Path -Parent $PSScriptRoot
# Windows PowerShell 5.1 leaves $PSScriptRoot empty in parameter defaults.
if (-not $OutDir) { $OutDir = Join-Path $root '.tmp\splash-frames' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$S = [hashtable]::Synchronized(@{
    Step = $Step; StepCount = 5
    StepNames = @('Checking Node.js', 'Installing dependencies', 'Building the app', 'Starting the server', 'Opening the browser')
    Detail = ''; Activity = 'npm install: added 412 packages in 38s'
    Close = $false; Closed = $false; Ready = $false
    Dark = [bool]$Dark; IconPath = (Join-Path $root 'assets\icon.png'); Version = '1.0.0'
    RenderTo = $OutDir
    RenderTimes = @($Times -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { [double]::Parse($_, [Globalization.CultureInfo]::InvariantCulture) })
})

# Same way launch.ps1 runs it: its own STA runspace, the script added as text.
$rs = [runspacefactory]::CreateRunspace()
$rs.ApartmentState = 'STA'
$rs.Open()
$rs.SessionStateProxy.SetVariable('S', $S)
$ps = [powershell]::Create()
$ps.Runspace = $rs
[void]$ps.AddScript((Get-Content -Raw -Path (Join-Path $PSScriptRoot 'splash.ps1')))
$ps.Invoke() | Out-Null
foreach ($e in $ps.Streams.Error) { Write-Warning ("splash: " + $e.ToString() + " @ line " + $e.InvocationInfo.ScriptLineNumber) }
$ps.Dispose(); $rs.Dispose()
Get-ChildItem $OutDir -Filter 'frame_*.png' | ForEach-Object { $_.FullName }
