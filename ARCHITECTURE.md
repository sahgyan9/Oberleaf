# Architecture & Agent Codebase Index 🧭

This document provides a fast-lookup guide for human contributors and AI coding agents to immediately locate key features and implementation logic without crawling the repository.

---

## ⚡ Feature-to-File Matrix

| Feature / Capability | Primary Source Files | Key Functions / Hooks |
| :--- | :--- | :--- |
| **Keyboard Shortcuts & Editor Formatting** (`Ctrl+B`, `Ctrl+I`, `Ctrl+S`, `Ctrl+7/8/9`) | [`src/hooks/useKeyboardShortcuts.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/hooks/useKeyboardShortcuts.ts)<br>[`src/utils/editorFormatting.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/editorFormatting.ts)<br>[`src/components/Editor/Editor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Editor/Editor.tsx) | `useKeyboardShortcuts()`, `wrapOrToggleFormatting()`, `wrapOrToggleSelection()`, `latex-bold`, `latex-italic` |
| **3-Way Viewport Layout** (Split, Code-Only, PDF-Only) | [`src/App.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/App.tsx)<br>[`src/components/TopBar/TopBar.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/TopBar/TopBar.tsx) | `viewMode` state (`'split' \| 'code' \| 'pdf'`), `handleViewModeChange` (bidirectional auto-sync) |
| **LaTeX Compilation Pipeline** (Local CPU `pdflatex` / `latexmk`) | [`server/compiler.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/compiler.ts)<br>[`server/index.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/index.ts) | `compileDocument()`, `getProjectSearchPaths()`, `parseLatexLog()`, `isLatexmkAvailable()` |
| **SyncTeX (Forward & Backward) & Viewport Anchoring** | [`server/synctex.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/synctex.ts)<br>[`src/components/PDFViewer/PDFViewer.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/PDFViewer/PDFViewer.tsx)<br>[`src/components/Editor/Editor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Editor/Editor.tsx) | `handleSyncTexBackward()`, `handleJumpToPdf()`, `viewportAnchorRef`, `getVisibleSyncTarget()`, single-shot target consumption |
| **Monaco LaTeX Editor & IntelliSense** | [`src/components/Editor/Editor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Editor/Editor.tsx)<br>[`src/utils/latexCompletions.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/latexCompletions.ts)<br>[`src/utils/latexLanguage.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/latexLanguage.ts) | `registerLatexCompletions()` (`\cite`, `\label`, `\includegraphics`) |
| **Live KaTeX Math Preview** | [`src/components/EquationPreview/EquationPreview.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/EquationPreview/EquationPreview.tsx)<br>[`src/utils/mathDetector.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/mathDetector.ts) | `extractMathAtPosition()`, `isLiveMathEnabled` |
| **File Tree & Multi-File Management** | [`src/components/FileTree/FileTree.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/FileTree/FileTree.tsx)<br>[`server/projects.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/projects.ts) | File CRUD, upload routing, zip export |
| **Dependency Doctor (Don Norman Diagnostics)** | [`src/components/DependencyDoctor/DependencyDoctor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/DependencyDoctor/DependencyDoctor.tsx)<br>[`server/doctor.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/doctor.ts) | Checks `pdflatex`, `bibtex`, `perl`, `latexmk` in system PATH |
| **Design System & Theme (Scholarly Atelier)** | [`src/context/ThemeContext.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/context/ThemeContext.tsx)<br>[`tailwind.config.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/tailwind.config.ts)<br>[`brand_assets/BRAND_GUIDELINES.md`](file:///c:/Users/sahgy/Downloads/overleaf-copy/brand_assets/BRAND_GUIDELINES.md) | Dark/Light mode tokens (`scholarly`, `surface-dark`, etc.) |
| **Document Title Extraction & PDF Filename** | [`src/utils/latexTitle.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/latexTitle.ts)<br>[`server/latexTitle.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/latexTitle.ts) | Extracts `\title{...}` for dynamic PDF download names |
| **Intelligent Quick-Fix & Auto-Remedy Engine** (Missing Packages, Preamble Injection, MiKTeX/CTAN Installer, In-Place Math Wrapping `\[...\]`, Batch Package Scanner, Undo Safety) | [`server/compiler.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/compiler.ts)<br>[`src/utils/latexPackages.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/latexPackages.ts)<br>[`server/index.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/index.ts)<br>[`src/components/PDFViewer/PDFViewer.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/PDFViewer/PDFViewer.tsx)<br>[`src/App.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/App.tsx) | `detectSuggestedFix()`, `scanMissingPackages()`, `wrapMathEnvironment()`, `injectPackagesIntoPreamble()`, `handleApplyFix()`, `handleApplyBatchFix()`, `handleUndoFix()`, `/api/projects/:id/packages/install` |
| **GitHub Remote Sync & Milestone Commits** (Comment & Push, Milestones filter, Remote branches) | [`server/git.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/git.ts)<br>[`server/index.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/index.ts)<br>[`src/components/History/HistoryDrawer.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/History/HistoryDrawer.tsx)<br>[`src/components/GitSync/GitSyncModal.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/GitSync/GitSyncModal.tsx) | `createExplicitCommit()`, `pushToRemote()`, `pullFromRemote()`, `getGitSyncStatus()`, `isMilestone` |
| **Review Comments Engine** (Line-anchored review threads, `.comments.json` portability, offline) | [`server/comments.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/comments.ts)<br>[`src/components/Comments/CommentsDrawer.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Comments/CommentsDrawer.tsx)<br>[`src/components/Editor/Editor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Editor/Editor.tsx) | `getComments()`, `addComment()`, `addReply()`, `resolveComment()`, `comment-highlight-line` decorations, `Alt+M` shortcut |
| **Live Host-Share & P2P Collaboration** (LAN Wi-Fi discovery, Cloudflare Quick Tunnel, character-level `y-monaco` delta CRDTs, multi-file channel awareness, synchronized compilation) | [`server/tunnel.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/tunnel.ts)<br>[`server/index.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/index.ts)<br>[`src/utils/yjsCollab.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/yjsCollab.ts)<br>[`src/components/Collaboration/CollabModal.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Collaboration/CollabModal.tsx)<br>[`src/App.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/App.tsx) | `getCollabNetworkStatus()`, `startCloudflareTunnel()`, `setupMonacoCollab()`, `broadcastRemoteCompile()`, `?project=&room=` auto-mount |
| **Clean Build & Cache Reset** (Auxiliary file cleanup, `--shell-escape` toggle) | [`server/compiler.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/compiler.ts)<br>[`server/index.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/index.ts)<br>[`src/components/TopBar/TopBar.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/TopBar/TopBar.tsx) | `cleanBuildCache()`, `POST /api/projects/:id/clean` |
| **AI Style Guide & Anti-Slop Policy** (Zero emojis, senior engineering tone, TeX line unwrap) | [`AI_STYLE_GUIDE.md`](file:///c:/Users/sahgy/Downloads/overleaf-copy/AI_STYLE_GUIDE.md) | Standard for agents: no decorative emojis, professional UI copy, cascade handling |
| **Windows Explorer Discovery & Project Location** (Reveal in Explorer, safe workspace folder) | [`server/index.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/index.ts)<br>[`server/projects.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/projects.ts)<br>[`src/components/Dashboard/ProjectsDashboard.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Dashboard/ProjectsDashboard.tsx)<br>[`src/components/FileTree/FileTree.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/FileTree/FileTree.tsx) | `POST /api/system/reveal-in-explorer`, `getProjectsRoot()`, `Reveal in File Explorer` action |
| **Runtime Observability Status Bar** (Daemon heartbeat, compiler state, path chip, editor telemetry) | [`src/components/StatusBar/StatusBar.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/StatusBar/StatusBar.tsx)<br>[`src/App.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/App.tsx) | Live server port indicator, compile progress indicator, active document path |
| **Windows Setup Wizard & Uninstallation** (Interactive GUI, shortcut toggles, Windows Settings registration) | [`scripts/install.ps1`](file:///c:/Users/sahgy/Downloads/overleaf-copy/scripts/install.ps1)<br>[`scripts/uninstall.ps1`](file:///c:/Users/sahgy/Downloads/overleaf-copy/scripts/uninstall.ps1)<br>[`Oberleaf-Setup.bat`](file:///c:/Users/sahgy/Downloads/overleaf-copy/Oberleaf-Setup.bat)<br>[`Uninstall-Oberleaf.bat`](file:///c:/Users/sahgy/Downloads/overleaf-copy/Uninstall-Oberleaf.bat) | Inno/WinForms setup wizard, uninstaller with project retention safety, registry uninstall key |

---

## 🌐 Distribution & Download Hosting Architecture

> [!IMPORTANT]
> **Production Download Host**:
> Oberleaf's web landing page and downloadable binaries are hosted and deployed from:
> **`C:\Users\sahgy\Downloads\friendly-learning-srmap`**
> - **Landing Page**: `src/pages/OberleafLanding.tsx` (accessible at `/oberleaf`)
> - **Download Artifacts**: `public/downloads/`
>   - `Oberleaf-Setup.bat` (bootstrap launcher)
>   - `install.ps1` (automated PowerShell installer & setup wizard)
>   - `Oberleaf-Setup.zip` (offline setup bundle containing batch launcher, script, and readme)
>   - `oberleaf-icon.svg` (high-res vector brand logo)
>
> Whenever changes are made to installer scripts (`scripts/install.ps1`, `Oberleaf-Setup.bat`, or uninstaller logic), the files inside `friendly-learning-srmap/public/downloads/` must be updated and `Oberleaf-Setup.zip` rebuilt to maintain parity.

---

## 🔍 Agent Discovery Guidelines

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
   - Searching for shortcuts or hotkeys? Go straight to [`src/hooks/useKeyboardShortcuts.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/hooks/useKeyboardShortcuts.ts).
   - Searching for viewport sizing or split layout? Go straight to [`src/App.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/App.tsx) and [`src/components/TopBar/TopBar.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/TopBar/TopBar.tsx).
   - Searching for LaTeX errors or build flags? Go straight to [`server/compiler.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/compiler.ts).
   - Searching for download hosting or web installer? Check [`C:\Users\sahgy\Downloads\friendly-learning-srmap\public\downloads`](file:///c:/Users/sahgy/Downloads/friendly-learning-srmap/public/downloads).
