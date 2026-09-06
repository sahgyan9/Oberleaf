# Master Brand Guidelines: The Scholarly Atelier

> **Product**: Overleaf Copy / Scholarly TeX Studio  
> **Audience**: Academic researchers, university students, thesis writers, scientific authors  
> **Core Purpose**: Fast, local-first LaTeX environment freeing authors from cloud timeout quotas and subscription limits, paired with calm concentration and frictionless math authoring.

---

## 1. Brand Philosophy & Aesthetic Direction

### The "Scholarly Atelier" Concept
Traditional writing and typesetting tools are about **paper, ink, typography, and quiet intellectual flow**. 
Current AI-generated UIs mistakenly mimic crypto exchanges or cloud devops tools (cold blue-black `#0B0F19`, glowing neon mint `#15D8B3`, and pill badges everywhere).

The **Scholarly Atelier** direction replaces sterile machine aesthetics with **tactile human craftsmanship**:
* **Atmosphere**: A quiet university reading room or an architect's drafting table.
* **Emotional State**: Calm, sustained concentration without visual noise, anxiety-inducing pulsing lights, or "border soup".
* **Human-First Utility**:
  - Instant local compile times proudly displayed without fuss.
  - Transparent error recovery with a 1-click **"Copy AI Debug Prompt"** (formats logs + code for ChatGPT/Claude/Gemini).
  - Frictionless inline math preview and tab-completion.

---

## 2. Color Palette & Psychological Rationale

```
Light Mode ("The Reading Room"):
[ Canvas: #FBFBFA ]  [ Paper Panel: #FFFFFF ]  [ Stone Subtle: #F4F3EF ]  [ Ink Text: #1C1917 ]  [ Oxford Green: #1B5E20 ]

Dark Mode ("The Nocturnal Study"):
[ Canvas: #141416 ]  [ Cloth Panel: #1C1C1F ]  [ Slate Subtle: #26262B ]  [ Alabaster: #F5F5F4 ]  [ Laurel Green: #2EA043 ]
```

### Light Palette (The Reading Room)
* `--bg-canvas`: `#FBFBFA`  
  *Rationale*: Warm archival paper / soft ivory. Unlike clinical `#FFFFFF` or cold `#F8FAFC`, warm off-white absorbs harsh monitor glare and dramatically reduces eye fatigue during multi-hour writing sessions.
* `--bg-panel`: `#FFFFFF`  
  *Rationale*: Clean white sheets for the active drafting area, evoking fresh printer paper on a wooden desk.
* `--bg-subtle`: `#F4F3EF`  
  *Rationale*: Warm vellum for sidebars, toolbars, and recessed panels.
* `--border-subtle`: `#E7E5DF`  
  *Rationale*: Warm stone hairline dividers. Soft enough to separate panels without trapping the eye in rigid boxes.
* `--text-main`: `#1C1917`  
  *Rationale*: Archival carbon ink. Pure `#000000` causes vibrating high-contrast eye fatigue on screens; carbon black feels organic and print-like.
* `--text-sub`: `#57534E`  
  *Rationale*: Muted graphite for line numbers, secondary file paths, and auxiliary metadata.

### Dark Palette (The Nocturnal Study)
* `--bg-canvas`: `#141416`  
  *Rationale*: Deep obsidian / warm graphite. Avoids the cold blue tint (`#0B0F19`) typical of generic AI dashboards.
* `--bg-panel`: `#1C1C1F`  
  *Rationale*: Bookbinder cloth texture; rich, dark, and tactile.
* `--bg-subtle`: `#26262B`  
  *Rationale*: Etched slate for toolbars, dropdowns, and hover states.
* `--border-subtle`: `#2E2E35`  
  *Rationale*: Quiet hairline separation with minimal luminosity.
* `--text-main`: `#F5F5F4`  
  *Rationale*: Warm alabaster. Clear, high-contrast, yet warm and gentle on the eyes in low-light environments.
* `--text-sub`: `#A8A29E`  
  *Rationale*: Warm silver for comments, file tree depths, and secondary controls.

### Functional Accents
* `--accent-primary`: `#1B5E20` (Light) / `#2EA043` (Dark)  
  *Rationale*: Oxford Academic Forest Green. The traditional color of academic libraries, scholarly monographs, and reassurance. Used for the primary **Recompile** action and clean success states.
* `--accent-citation`: `#2563EB` (Light) / `#38BDF8` (Dark)  
  *Rationale*: Cambridge Ink Blue. Evokes classic hyperlinked academic citations, `.bib` files, and reference tools.
* `--accent-warn`: `#D97706` (Light) / `#F59E0B` (Dark)  
  *Rationale*: Warm Ochre. Signals warnings or diagnostic recommendations calmly, without flashing or panic.
* `--accent-error`: `#DC2626` (Light) / `#EF4444` (Dark)  
  *Rationale*: Crimson Ink. Highlights TeX compilation failures clearly, immediately paired with the 1-click **"Copy AI Debug Prompt"** helper.

---

## 3. Typography Hierarchy

| Role | Font Family | Weight / Style | Application |
| :--- | :--- | :--- | :--- |
| **Brand & Monograph Headings** | `"Newsreader", Georgia, "Times New Roman", serif` | SemiBold / Italic | App wordmark, modal titles, document outline headings |
| **UI & Navigation** | `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Regular (400), Medium (500) | Menus, file tree, tooltips, dialogs, buttons |
| **Code & TeX Markup** | `"JetBrains Mono", "Fira Code", "SF Mono", monospace` | Regular (400), Medium (500) | Monaco LaTeX editor, math equations, terminal output, shortcut keys |

### Typographic Rules:
1. **No screaming labels**: Uppercase text must always have `letter-spacing: 0.05em` and `font-size: 11px` maximum.
2. **Editorial hierarchy**: Primary buttons use title case (`Recompile`, `New Project`), never robotic ALL CAPS.
3. **Readable Monospace**: Monospace symbols in LaTeX (`\`, `{`, `}`, `[`, `]`, `$`, `_`) must be optically distinct and rendered with ligatures where helpful.

---

## 4. Spacing, Elevation & Tactile Depth

### Eliminating "Border Soup"
* Instead of wrapping every box in a heavy 1px border, delineate zones using **subtle 2% tonal shifts** between canvas and panel.
* Borders should only be used where panels resize or scroll independently.

### Tactile Physical Elevation (Replacing Neon Drops)
* **Standard Button**:
  - Light: `border border-stone-300/80 bg-white shadow-sm hover:bg-stone-50 active:translate-y-[0.5px]`
  - Dark: `border border-stone-700/60 bg-stone-800 shadow-sm hover:bg-stone-700 active:translate-y-[0.5px]`
* **Primary Recompile Button**:
  - Light: `bg-[#1B5E20] hover:bg-[#164E1B] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98]`
  - Dark: `bg-[#2EA043] hover:bg-[#278638] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98]`
* **PDF Paper Stage**:
  - The rendered PDF sits on an archival gray canvas with realistic sheet drop-shadow (`shadow-[0_4px_20px_rgba(0,0,0,0.08)]`), looking like an actual printed physical paper.

---

## 5. Component Personality & Interaction Patterns

### 1. The Wordmark & TopBar
* Remove the neon split `<span className="text-brand-mint">Copy</span>` and the tiny `local` pill badge.
* Wordmark: Crafted academic branding—`Overleaf Local` or `Folio TeX Studio` in a distinguished editorial serif, accompanied by a subtle muted indicator: `(Local Workspace • Fast Build)`.

### 2. The Recompile Experience
* Clicking Recompile initiates a calm, smooth progress bar across the editor top edge, replacing chaotic spinner overlays.
* Shows compile duration quietly: `Compiled in 0.38s (local engine)`.

### 3. Error Handling & 1-Click "Copy AI Prompt"
* When TeX compilation encounters errors:
  - Extract the exact error message (e.g. `! LaTeX Error: File 'amsmath.sty' not found.`).
  - Present a distinguished card with two actions:
    1. **"Jump to Line"** (instantly positions cursor in Monaco).
    2. **"Copy Prompt for AI"** (copies a perfectly formatted context prompt containing the error, line number, and relevant TeX block, ready to paste into ChatGPT, Claude, or Gemini).

### 4. File Tree & Icons
* Replace mismatched neon green/cyan icons with a cohesive, muted palette:
  - `.tex` files: Rich archival forest green or carbon ink.
  - `.bib` files: Deep citation blue.
  - Images / figures: Warm ochre or terracotta.
  - Folders: Gentle warm slate.

### 5. Equation Preview (Live KaTeX)
* Replace floating glowing popups with a warm parchment tooltip that appears quietly above math equations with zero lag.
