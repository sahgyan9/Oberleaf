# Animated startup splash for Oberleaf.
#
# Started by launch.ps1 in its own STA runspace, so the launcher's blocking
# checks never stall the animation. The two sides share $S, a synchronized
# hashtable:
#   Step, StepCount, StepNames  startup step now running (Step = StepCount: done)
#   Detail, Activity            one line each under the status (may be empty)
#   Dark                        Windows apps use the dark theme
#   IconPath, Version           logo file and app version for the header
#   Close                       set by the launcher: fade out and exit
#   Ready, Closed               set here: window shown / window gone
#
# While it waits, the splash plays short scenes: LaTeX source types itself on
# the left and the typeset result appears on the right, each with one plain
# sentence about what LaTeX (and Oberleaf) does with it.
#
# Test mode: set $S.RenderTo (a folder) and $S.RenderTimes (seconds) to write
# PNG frames instead of opening a window:
#   powershell -File scripts\splash-render.ps1

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$W = 600
$H = 364

# ------------------------------------------------------------------
# Palette: the app's own (tailwind.config.ts), light unless Windows apps
# are set to dark.
# ------------------------------------------------------------------
function New-Color([string]$hex, [int]$alpha = 255) {
    $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
    return [System.Drawing.Color]::FromArgb($alpha, $c)
}

if ($S.Dark) {
    $Col = @{
        Bg = New-Color '#1C1C1F'; Panel = New-Color '#232327'; Page = New-Color '#141416'
        Border = New-Color '#2E2E35'; Rule = New-Color '#2A2A30'
        Text = New-Color '#F5F5F4'; Muted = New-Color '#A8A29E'; Faint = New-Color '#57534E'
        Accent = New-Color '#2EA043'; Code = New-Color '#D6D3D1'; Cmd = New-Color '#7DD3A0'
        Hover = New-Color '#2A2A30'
    }
} else {
    $Col = @{
        Bg = New-Color '#FFFFFF'; Panel = New-Color '#FAFAF9'; Page = New-Color '#FFFFFF'
        Border = New-Color '#E7E5DF'; Rule = New-Color '#EEEDE8'
        Text = New-Color '#1C1917'; Muted = New-Color '#57534E'; Faint = New-Color '#D6D3CD'
        Accent = New-Color '#1B5E20'; Code = New-Color '#44403C'; Cmd = New-Color '#1B5E20'
        Hover = New-Color '#F4F3EF'
    }
}

function New-Font([string[]]$families, [single]$px, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
    foreach ($f in $families) {
        try {
            $font = New-Object System.Drawing.Font($f, $px, $style, [System.Drawing.GraphicsUnit]::Pixel)
            if ($font.Name -eq $f) { return $font }
        } catch {}
    }
    return New-Object System.Drawing.Font('Times New Roman', $px, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

$Fnt = @{
    Title    = New-Font @('Georgia') 21 ([System.Drawing.FontStyle]::Bold)
    Sub      = New-Font @('Segoe UI') 12
    Kicker   = New-Font @('Segoe UI') 10.5 ([System.Drawing.FontStyle]::Bold)
    Headline = New-Font @('Segoe UI Semibold', 'Segoe UI') 15
    Caption  = New-Font @('Segoe UI') 12
    Label    = New-Font @('Segoe UI') 10
    Code     = New-Font @('Cascadia Mono', 'Consolas') 12
    Status   = New-Font @('Segoe UI Semibold', 'Segoe UI') 12.5
    Detail   = New-Font @('Segoe UI') 11
    Mono     = New-Font @('Consolas') 10.5
    # Typeset output
    Rm       = New-Font @('Cambria', 'Times New Roman') 21
    It       = New-Font @('Cambria', 'Times New Roman') 21 ([System.Drawing.FontStyle]::Italic)
    RmS      = New-Font @('Cambria', 'Times New Roman') 14
    ItS      = New-Font @('Cambria', 'Times New Roman') 14 ([System.Drawing.FontStyle]::Italic)
    Sym      = New-Font @('Cambria Math', 'Cambria', 'Times New Roman') 21
    Big      = New-Font @('Cambria Math', 'Cambria', 'Times New Roman') 34
    Body     = New-Font @('Cambria', 'Georgia', 'Times New Roman') 14
}

$Br = @{}
foreach ($k in $Col.Keys) { $Br[$k] = New-Object System.Drawing.SolidBrush($Col[$k]) }
$Pn = @{
    Border = New-Object System.Drawing.Pen($Col.Border, 1)
    Rule   = New-Object System.Drawing.Pen($Col.Rule, 1)
    Ink    = New-Object System.Drawing.Pen($Col.Text, 1.3)
    Accent = New-Object System.Drawing.Pen($Col.Accent, 1.6)
    Faint  = New-Object System.Drawing.Pen($Col.Faint, 1.4)
    Glyph  = New-Object System.Drawing.Pen($Col.Muted, 1.5)
}

$Typo = [System.Drawing.StringFormat]::GenericTypographic.Clone()
$Typo.FormatFlags = $Typo.FormatFlags -bor [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces -bor [System.Drawing.StringFormatFlags]::NoWrap
$NoWrap = New-Object System.Drawing.StringFormat
$NoWrap.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
$NoWrap.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
$Far = New-Object System.Drawing.StringFormat
$Far.Alignment = [System.Drawing.StringAlignment]::Far
$Far.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

# Layout
$LEFT = 24; $RIGHT = $W - 24
$HEAD_RULE = 62
$SRC = New-Object System.Drawing.Rectangle(24, 122, 270, 140)    # source panel
$OUT = New-Object System.Drawing.Rectangle(306, 122, 270, 140)   # typeset page
$SCENE_TOP = 68; $SCENE_BOTTOM = 304                            # region that cross-fades
$BAR_Y = 312

function Clamp01([double]$x) { if ($x -lt 0) { 0.0 } elseif ($x -gt 1) { 1.0 } else { $x } }
function Ease([double]$x) { $x = Clamp01 $x; return 1 - [math]::Pow(1 - $x, 3) }

# ------------------------------------------------------------------
# A small box layout for the typeset side: each box has a width (W), a height
# above the baseline (A), a depth below it (D) and a Draw block that paints it
# with its baseline at ($x, $b).
# ------------------------------------------------------------------
$Measure = New-Object System.Drawing.Bitmap(1, 1)
$MG = [System.Drawing.Graphics]::FromImage($Measure)
$MG.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

function Get-FontAscent($font) {
    $ff = $font.FontFamily
    return $font.Size * $ff.GetCellAscent($font.Style) / $ff.GetEmHeight($font.Style)
}

function T([string]$text, $font, $brush = $null) {
    $w = $MG.MeasureString($text, $font, 2000, $Typo).Width
    $asc = Get-FontAscent $font
    $fmt = $Typo   # captured by the closure below
    return @{
        W = [double]$w; A = [double]($font.Size * 0.70); D = [double]($font.Size * 0.22)
        Draw = {
            param($g, $x, $b, $ink)
            $use = if ($brush) { $brush } else { $ink }
            $g.DrawString($text, $font, $use, [single]$x, [single]($b - $asc), $fmt)
        }.GetNewClosure()
    }
}

function Gap([double]$w) { return @{ W = $w; A = 0.0; D = 0.0; Draw = { param($g, $x, $b, $ink) } } }

function Row([object[]]$items) {
    $w = 0.0; $a = 0.0; $d = 0.0
    foreach ($i in $items) { $w += $i.W; $a = [math]::Max($a, $i.A); $d = [math]::Max($d, $i.D) }
    return @{
        W = $w; A = $a; D = $d
        Draw = {
            param($g, $x, $b, $ink)
            foreach ($i in $items) { & $i.Draw $g $x $b $ink; $x += $i.W }
        }.GetNewClosure()
    }
}

# base^sup, with an optional subscript
function Scr($base, $sup, $sub = $null) {
    $sw = 0.0
    if ($sup) { $sw = $sup.W }
    if ($sub) { $sw = [math]::Max($sw, $sub.W) }
    $a = $base.A; if ($sup) { $a = [math]::Max($a, $base.A * 0.55 + $sup.A) }
    $d = $base.D; if ($sub) { $d = [math]::Max($d, 5 + $sub.D) }
    return @{
        W = $base.W + 1 + $sw; A = $a; D = $d
        Draw = {
            param($g, $x, $b, $ink)
            & $base.Draw $g $x $b $ink
            if ($sup) { & $sup.Draw $g ($x + $base.W + 1) ($b - $base.A * 0.55) $ink }
            if ($sub) { & $sub.Draw $g ($x + $base.W + 1) ($b + 5) $ink }
        }.GetNewClosure()
    }
}

function Frac($num, $den) {
    $w = [math]::Max($num.W, $den.W) + 8
    $axis = 6.5
    return @{
        W = $w + 4; A = $axis + 4 + $num.D + $num.A; D = -$axis + 4 + $den.A + $den.D
        Draw = {
            param($g, $x, $b, $ink)
            $ya = $b - $axis
            $pen = New-Object System.Drawing.Pen($ink, 1.2)
            $g.DrawLine($pen, [single]($x + 2), [single]$ya, [single]($x + 2 + $w), [single]$ya)
            $pen.Dispose()
            & $num.Draw $g ($x + 2 + ($w - $num.W) / 2) ($ya - 4 - $num.D) $ink
            & $den.Draw $g ($x + 2 + ($w - $den.W) / 2) ($ya + 4 + $den.A) $ink
        }.GetNewClosure()
    }
}

function Sqrt($body) {
    return @{
        W = $body.W + 14; A = $body.A + 5; D = $body.D + 1
        Draw = {
            param($g, $x, $b, $ink)
            $top = $b - $body.A - 3
            $pen = New-Object System.Drawing.Pen($ink, 1.2)
            $pts = @(
                (New-Object System.Drawing.PointF([single]($x + 1), [single]($b - 6))),
                (New-Object System.Drawing.PointF([single]($x + 4), [single]($b - 8))),
                (New-Object System.Drawing.PointF([single]($x + 8), [single]($b + $body.D))),
                (New-Object System.Drawing.PointF([single]($x + 12), [single]$top)),
                (New-Object System.Drawing.PointF([single]($x + 14 + $body.W), [single]$top))
            )
            $g.DrawLines($pen, [System.Drawing.PointF[]]$pts)
            $pen.Dispose()
            & $body.Draw $g ($x + 13) $b $ink
        }.GetNewClosure()
    }
}

# A large operator (integral) with limits at its upper right and lower right
function BigOp([string]$sym, $lower, $upper) {
    $op = T $sym $Fnt.Big
    $op.A = 22.0; $op.D = 10.0
    $lw = [math]::Max($lower.W, $upper.W)
    return @{
        W = $op.W + $lw + 2; A = 26.0; D = 14.0
        Draw = {
            param($g, $x, $b, $ink)
            & $op.Draw $g $x ($b + 6) $ink
            & $upper.Draw $g ($x + $op.W - 1) ($b - 17) $ink
            & $lower.Draw $g ($x + $op.W - 6) ($b + 13) $ink
        }.GetNewClosure()
    }
}

function Draw-Centered($g, $box, $ink, [double]$cy, [double]$cx = -1) {
    if ($cx -lt 0) { $cx = $OUT.X + $OUT.Width / 2 }
    $b = $cy + ($box.A - $box.D) / 2
    & $box.Draw $g ($cx - $box.W / 2) $b $ink
}

# ------------------------------------------------------------------
# Typeset results (built once)
# ------------------------------------------------------------------
$m = [char]0x2212   # minus sign
$pm = [char]0x00B1

$qRadicand = Row @((Scr (T 'b' $Fnt.It) (T '2' $Fnt.RmS)), (Gap 2), (T "$m" $Fnt.Rm), (Gap 2), (T '4' $Fnt.Rm), (T 'ac' $Fnt.It))
$qNum = Row @((T "$m" $Fnt.Rm), (T 'b' $Fnt.It), (Gap 4), (T "$pm" $Fnt.Rm), (Gap 3), (Sqrt $qRadicand))
$qDen = Row @((T '2' $Fnt.Rm), (T 'a' $Fnt.It))
$quadratic = Row @((T 'x' $Fnt.It), (Gap 5), (T '=' $Fnt.Rm), (Gap 5), (Frac $qNum $qDen))

$eExp = Row @((T 'i' $Fnt.ItS), (T ([string][char]0x03C0) $Fnt.ItS))
$euler = Row @((Scr (T 'e' $Fnt.It) $eExp), (Gap 6), (T '+' $Fnt.Rm), (Gap 6), (T '1' $Fnt.Rm), (Gap 6), (T '=' $Fnt.Rm), (Gap 6), (T '0' $Fnt.Rm))

$gInt = BigOp ([string][char]0x222B) (T '0' $Fnt.RmS) (T ([string][char]0x221E) $Fnt.RmS)
$gExp = Row @((T "$m" $Fnt.RmS), (Scr (T 'x' $Fnt.ItS) (T '2' (New-Font @('Cambria') 10))))
$gRhs = Frac (Sqrt (T ([string][char]0x03C0) $Fnt.It)) (T '2' $Fnt.Rm)
$gauss = Row @($gInt, (Gap 3), (Scr (T 'e' $Fnt.It) $gExp), (Gap 3), (T 'd' $Fnt.Rm), (T 'x' $Fnt.It), (Gap 6), (T '=' $Fnt.Rm), (Gap 6), $gRhs)

$hbar = [string][char]0x210F
$partial = [string][char]0x2202
$psi = [string][char]0x03A8
$sDdt = Frac (T $partial $Fnt.Sym) (Row @((T $partial $Fnt.Sym), (T 't' $Fnt.It)))
$schrodinger = Row @((T 'i' $Fnt.It), (Gap 2), (T $hbar $Fnt.Sym), (Gap 3), $sDdt, (Gap 2), (T $psi $Fnt.Rm), (Gap 6), (T '=' $Fnt.Rm), (Gap 6), (T ('H' + [char]0x0302) $Fnt.It), (Gap 2), (T $psi $Fnt.Rm))

# ------------------------------------------------------------------
# Scenes. Source is typed in over the first part of each scene, then the
# typeset side fades in. Draw gets ($g, $reveal) with reveal 0..1.
# ------------------------------------------------------------------
$Scenes = @(
    @{
        Kicker   = 'FRACTIONS AND ROOTS'
        Headline = 'The quadratic formula, written once in plain text'
        Caption  = 'You write the structure. LaTeX sets the bar, the root sign and the spacing.'
        Source   = @('\[', '  x = \frac{-b \pm', '        \sqrt{b^2-4ac}}{2a}', '\]')
        Draw     = { param($g, $r) Draw-Centered $g $quadratic $Br.Text ($OUT.Y + $OUT.Height / 2) }
    },
    @{
        Kicker   = 'NUMBERS AND REFERENCES'
        Headline = 'Label an equation once, refer to it anywhere'
        Caption  = 'A reference prints ?? until a second pass. Oberleaf reruns LaTeX until every number settles.'
        Source   = @('\begin{equation}', '  e^{i\pi} + 1 = 0', '  \label{eq:euler}', '\end{equation}', 'By Eq.~\eqref{eq:euler}, ...')
        Draw     = {
            param($g, $r, $local)
            Draw-Centered $g $euler $Br.Text ($OUT.Y + 52)
            $g.DrawString('(1)', $Fnt.Rm, $Br.Text, [single]($OUT.Right - 40), [single]($OUT.Y + 40))
            # First pass prints ??; the label is known from 4 s into the scene.
            $resolved = $local -ge 4.0
            $lead = 'By Eq. '
            $x = $OUT.X + 22; $y = $OUT.Y + 92
            $g.DrawString($lead, $Fnt.Body, $Br.Text, [single]$x, [single]$y, $Typo)
            $x += $MG.MeasureString($lead, $Fnt.Body, 2000, $Typo).Width
            $ref = if ($resolved) { '(1)' } else { '??' }
            $refBrush = if ($resolved) { $Br.Accent } else { $Br.Muted }
            $g.DrawString($ref, $Fnt.Body, $refBrush, [single]$x, [single]$y, $Typo)
            $x += $MG.MeasureString($ref, $Fnt.Body, 2000, $Typo).Width
            $g.DrawString(', ...', $Fnt.Body, $Br.Text, [single]$x, [single]$y, $Typo)
            $pass = if ($resolved) { 'pass 2' } else { 'pass 1' }
            $g.DrawString($pass, $Fnt.Label, $Br.Muted, (New-Object System.Drawing.RectangleF([single]($OUT.X), [single]($OUT.Bottom - 20), [single]($OUT.Width - 10), 16)), $Far)
        }
    },
    @{
        Kicker   = 'LIMITS AND SYMBOLS'
        Headline = 'The Gaussian integral, with its limits in place'
        Caption  = 'Subscripts and superscripts become limits; \infty and \pi become the symbols you meant.'
        Source   = @('\[', '  \int_0^\infty e^{-x^2}\,dx', '    = \frac{\sqrt{\pi}}{2}', '\]')
        Draw     = { param($g, $r) Draw-Centered $g $gauss $Br.Text ($OUT.Y + $OUT.Height / 2) }
    },
    @{
        Kicker   = 'GREEK, ACCENTS, OPERATORS'
        Headline = "The time-dependent Schr$([char]0x00F6)dinger equation"
        Caption  = 'Commands like \hbar, \partial and \hat give the physicist''s notation without a symbol picker.'
        Source   = @('\[', '  i\hbar \frac{\partial}{\partial t}', '    \Psi = \hat{H}\Psi', '\]')
        Draw     = { param($g, $r) Draw-Centered $g $schrodinger $Br.Text ($OUT.Y + $OUT.Height / 2) }
    },
    @{
        Kicker   = 'COMPILED ON YOUR COMPUTER'
        Headline = 'From main.tex to a PDF without a server queue'
        Caption  = 'latexmk runs as many passes as the document needs, BibTeX included, on your own CPU.'
        Source   = @('main.tex', 'refs.bib', 'figures/setup.png')
        Pipeline = $true
        Draw     = {
            param($g, $r)
            $stages = @('pdflatex', 'BibTeX', 'pdflatex', 'main.pdf')
            $x0 = $OUT.X + 16; $gap = 10
            $bw = ($OUT.Width - 32 - $gap * ($stages.Count - 1)) / $stages.Count
            $y = $OUT.Y + 58; $bh = 34
            # latexmk drives the whole run: a bracket over the stages.
            $g.DrawString('latexmk', $Fnt.Label, $Br.Muted, [single]$x0, [single]($y - 24))
            $g.DrawLine($Pn.Faint, [single]$x0, [single]($y - 8), [single]($OUT.Right - 16), [single]($y - 8))
            $fmt = New-Object System.Drawing.StringFormat
            $fmt.Alignment = [System.Drawing.StringAlignment]::Center
            $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
            for ($i = 0; $i -lt $stages.Count; $i++) {
                $on = $r * ($stages.Count + 0.5) -ge ($i + 0.5)
                $rect = New-Object System.Drawing.RectangleF([single]($x0 + $i * ($bw + $gap)), [single]$y, [single]$bw, [single]$bh)
                if ($i -gt 0) {
                    $ay = $y + $bh / 2
                    $g.DrawLine($Pn.Faint, [single]($rect.X - $gap + 2), [single]$ay, [single]($rect.X - 2), [single]$ay)
                }
                if ($on) {
                    $g.FillRectangle($Br.Hover, $rect)
                    $g.DrawRectangle($Pn.Accent, $rect.X, $rect.Y, $rect.Width, $rect.Height)
                    $g.DrawString($stages[$i], $Fnt.Label, $Br.Text, $rect, $fmt)
                } else {
                    $g.DrawRectangle($Pn.Faint, $rect.X, $rect.Y, $rect.Width, $rect.Height)
                    $g.DrawString($stages[$i], $Fnt.Label, $Br.Muted, $rect, $fmt)
                }
            }
            $done = Clamp01 (($r - 0.85) / 0.15)
            if ($done -gt 0) {
                $g.DrawString('Works offline, with no server queue.', $Fnt.Body, $Br.Text,
                    (New-Object System.Drawing.RectangleF([single]$OUT.X, [single]($y + $bh + 22), [single]$OUT.Width, 20)), $fmt)
            }
        }
    }
)

$SCENE_LEN = 5.6     # seconds per scene
$TYPE_LEN = 2.0      # seconds to type the source
$REVEAL_LEN = 0.9    # seconds for the result to fade in
$FADE_IN = 0.3
$FADE_OUT = 0.4

# ------------------------------------------------------------------
# Logo
# ------------------------------------------------------------------
$Logo = $null
try { if ($S.IconPath -and (Test-Path $S.IconPath)) { $Logo = [System.Drawing.Image]::FromFile($S.IconPath) } } catch {}

# ------------------------------------------------------------------
# Frame renderer
# ------------------------------------------------------------------
$Bmp = New-Object System.Drawing.Bitmap($W, $H)
$G = [System.Drawing.Graphics]::FromImage($Bmp)
$G.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$G.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$G.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$MinBtn = New-Object System.Drawing.Rectangle(($W - 46), 12, 32, 28)

function Draw-Source($g, $scene, [double]$typed, [bool]$caretOn) {
    $g.FillRectangle($Br.Panel, $SRC)
    $g.DrawRectangle($Pn.Border, $SRC)
    $label = if ($scene.Pipeline) { 'project files' } else { 'main.tex' }
    $g.DrawString($label, $Fnt.Label, $Br.Muted, [single]($SRC.X + 10), [single]($SRC.Y + 7))
    $lines = $scene.Source
    $total = 0; foreach ($l in $lines) { $total += $l.Length }
    $left = [int][math]::Round($total * (Clamp01 $typed))
    $y = $SRC.Y + 30
    $caret = $null
    foreach ($l in $lines) {
        if ($left -le 0) { if (-not $caret) { $caret = @(($SRC.X + 12), $y) }; break }
        $n = [math]::Min($left, $l.Length)
        $part = $l.Substring(0, $n)
        # Commands in the accent colour, the rest in the code colour.
        $x = $SRC.X + 12
        foreach ($tok in [regex]::Split($part, '(\\[A-Za-z]+|\\.)')) {
            if (-not $tok) { continue }
            $brush = if ($tok.StartsWith('\')) { $Br.Cmd } else { $Br.Code }
            $g.DrawString($tok, $Fnt.Code, $brush, [single]$x, [single]$y, $Typo)
            $x += $MG.MeasureString($tok, $Fnt.Code, 2000, $Typo).Width
        }
        $left -= $n
        if ($n -lt $l.Length) { $caret = @($x, $y); $left = 0; break }
        $caret = @($x, $y)
        $y += 19
    }
    if ($caret -and $caretOn) {
        $g.FillRectangle($Br.Accent, [single]($caret[0] + 1), [single]($caret[1] + 1), 2, 15)
    }
}

function Render-Frame([double]$t, [double]$shown, [bool]$hover) {
    $g = $G
    $g.Clear($Col.Bg)

    # Header
    if ($Logo) { $g.DrawImage($Logo, $LEFT, 15, 32, 32) }
    $g.DrawString('Oberleaf', $Fnt.Title, $Br.Text, 64, 9)
    $sub = 'Local LaTeX studio'
    if ($S.Version) { $sub = "$sub  $([char]0x00B7)  version $($S.Version)" }
    $g.DrawString($sub, $Fnt.Sub, $Br.Muted, 66, 37)
    $g.DrawLine($Pn.Rule, 0, $HEAD_RULE, $W, $HEAD_RULE)
    if ($hover) { $g.FillRectangle($Br.Hover, $MinBtn) }
    $cx = $MinBtn.X + $MinBtn.Width / 2; $cy = $MinBtn.Y + $MinBtn.Height / 2 + 1
    $g.DrawLine($Pn.Glyph, [single]($cx - 6), [single]$cy, [single]($cx + 6), [single]$cy)

    # Scene
    $idx = [int]([math]::Floor($t / $SCENE_LEN)) % $Scenes.Count
    $local = $t - [math]::Floor($t / $SCENE_LEN) * $SCENE_LEN
    $scene = $Scenes[$idx]
    $g.DrawString($scene.Kicker, $Fnt.Kicker, $Br.Accent, $LEFT, 76)
    $g.DrawString($scene.Headline, $Fnt.Headline, $Br.Text, ($LEFT - 1), 92)

    $typed = ($local - 0.2) / $TYPE_LEN
    if ($scene.Pipeline) { $typed = ($local - 0.2) / 0.8 }
    $caretOn = ((Clamp01 $typed) -lt 1) -or (([int]($t * 2.2)) % 2 -eq 0)
    Draw-Source $g $scene $typed $caretOn

    # Typeset page
    $g.FillRectangle($Br.Page, $OUT)
    $g.DrawRectangle($Pn.Border, $OUT)
    $g.DrawString('PDF', $Fnt.Label, $Br.Muted, [single]($OUT.X + 10), [single]($OUT.Y + 7))
    if ($scene.Pipeline) {
        $reveal = Clamp01 (($local - 1.1) / 3.2)
    } else {
        $reveal = Clamp01 (($local - 0.2 - $TYPE_LEN) / $REVEAL_LEN)
    }
    if ($reveal -gt 0) {
        & $scene.Draw $g $reveal $local
        if (-not $scene.Pipeline -and $reveal -lt 1) {
            $wash = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb([int](255 * (1 - (Ease $reveal))), $Col.Page))
            $g.FillRectangle($wash, ($OUT.X + 1), ($OUT.Y + 24), ($OUT.Width - 2), ($OUT.Height - 25))
            $wash.Dispose()
        }
    }
    # Arrow between source and page
    $ay = $SRC.Y + $SRC.Height / 2
    $g.DrawLine($Pn.Faint, [single]($SRC.Right + 3), [single]$ay, [single]($OUT.X - 3), [single]$ay)
    $g.DrawLine($Pn.Faint, [single]($OUT.X - 6), [single]($ay - 3), [single]($OUT.X - 3), [single]$ay)
    $g.DrawLine($Pn.Faint, [single]($OUT.X - 6), [single]($ay + 3), [single]($OUT.X - 3), [single]$ay)

    $g.DrawString($scene.Caption, $Fnt.Caption, $Br.Muted, (New-Object System.Drawing.RectangleF([single]($LEFT - 1), 270, [single]($RIGHT - $LEFT + 2), 34)))

    # Cross-fade between scenes: wash the scene region with the background.
    $alpha = [math]::Min((Clamp01 ($local / $FADE_IN)), (Clamp01 (($SCENE_LEN - $local) / $FADE_OUT)))
    if ($alpha -lt 1) {
        $wash = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb([int](255 * (1 - $alpha)), $Col.Bg))
        $g.FillRectangle($wash, 0, $SCENE_TOP, $W, ($SCENE_BOTTOM - $SCENE_TOP))
        $wash.Dispose()
    }

    # Scene position dots
    for ($i = 0; $i -lt $Scenes.Count; $i++) {
        $x = $RIGHT - ($Scenes.Count - 1 - $i) * 14 - 6
        $brush = if ($i -eq $idx) { $Br.Accent } else { $Br.Faint }
        $g.FillEllipse($brush, [single]$x, 79, 6, 6)
    }

    # Progress: whole steps are solid. The running step is not given a made-up
    # percentage; a band sweeps across its share of the bar instead.
    $step = [int]$S.Step; $total = [int]$S.StepCount
    $bw = $RIGHT - $LEFT
    $g.FillRectangle($Br.Rule, $LEFT, $BAR_Y, $bw, 4)
    $fill = $bw * (Clamp01 $shown)
    if ($fill -gt 0) { $g.FillRectangle($Br.Accent, [single]$LEFT, $BAR_Y, [single]$fill, 4) }
    if ($step -lt $total) {
        $segEnd = $bw * ($step + 1) / $total
        $segW = $segEnd - $fill
        if ($segW -gt 24) {
            $band = [math]::Min(60.0, $segW / 2)
            $pos = (($t % 1.6) / 1.6) * ($segW + $band) - $band
            $b0 = [math]::Max($fill, $fill + $pos); $b1 = [math]::Min($segEnd, $fill + $pos + $band)
            if ($b1 -gt $b0) {
                $sheen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, $Col.Accent))
                $g.FillRectangle($sheen, [single]($LEFT + $b0), $BAR_Y, [single]($b1 - $b0), 4)
                $sheen.Dispose()
            }
        }
    }

    $name = 'Ready'
    if ($step -lt $total) { $name = [string]$S.StepNames[$step] }
    $g.DrawString($name, $Fnt.Status, $Br.Text, ($LEFT - 1), 322)
    if ($step -lt $total) {
        $counter = "Step $($step + 1) of $total"
        if ($S.StepStartedAt) {
            $elapsed = [int]([DateTime]::UtcNow - [DateTime]$S.StepStartedAt).TotalSeconds
            if ($elapsed -ge 3) { $counter = "$counter  $([char]0x00B7)  $elapsed s" }
        }
        $g.DrawString($counter, $Fnt.Detail, $Br.Muted, (New-Object System.Drawing.RectangleF([single]$LEFT, 324, [single]$bw, 18)), $Far)
    }
    $line2 = if ($S.Activity) { [string]$S.Activity } else { [string]$S.Detail }
    if ($line2) {
        $font = if ($S.Activity) { $Fnt.Mono } else { $Fnt.Detail }
        $g.DrawString($line2, $font, $Br.Muted, (New-Object System.Drawing.RectangleF([single]$LEFT, 342, [single]$bw, 16)), $NoWrap)
    }

    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $g.DrawRectangle($Pn.Border, 0, 0, ($W - 1), ($H - 1))
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
}

# ------------------------------------------------------------------
# Test mode: write PNG frames and stop
# ------------------------------------------------------------------
if ($S.RenderTo) {
    $n = 0
    foreach ($t in $S.RenderTimes) {
        Render-Frame ([double]$t) ([double]$S.Step / $S.StepCount) $false
        $Bmp.Save((Join-Path $S.RenderTo ('frame_{0:00}.png' -f $n)), [System.Drawing.Imaging.ImageFormat]::Png)
        $n++
    }
    $S.Closed = $true
    return
}

# ------------------------------------------------------------------
# Window
# ------------------------------------------------------------------
[System.Windows.Forms.Application]::EnableVisualStyles()
# Windows' "show animations" setting: off means a still frame and no fades.
$animate = [System.Windows.Forms.SystemInformation]::UIEffectsEnabled

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size($W, $H)
$form.BackColor = $Col.Bg
$form.Text = 'Oberleaf'
# In the taskbar and not always-on-top: it can be minimized, restored and
# covered by other windows while a first-run install or a build runs.
$form.ShowInTaskbar = $true
$form.TopMost = $false
$form.MinimizeBox = $true
if ($animate) { $form.Opacity = 0 }
if ($Logo) {
    try { $form.Icon = [System.Drawing.Icon]::FromHandle((New-Object System.Drawing.Bitmap($Logo, 64, 64)).GetHicon()) } catch {}
}

$pic = New-Object System.Windows.Forms.PictureBox
$pic.Dock = 'Fill'
$pic.Image = $Bmp
$form.Controls.Add($pic)

$State = @{
    Clock    = [System.Diagnostics.Stopwatch]::StartNew()
    Shown    = 0.0
    Hover    = $false
    Drag     = $null
    LastStep = -1
}
$tip = New-Object System.Windows.Forms.ToolTip

# No title bar: drag the window by its body, minimize with the button.
$pic.Add_MouseDown({
    param($s, $e)
    if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
    if ($MinBtn.Contains($e.Location)) {
        $State.Hover = $false
        $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
        return
    }
    $State.Drag = @{ Mouse = [System.Windows.Forms.Cursor]::Position; Origin = $form.Location }
})
$pic.Add_MouseMove({
    param($s, $e)
    $over = $MinBtn.Contains($e.Location)
    if ($over -ne $State.Hover) {
        $State.Hover = $over
        $pic.Cursor = if ($over) { [System.Windows.Forms.Cursors]::Hand } else { [System.Windows.Forms.Cursors]::Default }
        if ($over) { $tip.Show('Minimize', $pic, ($MinBtn.X - 20), ($MinBtn.Bottom + 4), 1500) } else { $tip.Hide($pic) }
    }
    if ($State.Drag) {
        $now = [System.Windows.Forms.Cursor]::Position
        $form.Location = New-Object System.Drawing.Point(
            ($State.Drag.Origin.X + $now.X - $State.Drag.Mouse.X),
            ($State.Drag.Origin.Y + $now.Y - $State.Drag.Mouse.Y))
    }
})
$pic.Add_MouseUp({ $State.Drag = $null })
$pic.Add_MouseLeave({ if ($State.Hover) { $State.Hover = $false; $tip.Hide($pic) } })

$form.Add_Shown({
    # Raise it once so it does not open behind the window the user launched
    # from, then let go: it must not stay above their other work.
    $form.TopMost = $true
    $form.Activate()
    $form.TopMost = $false
    $S.Ready = $true
})
# Clicking any other window minimizes the splash to the taskbar, so a long
# first-run install or build never sits over the user's work.
$form.Add_Deactivate({
    if ($S.Ready -and -not $S.Close -and $form.WindowState -ne 'Minimized') {
        $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
    }
})

# With animations off, show the first scene with its result already set.
$still = 3.6
Render-Frame ($(if ($animate) { 0.0 } else { $still })) 0.0 $false

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 33
$timer.Add_Tick({
    try {
        if ($S.Close) {
            if ($animate -and $form.Opacity -gt 0.15 -and $form.WindowState -ne 'Minimized') {
                # 0.0, not 0: Max(int, int) would round the opacity back to 1.
                $form.Opacity = [math]::Max(0.0, $form.Opacity - 0.2)
            } else {
                $timer.Stop()
                $form.Close()
            }
            return
        }
        if ($animate -and $form.Opacity -lt 1) { $form.Opacity = [math]::Min(1.0, $form.Opacity + 0.14) }

        $step = [int]$S.Step
        if ($step -ne $State.LastStep) { $State.LastStep = $step; $S.StepStartedAt = [DateTime]::UtcNow }
        $target = Clamp01 ($step / [double]$S.StepCount)
        if ($animate) { $State.Shown += ($target - $State.Shown) * 0.14 } else { $State.Shown = $target }

        # Nothing to draw while minimized; the scene clock keeps running.
        if ($form.WindowState -ne [System.Windows.Forms.FormWindowState]::Minimized) {
            $t = if ($animate) { $State.Clock.Elapsed.TotalSeconds } else { $still }
            Render-Frame $t $State.Shown $State.Hover
            $pic.Invalidate()
        }
    } catch {
        $S.LastError = "$($_.Exception.Message) @ line $($_.InvocationInfo.ScriptLineNumber)"
    }
})
$form.Add_FormClosed({ $timer.Stop() })
$timer.Start()

try {
    [System.Windows.Forms.Application]::Run($form)
} finally {
    $S.Closed = $true
    $timer.Dispose()
    $G.Dispose()
    $Bmp.Dispose()
}
