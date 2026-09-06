# Architecture & Agent Codebase Index 🧭

This document provides a fast-lookup guide for human contributors and AI coding agents to immediately locate key features and implementation logic without crawling the repository.

---

## ⚡ Feature-to-File Matrix

| Feature / Capability | Primary Source Files | Key Functions / Hooks |
| :--- | :--- | :--- |
| **Keyboard Shortcuts** (`Ctrl+7/8/9`, `Ctrl+S`, `Ctrl+B`) | [`src/hooks/useKeyboardShortcuts.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/hooks/useKeyboardShortcuts.ts) | `useKeyboardShortcuts()` |
| **3-Way Viewport Layout** (Split, Code-Only, PDF-Only) | [`src/App.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/App.tsx)<br>[`src/components/TopBar/TopBar.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/TopBar/TopBar.tsx) | `viewMode` state (`'split' \| 'code' \| 'pdf'`), `handleViewModeChange` (bidirectional auto-sync) |
| **LaTeX Compilation Pipeline** (Local CPU `pdflatex` / `latexmk`) | [`server/compiler.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/compiler.ts)<br>[`server/index.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/index.ts) | `compileLatex()`, `parseLatexErrors()` |
| **SyncTeX (Forward & Backward) & Viewport Anchoring** | [`server/synctex.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/synctex.ts)<br>[`src/components/PDFViewer/PDFViewer.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/PDFViewer/PDFViewer.tsx)<br>[`src/components/Editor/Editor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Editor/Editor.tsx) | `handleSyncTexBackward()`, `handleJumpToPdf()`, `viewportAnchorRef`, `getVisibleSyncTarget()`, single-shot target consumption |
| **Monaco LaTeX Editor & IntelliSense** | [`src/components/Editor/Editor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/Editor/Editor.tsx)<br>[`src/utils/latexCompletions.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/latexCompletions.ts)<br>[`src/utils/latexLanguage.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/latexLanguage.ts) | `registerLatexCompletions()` (`\cite`, `\label`, `\includegraphics`) |
| **Live KaTeX Math Preview** | [`src/components/EquationPreview/EquationPreview.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/EquationPreview/EquationPreview.tsx)<br>[`src/utils/mathDetector.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/mathDetector.ts) | `extractMathAtPosition()`, `isLiveMathEnabled` |
| **File Tree & Multi-File Management** | [`src/components/FileTree/FileTree.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/FileTree/FileTree.tsx)<br>[`server/projects.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/projects.ts) | File CRUD, upload routing, zip export |
| **Dependency Doctor (Don Norman Diagnostics)** | [`src/components/DependencyDoctor/DependencyDoctor.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/components/DependencyDoctor/DependencyDoctor.tsx)<br>[`server/doctor.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/doctor.ts) | Checks `pdflatex`, `bibtex`, `perl`, `latexmk` in system PATH |
| **Design System & Theme (Scholarly Atelier)** | [`src/context/ThemeContext.tsx`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/context/ThemeContext.tsx)<br>[`tailwind.config.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/tailwind.config.ts)<br>[`brand_assets/BRAND_GUIDELINES.md`](file:///c:/Users/sahgy/Downloads/overleaf-copy/brand_assets/BRAND_GUIDELINES.md) | Dark/Light mode tokens (`scholarly`, `surface-dark`, etc.) |
| **Document Title Extraction & PDF Filename** | [`src/utils/latexTitle.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/src/utils/latexTitle.ts)<br>[`server/latexTitle.ts`](file:///c:/Users/sahgy/Downloads/overleaf-copy/server/latexTitle.ts) | Extracts `\title{...}` for dynamic PDF download names |

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
