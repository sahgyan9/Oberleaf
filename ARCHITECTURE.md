# Architecture & Agent Codebase Index

This document provides a fast-lookup guide for human contributors and AI coding agents to immediately locate key features and implementation logic without crawling the repository.

---

## Feature-to-File Matrix

| Feature / Capability | Primary Source Files | Key Functions / Hooks |
| :--- | :--- | :--- |
| **Keyboard Shortcuts & Editor Formatting** (`Ctrl+B`, `Ctrl+I`, `Ctrl+S`, `Ctrl+7/8/9`) | [`src/hooks/useKeyboardShortcuts.ts`](src/hooks/useKeyboardShortcuts.ts)<br>[`src/utils/editorFormatting.ts`](src/utils/editorFormatting.ts)<br>[`src/components/Editor/Editor.tsx`](src/components/Editor/Editor.tsx) | `useKeyboardShortcuts()`, `wrapOrToggleFormatting()`, `wrapOrToggleSelection()`, `latex-bold`, `latex-italic` |
| **3-Way Viewport Layout** (Split, Code-Only, PDF-Only) | [`src/App.tsx`](src/App.tsx)<br>[`src/components/TopBar/TopBar.tsx`](src/components/TopBar/TopBar.tsx) | `viewMode` state (`'split' \| 'code' \| 'pdf'`), `handleViewModeChange` (bidirectional auto-sync) |
| **LaTeX Compilation Pipeline** (Local CPU `pdflatex` / `latexmk`) | [`server/compiler.ts`](server/compiler.ts)<br>[`server/index.ts`](server/index.ts) | `compileDocument()`, `getProjectSearchPaths()`, `parseLatexLog()`, `isLatexmkAvailable()` |
| **SyncTeX (Forward & Backward) & Viewport Anchoring** | [`server/synctex.ts`](server/synctex.ts)<br>[`src/components/PDFViewer/PDFViewer.tsx`](src/components/PDFViewer/PDFViewer.tsx)<br>[`src/components/Editor/Editor.tsx`](src/components/Editor/Editor.tsx) | `handleSyncTexBackward()`, `handleJumpToPdf()`, `viewportAnchorRef`, `getVisibleSyncTarget()`, single-shot target consumption |
| **Monaco LaTeX Editor & IntelliSense** | [`src/components/Editor/Editor.tsx`](src/components/Editor/Editor.tsx)<br>[`src/utils/latexCompletions.ts`](src/utils/latexCompletions.ts)<br>[`src/utils/latexLanguage.ts`](src/utils/latexLanguage.ts) | `registerLatexCompletions()` (`\cite`, `\label`, `\includegraphics`) |
| **Document Outline & Section Drag-and-Drop** (Hierarchical section tree, click-to-jump, atomic Monaco buffer reordering, undo safety) | [`src/utils/latexOutline.ts`](src/utils/latexOutline.ts)<br>[`src/components/Outline/OutlinePanel.tsx`](src/components/Outline/OutlinePanel.tsx)<br>[`src/App.tsx`](src/App.tsx) | `parseLatexOutline()`, `computeSectionMove()`, `handleJumpToSectionLine()`, `handleReorderSection()`, `[Files \| Outline]` sidebar tabs |
| **Live KaTeX Math Preview** | [`src/components/EquationPreview/EquationPreview.tsx`](src/components/EquationPreview/EquationPreview.tsx)<br>[`src/utils/mathDetector.ts`](src/utils/mathDetector.ts) | `extractMathAtPosition()`, `isLiveMathEnabled` |
| **File Tree & Multi-File Management** | [`src/components/FileTree/FileTree.tsx`](src/components/FileTree/FileTree.tsx)<br>[`server/projects.ts`](server/projects.ts) | File CRUD, upload routing, zip export |
| **Dependency Doctor (Don Norman Diagnostics)** | [`src/components/DependencyDoctor/DependencyDoctor.tsx`](src/components/DependencyDoctor/DependencyDoctor.tsx)<br>[`server/doctor.ts`](server/doctor.ts) | Checks `pdflatex`, `bibtex`, `perl`, `latexmk` in system PATH |
| **Design System & Theme (Scholarly Atelier)** | [`src/context/ThemeContext.tsx`](src/context/ThemeContext.tsx)<br>[`tailwind.config.ts`](tailwind.config.ts)<br>[`brand_assets/BRAND_GUIDELINES.md`](brand_assets/BRAND_GUIDELINES.md) | Dark/Light mode tokens (`scholarly`, `surface-dark`, etc.) |
| **Document Title Extraction & PDF Filename** | [`src/utils/latexTitle.ts`](src/utils/latexTitle.ts)<br>[`server/latexTitle.ts`](server/latexTitle.ts) | Extracts `\title{...}` for dynamic PDF download names |
| **Intelligent Quick-Fix & Auto-Remedy Engine** (Missing Packages, Preamble Injection, MiKTeX/CTAN Installer, In-Place Math Wrapping `\[...\]`, Batch Package Scanner, Undo Safety) | [`server/compiler.ts`](server/compiler.ts)<br>[`src/utils/latexPackages.ts`](src/utils/latexPackages.ts)<br>[`server/index.ts`](server/index.ts)<br>[`src/components/PDFViewer/PDFViewer.tsx`](src/components/PDFViewer/PDFViewer.tsx)<br>[`src/App.tsx`](src/App.tsx) | `detectSuggestedFix()`, `scanMissingPackages()`, `wrapMathEnvironment()`, `injectPackagesIntoPreamble()`, `handleApplyFix()`, `handleApplyBatchFix()`, `handleUndoFix()`, `/api/projects/:id/packages/install` |
| **GitHub Remote Sync & Milestone Commits** (Comment & Push, Milestones filter, Remote branches) | [`server/git.ts`](server/git.ts)<br>[`server/index.ts`](server/index.ts)<br>[`src/components/History/HistoryDrawer.tsx`](src/components/History/HistoryDrawer.tsx)<br>[`src/components/GitSync/GitSyncModal.tsx`](src/components/GitSync/GitSyncModal.tsx) | `createExplicitCommit()`, `pushToRemote()`, `pullFromRemote()`, `getGitSyncStatus()`, `isMilestone` |
| **Review Comments Engine** (Line-anchored review threads, `.comments.json` portability, offline) | [`server/comments.ts`](server/comments.ts)<br>[`src/components/Comments/CommentsDrawer.tsx`](src/components/Comments/CommentsDrawer.tsx)<br>[`src/components/Editor/Editor.tsx`](src/components/Editor/Editor.tsx) | `getComments()`, `addComment()`, `addReply()`, `resolveComment()`, `comment-highlight-line` decorations, `Alt+M` shortcut |
| **Live Host-Share & P2P Collaboration** (LAN Wi-Fi discovery, Cloudflare Quick Tunnel, character-level `y-monaco` delta CRDTs, multi-file channel awareness, synchronized compilation) | [`server/tunnel.ts`](server/tunnel.ts)<br>[`server/index.ts`](server/index.ts)<br>[`src/utils/yjsCollab.ts`](src/utils/yjsCollab.ts)<br>[`src/components/Collaboration/CollabModal.tsx`](src/components/Collaboration/CollabModal.tsx)<br>[`src/App.tsx`](src/App.tsx) | `getCollabNetworkStatus()`, `startCloudflareTunnel()`, `setupMonacoCollab()`, `broadcastRemoteCompile()`, `?project=&room=` auto-mount |
| **Clean Build & Cache Reset** (Auxiliary file cleanup, `--shell-escape` toggle) | [`server/compiler.ts`](server/compiler.ts)<br>[`server/index.ts`](server/index.ts)<br>[`src/components/TopBar/TopBar.tsx`](src/components/TopBar/TopBar.tsx) | `cleanBuildCache()`, `POST /api/projects/:id/clean` |
| **AI Style Guide & Anti-Slop Policy** (Zero emojis, senior engineering tone, TeX line unwrap) | [`AI_STYLE_GUIDE.md`](AI_STYLE_GUIDE.md) | Standard for agents: no decorative emojis, professional UI copy, cascade handling |
| **Windows Explorer Discovery & Project Location** (Reveal in Explorer, safe workspace folder) | [`server/index.ts`](server/index.ts)<br>[`server/projects.ts`](server/projects.ts)<br>[`src/components/Dashboard/ProjectsDashboard.tsx`](src/components/Dashboard/ProjectsDashboard.tsx)<br>[`src/components/FileTree/FileTree.tsx`](src/components/FileTree/FileTree.tsx) | `POST /api/system/reveal-in-explorer`, `getProjectsRoot()`, `Reveal in File Explorer` action |
| **Runtime Observability Status Bar** (Daemon heartbeat, compiler state, path chip, editor telemetry) | [`src/components/StatusBar/StatusBar.tsx`](src/components/StatusBar/StatusBar.tsx)<br>[`src/App.tsx`](src/App.tsx) | Live server port indicator, compile progress indicator, active document path |
| **Project Templates & Gallery** (15 templates as real files, first-page previews, multi-file thesis) | [`templates/`](templates/)<br>[`server/templates.ts`](server/templates.ts)<br>[`scripts/build-template-previews.ts`](scripts/build-template-previews.ts)<br>[`src/components/Modals/NewProjectModal.tsx`](src/components/Modals/NewProjectModal.tsx) | `templates/catalog.json`, `getTemplateCatalog()`, `writeTemplateInto()`, `GET /api/templates`, `GET /api/templates/:id/preview`; `npm run build:template-previews` compiles every template and fails on one that does not build |
| **Citation Lookup** (DOI, arXiv ID or title to BibTeX) | [`server/citationLookup.ts`](server/citationLookup.ts)<br>[`src/components/Modals/CitationLookup.tsx`](src/components/Modals/CitationLookup.tsx)<br>[`tests/citationLookup.test.ts`](tests/citationLookup.test.ts) | `classifyQuery()`, `lookupDoi()`, `lookupArxiv()`, `searchByTitle()`, `tidyEntry()`, `makeCitationKey()`, `GET /api/citations/lookup?q=` |
| **Table From Pasted Data** (TSV, CSV, Markdown to booktabs) | [`src/utils/tableImport.ts`](src/utils/tableImport.ts)<br>[`src/components/Modals/InsertTableModal.tsx`](src/components/Modals/InsertTableModal.tsx)<br>[`tests/tableImport.test.ts`](tests/tableImport.test.ts) | `parseTableText()`, `detectAlignment()`, `escapeCell()`, `buildLatexTable()` |
| **Command Palette** (Ctrl+K: files, headings, projects, actions) | [`src/components/CommandPalette/CommandPalette.tsx`](src/components/CommandPalette/CommandPalette.tsx)<br>[`src/App.tsx`](src/App.tsx) | `paletteItems`, `matchScore()` |
| **Symbols & Reference Panel** (Ctrl+Shift+M) | [`src/components/Reference/ReferencePanel.tsx`](src/components/Reference/ReferencePanel.tsx)<br>[`src/utils/latexReference.ts`](src/utils/latexReference.ts) | `SYMBOL_GROUPS`, `CHEAT_SHEET`, `handleInsertSymbol()` (wraps in `$...$` outside math) |
| **Word Count** | [`src/utils/wordCount.ts`](src/utils/wordCount.ts)<br>[`src/components/StatusBar/StatusBar.tsx`](src/components/StatusBar/StatusBar.tsx) | `countLatexWords()` |
| **Toolbar Overflow & Panel Minimums** (no clipped controls) | [`src/components/Common/OverflowBar.tsx`](src/components/Common/OverflowBar.tsx)<br>[`src/hooks/useElementWidth.ts`](src/hooks/useElementWidth.ts) | `OverflowBar` (labels collapse, then items move to a More menu; used by TopBar, EditorToolbar, FileTree), `pxToPanelPercent()` |
| **Startup Splash** (own thread, minimize, per-step progress, log activity line) | [`scripts/launch.ps1`](scripts/launch.ps1)<br>[`index.html`](index.html)<br>[`src/boot.ts`](src/boot.ts) | `$SplashScript` (runspace with its own message loop), `Update-Splash`, `Set-SplashActivity`, `Close-Splash`; `window.__oberleafBoot` for the in-page screen |
| **Windows Setup Wizard & Uninstallation** (Interactive GUI, shortcut toggles, Windows Settings registration) | [`scripts/install.ps1`](scripts/install.ps1)<br>[`scripts/uninstall.ps1`](scripts/uninstall.ps1)<br>[`Oberleaf-Setup.bat`](Oberleaf-Setup.bat)<br>[`Uninstall-Oberleaf.bat`](Uninstall-Oberleaf.bat) | Inno/WinForms setup wizard, uninstaller with project retention safety, registry uninstall key |

---

## Distribution & Download Hosting Architecture

> [!IMPORTANT]
> **Production Download Host**:
> Oberleaf's web landing page and downloadable binaries are hosted and deployed from:
> the **friendly-learning-srmap** repository (a separate project)
> - **Landing Page**: `src/pages/OberleafLanding.tsx` (accessible at `/oberleaf`)
> - **Download Artifacts**: `public/downloads/`
>   - `Oberleaf-Setup.bat` (bootstrap launcher)
>   - `install.ps1` (automated PowerShell installer & setup wizard)
>   - `Oberleaf-Setup.zip` (offline setup bundle containing batch launcher, script, and readme)
>   - `oberleaf-icon.svg` (high-res vector brand logo)
>
> Whenever changes are made to installer scripts (`scripts/install.ps1`, `Oberleaf-Setup.bat`, or uninstaller logic), the files inside `friendly-learning-srmap/public/downloads/` must be updated and `Oberleaf-Setup.zip` rebuilt to maintain parity.

---

## Agent Discovery Guidelines

When an AI agent is tasked with modifying this codebase:

1. **Do NOT crawl the root directory with `*`**:  
   Always exclude:
   - `node_modules/**`
   - `projects/**` *(contains user LaTeX files, figures, compiled PDFs, and build artifacts)*
   - `dist/**`
   - `.git/**`
2. **Search by Subsystem**:
   - Frontend UI & hooks: `src/`
   - Backend compiler & filesystem: `server/`
   - Windows integration scripts: `scripts/`
3. **Keyword-to-File Fast Paths**:
   - Searching for shortcuts or hotkeys? Go straight to [`src/hooks/useKeyboardShortcuts.ts`](src/hooks/useKeyboardShortcuts.ts).
   - Searching for viewport sizing or split layout? Go straight to [`src/App.tsx`](src/App.tsx) and [`src/components/TopBar/TopBar.tsx`](src/components/TopBar/TopBar.tsx).
   - Searching for LaTeX errors or build flags? Go straight to [`server/compiler.ts`](server/compiler.ts).
   - Searching for download hosting or web installer? Check `public/downloads/` in the friendly-learning-srmap repository.
