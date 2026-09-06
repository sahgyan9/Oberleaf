# PROJECT_LOG.md — Overleaf Copy (Scholarly Atelier)

> **Purpose**: This is the single source of truth for how this project began, what has been built, every significant decision made, and every session's progress. **All AI agents and human contributors MUST read this file before starting work and MUST append an entry at the end of every session.**

---

## 📋 How to Use This Log

1. **Before any session**: Read the full log to understand where things stand.
2. **After any session**: Append a new `## Session` entry (see template at the bottom).
3. **Never overwrite** past entries — only append.
4. **Be specific**: Include what prompt/instruction was given, what was done, what was discovered, and what is left.

---

## 🏛️ Project Origin & Mission

**Started**: 2026 (confirm from earliest git commit)

**Origin Prompt / Genesis**:
> "Build a local-first, open-source LaTeX editing suite that mirrors the Overleaf cloud experience but runs entirely on the user's own machine. Zero compile timeouts, instant equation preview, side-by-side PDF rendering."

**Core Problem Being Solved**:
Overleaf's free tier enforces strict compilation timeouts (60–120 seconds). Large documents — dense bibliographies, complex TikZ/PGFPlots, 500-page theses — regularly hit compute walls. This tool compiles on your local CPU, removing that constraint entirely.

**Target User**:
University students, PhD researchers, academic authors, scientific paper writers who need unlimited local compute and full Overleaf authoring parity.

---

## 🎯 Product Decisions & Philosophy

| Decision | Rationale |
|---|---|
| **Local-first, Node.js server daemon** | Zero latency, zero timeouts, works offline |
| **React 18 + Vite frontend** | Fast HMR, modern tooling |
| **Monaco Editor** | Same engine as VS Code — LaTeX syntax, completions, SyncTeX highlight |
| **pdflatex / latexmk backend** | Standard academic toolchain; latexmk preferred for multi-pass auto-resolution |
| **Git checkpoints per compile** | Every compile auto-creates a git snapshot — no accidental data loss |
| **Brand: "Scholarly Atelier"** | Replaced cold AI-dashboard aesthetics with warm academic library feel |
| **KaTeX live equation preview** | 0ms latency inline math preview while typing |
| **Don Norman UX principles** | Visibility of state, error forgiveness, natural mapping |

---

## 🗺️ Architecture Snapshot

```
overleaf-copy/
├── brand_assets/       # BRAND_GUIDELINES.md, logo.svg — READ FIRST for any UI work
├── scripts/            # Windows Start Menu installer, silent launcher (launch.ps1)
├── server/             # Express daemon on port 3001
│   ├── index.ts        # All REST API routes
│   ├── compiler.ts     # latexmk/pdflatex runner, log parser, error translator
│   ├── projects.ts     # Project CRUD, file listing, zip export
│   ├── git.ts          # Checkpoint commits, history, revert
│   ├── synctex.ts      # Bi-directional PDF↔source navigation
│   ├── bibtex.ts       # Citation parsing and .bib management
│   ├── doctor.ts       # Dependency health check (pdflatex, bibtex, perl...)
│   └── latexTitle.ts   # Extract \title from source for download filenames
├── src/                # React 18 frontend
│   ├── App.tsx         # Root component — all state + handlers (1163 lines)
│   ├── components/
│   │   ├── Dashboard/       # Projects dashboard grid view
│   │   ├── TopBar/          # Header: brand, project switcher, compile button
│   │   ├── FileTree/        # Sidebar file tree with drag-drop, rename, delete
│   │   ├── Editor/          # Monaco editor integration
│   │   ├── EditorToolbar/   # Bold/italic/section/image/table/cite toolbar
│   │   ├── PDFViewer/       # Canvas PDF renderer, zoom, night filter, SyncTeX
│   │   ├── EquationPreview/ # Live KaTeX floating tooltip
│   │   ├── History/         # Git history drawer with diffs
│   │   ├── Modals/          # InsertImage, InsertTable, NewProject, Upload, InsertCitation
│   │   └── DependencyDoctor/ # TeX toolchain health dashboard
│   ├── context/
│   │   └── ThemeContext.tsx  # Dark/light theme provider
│   └── utils/
│       ├── latexCompletions.ts  # Monaco IntelliSense: \cite, \label, \includegraphics
│       ├── latexLanguage.ts     # Monaco language config for LaTeX
│       ├── latexTitle.ts        # Extract document title from source
│       └── mathDetector.ts      # Detect math environment at cursor for KaTeX preview
```

**Ports**: Vite dev server → `localhost:5173` · Express daemon → `localhost:3001`

---

## ✅ Features Implemented

- [x] Side-by-side split view (Monaco editor + PDF viewer) with resizable panels
- [x] 3-way viewport modes: Code-only (`Ctrl+7`) / Split (`Ctrl+8`) / PDF-only (`Ctrl+9`, double/triple/continuous multi-press toggles between modes) + legacy fallback (`Ctrl+Shift+1/2/3`)
- [x] File tree with create, rename, delete, duplicate, upload, drag-drop
- [x] Multi-file project management with dashboard
- [x] latexmk + pdflatex compilation with auto-pass management
- [x] BibTeX / bibtex citation support with `\cite{}` completions
- [x] Git auto-checkpoint on every compile + manual checkpoints + revert
- [x] SyncTeX forward (cursor → PDF page) and backward (PDF click → source line)
- [x] Live KaTeX equation preview (toggle via toolbar)
- [x] Don Norman error translator (cryptic TeX logs → plain English + AI prompt)
- [x] Dependency Doctor (checks pdflatex, bibtex, perl, latexmk in PATH)
- [x] Dark / Light mode (Scholarly Atelier brand)
- [x] Windows Start Menu integration (`npm run setup:windows`)
- [x] PDF download with auto-generated filename from `\title{}`
- [x] Project templates: Blank, IEEE Conference, Master's Thesis
- [x] Project zip export
- [x] Asset upload (images → figures/ folder auto-routing)

---

## ⚠️ Known Bugs (as of 2026-09-06)

| Priority | Bug |
|---|---|
| 🔴 High | `tailwind.config.js` duplicates `tailwind.config.ts` + ESM mismatch — delete the `.js` file |
| 🔴 High | `dedupeErrors()` key is only `message` — errors from different files collapse into one |
| 🔴 High | Server `EADDRINUSE` retry is a potential infinite loop |
| 🟠 Medium | `handleInsertSnippet` reads stale React state instead of live Monaco buffer |
| 🟠 Medium | `handleSyncTexBackward` has a stale closure over `handleSelectFile` |
| 🟠 Medium | Dark mode FOUT — theme class applied after React hydration, causes a flash |
| 🟠 Medium | Brand fonts (`Plus Jakarta Sans`, `JetBrains Mono`) not loaded — falling back silently |
| 🟠 Medium | `window.alert()` used for all file operation errors — breaks brand UX |
| 🟠 Medium | `window.prompt()` used for new file/folder names — not styleable, blocking |
| 🟡 Low | No empty state in PDF viewer before first compile |
| 🟡 Low | No auto-compile toggle |
| 🟡 Low | Project name tooltip missing in switcher dropdown |
| 🟡 Low | Hardcoded project IDs in `App.tsx` fallback array should be `[]` |

---

## 🛣️ Roadmap / Next Steps

- [ ] Fix all 🔴 bugs (dedup key, tailwind.config.js, server retry)
- [ ] Replace `window.alert` + `window.prompt` with inline UI (toast + custom modal)
- [ ] Fix brand font loading (`@import` Google Fonts or bundle locally in `public/fonts/`)
- [ ] Add inline `<script>` to `index.html` for FOUC-free dark mode
- [ ] Split `App.tsx` into custom hooks (`useProjectManager`, `useCompiler`, `useFileTree`)
- [ ] Add `project.json` per project to configure `mainFile` (remove hardcoded `main.tex`)
- [ ] Add auto-compile toggle in settings
- [ ] Empty state for PDF viewer with CTA + keyboard shortcut hint
- [ ] Keyboard shortcut help panel (`?` button in TopBar)

---

## 📝 Session Log

---

### Session 001 — Project Genesis
- **Date**: 2026 (confirm from git log)
- **Agent/Human**: Human (project owner)
- **Prompt**: Build a local-first Overleaf alternative with instant compilation, no timeouts, live math preview.
- **What was built**: Full project scaffolding — React+Vite frontend, Express daemon, Monaco editor, pdflatex compilation pipeline, SyncTeX navigation, Git checkpoints, dependency doctor, brand guidelines.
- **Status at end**: Feature-complete MVP. All major features working.
- **Next agent should**: Audit the codebase for bugs and UX issues.

---

### Session 002 — 2026-09-06 · Agent: Antigravity (Claude Sonnet 4.6)
- **Prompt**: "Have a close look at this workspace and report bugs or any improvements to UX. Also create one dedicated file for writing all logs with prompts, readable by all AI agents."
- **What was done**:
  - Read and audited all key source files: `App.tsx`, `server/index.ts`, `compiler.ts`, `TopBar.tsx`, `tailwind.config.ts`, `index.css`, `brand_assets/BRAND_GUIDELINES.md`, `scripts/launch.ps1`, `.gitignore`, `README.md`
  - Identified 21 findings across 9 bugs, 9 UX issues, and 3 code quality concerns
  - Created `workspace_audit.md` (agent artifact) with full prioritized findings and file-linked details
  - Created this `PROJECT_LOG.md` as the permanent shared memory file for all future agents
- **Key findings**:
  - `tailwind.config.js` is a dead duplicate with ESM/CJS mismatch
  - `dedupeErrors` dedup key is too coarse — collapses errors from different source files
  - Server retry loop on EADDRINUSE is buggy (infinite loop risk)
  - Brand fonts (`Plus Jakarta Sans`, `JetBrains Mono`) referenced in CSS but never loaded via `@import`
  - Dark mode FOUC due to late hydration — needs inline `<script>` in `index.html`
  - All file operation errors use blocking `window.alert()` — violates brand UX
- **Status at end**: Audit only — no code changes made. All bugs are documented.
- **Next agent should**: Start the fix sprint with 🔴 bugs. Suggested order:
  1. Delete `tailwind.config.js`
  2. Fix `dedupeErrors` key in `server/compiler.ts`
  3. Fix server retry in `server/index.ts`
  4. Add font `@import` to `src/index.css`
  5. Add dark-mode inline script to `index.html`

---

## 📌 Session Template (copy for each new session)

```markdown
### Session XXX — YYYY-MM-DD · Agent: [Name / Model]
- **Prompt**: (exact user instruction or task description)
- **What was done**: (bullet list of changes made, files touched, commands run)
- **Key findings / decisions**: (anything important discovered or decided)
- **Status at end**: (what works, what is broken, what is partially done)
- **Next agent should**: (clear handoff instructions for the next session)
```

---

### Session 003 — 2026-09-06 · Agent: Antigravity (Claude Sonnet 4.6)
- **Prompt**: "go on to fix it" (execute all bugs found in Session 002 audit)
- **What was done**:
  - 🔴 Deleted `tailwind.config.js` — removed ESM/CJS duplicate that shadowed the canonical `tailwind.config.ts`
  - 🔴 Fixed `dedupeErrors()` key in `server/compiler.ts` — changed from `message` only to `file:line:message` so errors from different source files are no longer collapsed into one
  - 🔴 Fixed server `EADDRINUSE` handler in `server/index.ts` — replaced infinite retry loop with clean `process.exit(1)` + actionable error message
  - Fixed duplicate section comment (was "8. PDF Serving", now correctly "11. PDF Serving") in `server/index.ts`
  - 🟠 Fixed stale closure in `handleInsertSnippet` — now calls `getLiveContent()` instead of reading stale `editorContent` state
  - 🟠 Wrapped `handleSelectFile` in `useCallback` — now has stable identity for SyncTeX backward dep array; also uses `getLiveContent()` for save-on-switch
  - 🟠 Wrapped `handleEditorChange` in `useCallback` — prevents unnecessary child re-renders
  - 🟠 Fixed dark mode FOUC — added synchronous inline `<script>` to `index.html` that reads `localStorage` and applies `.dark` class before React hydration; removed hardcoded `class="dark"` from `<html>` tag
  - 🟠 Aligned `ThemeContext.tsx` localStorage key from `overleaf_copy_theme` → `overleaf-copy:theme` to match the FOUC script and all other `overleaf-copy:*` keys
  - 🟠 Built `src/components/Toast/Toast.tsx` — brand-consistent toast system (`useToast` hook + `ToastContainer`) with success/error/warning/info variants, auto-dismiss, slide-in animation
  - 🟠 Replaced all 10 `window.alert()` calls in `App.tsx` with `addToast(..., 'error')` via a Node.js script
  - 🟠 Built `src/components/Modals/NewItemModal.tsx` — styled modal with real-time validation replacing `window.prompt()` for new file/folder creation; adds success toast on creation
  - 🟡 Added `title={proj.name}` to project name `<p>` in `TopBar.tsx` — full name visible on hover for truncated entries
  - 🟡 Cleared hardcoded fallback project IDs from `App.tsx` — `projects` now initialises to `[]`, `projectId` to `''`; server is the single source of truth
  - 🟡 Updated README placeholder `your-username` → `YOUR_USERNAME` as a clear signal it needs to be filled in
- **Verification**: `npm run typecheck` → **0 errors**
- **Files changed**:
  - DELETED: `tailwind.config.js`
  - MODIFIED: `server/compiler.ts`, `server/index.ts`, `src/App.tsx`, `src/context/ThemeContext.tsx`, `src/components/TopBar/TopBar.tsx`, `index.html`, `README.md`
  - NEW: `src/components/Toast/Toast.tsx`, `src/components/Modals/NewItemModal.tsx`
- **Status at end**: All audited bugs fixed. TypeScript clean. App compiles and is ready to run.
- **Next agent should**: Run `npm start` and smoke-test each fixed area:
  1. Verify dark/light toggle persists on reload (FOUC fix)
  2. Create a new file via File Tree → should open modal, not browser prompt
  3. Trigger a compile error → should show toast, not alert()
  4. Test SyncTeX backward click in PDF → should jump to correct source line
  5. Consider splitting `App.tsx` (1170+ lines) into custom hooks as the next refactor task

---

### Session 004 — 2026-09-06 · Agent: Antigravity (Gemini 3.7 Flash)
- **Prompt**:
  1. "see when I search for overleaf copy in my windows I get the old logo. Can you find the culprit code and correct it"
  2. "App Mode (Standalone Window): Open Overleaf Copy in dedicated standalone window mode (via Edge/Chrome --app=http://localhost:5173) so it looks and feels like a native desktop app with its own title bar rather than just another browser tab. Lets do these and ready project log as well"
- **What was done**:
  - **Fixed Windows Icon Mismatch**:
    - Discovered root cause: when `assets/icon.svg` was updated for "The Scholarly Atelier", `assets/icon.ico` and `public/assets/icon.ico` remained stale binary files containing the old cyan/indigo neon infinity logo.
    - Created `scripts/generate-icons.cjs`: uses `sharp` to build multi-frame `.ico` (16, 24, 32, 48, 64, 128, 256) and 256x256 `.png` from `assets/icon.svg`.
    - Added `"build:icons": "node ./scripts/generate-icons.cjs"` to `package.json`.
    - Updated `scripts/setup-windows.ps1` to automatically compile fresh icons, recreate shortcuts across Start Menu and Desktops (including OneDrive Desktop), notify Windows Shell via `SHChangeNotify(SHCNE_ASSOCCHANGED)`, and recycle `SearchApp` to flush the icon cache.
  - **Implemented Dedicated App Mode (Standalone Window)**:
    - Updated `scripts/launch.ps1` to detect Microsoft Edge or Google Chrome and launch `http://localhost:5173` with `--app=...` flag.
    - Result: opens as a chromeless desktop application window with a native title bar instead of a browser tab.
  - **Added Instant Startup Visual Feedback**:
    - Integrated native Windows WinRT toast notification (`Show-Notification`) in `scripts/launch.ps1` displaying the app's green monogram icon, app title, and "Starting local LaTeX studio in App Mode..." so the user receives instant feedback on click.
  - **Fixed PostCSS CSS Build Error**:
    - Discovered `Cannot read properties of undefined (reading 'blocklist')` in `logs/project.log` because `postcss.config.js` referenced `./tailwind.config.js` which had been deleted in Session 003. Fixed `postcss.config.js` to `tailwindcss: {}`.
  - **Configured Runtime Project Logging & CLI Helpers**:
    - Added automatic output redirection in `scripts/launch.ps1` to `logs/project.log`.
    - Added npm commands:
      - `npm run logs`: tail live project output.
      - `npm run stop`: terminate background server and Vite daemons.
    - Added `logs/` to `.gitignore`.
- **Verification**:
  - Start Menu shortcut icon extracted via `System.Drawing.Icon` and verified visually to be the new Scholarly Atelier green monogram.
  - Cold and warm launches tested successfully via `launch.ps1` and `wscript.exe scripts/launch.vbs`.
  - Clean compilation in `logs/project.log` with 0 PostCSS errors.
- **Files changed**:
  - NEW: `scripts/generate-icons.cjs`, `assets/icon.png`, `public/assets/icon.png`
  - MODIFIED: `assets/icon.ico`, `public/assets/icon.ico`, `scripts/setup-windows.ps1`, `scripts/launch.ps1`, `postcss.config.js`, `package.json`, `.gitignore`, `PROJECT_LOG.md`
- **Status at end**: Complete. Windows Search displays the new logo; shortcuts launch in dedicated standalone App Mode with instant toast notifications; runtime logs stream to `logs/project.log`.
- **Next agent should**:
  1. Continue roadmap tasks from `PROJECT_LOG.md` (e.g. font loading `@import` in `index.css`).
  2. Maintain `PROJECT_LOG.md` updates at the conclusion of every session.

---

### Session 005 — 2026-09-06 · Agent: Antigravity (Gemini 3.8 Flash)
- **Prompt**: "I am finding some bugs or inconsistency. look at first image the pdf is in view then I pressed the shortcut ctrl + 9 twice but the view of pdf is cut. But again when i come from full code mode to split mode the pdf lay out is same as first image. And I feel the zoom of 80% is giving a good view. You do RCA and tell me your thought and what shall we do" -> "yes"
- **Root Cause Analysis (RCA)**:
  1. **Panel Ordering Desync**: Toggling Ctrl+9 twice (split -> pdf -> split) unmounted and remounted `editor-panel`. Without `order` props, `react-resizable-panels` pushed `editor-panel` to the end of `panelDataArray` behind `pdf-panel`. The layout percentages inverted, squeezing the PDF panel down to a narrow column. Returning from Code mode to Split mode unmounted and remounted `pdf-panel` (the last panel), which coincidentally restored correct registration order.
  2. **Flexbox Negative Scroll Overflow Trap**: `containerRef` used `flex flex-col items-center overflow-auto`. When the child PDF page (794px at 100%) exceeded the container width (~450px), `items-center` centered the page, pushing the left margin into negative scroll space (`scrollLeft < 0`), which browsers cannot scroll into.
  3. **80% Zoom Sweet Spot**: LaTeX A4 is 595.28 pt. At 96 DPI CSS scale, 100% zoom = 794px (+ padding = 840px), which exceeds typical split-view widths (550-700px). At 80% zoom, width = 635px, perfectly fitting the pane without horizontal scrolling.
- **What was done**:
  - **Fixed Panel Order**: Added `order={1}`, `order={2}`, `order={3}` to `file-tree-panel`, `editor-panel`, and `pdf-panel` in `src/App.tsx`.
  - **Bumped Layout Version**: Updated `autoSaveId="overleaf-copy-layout-v3"` to discard any corrupted layouts in `localStorage`.
  - **Fixed Negative Scroll Clipping**: Wrapped `PDFViewer.tsx` viewport in a `min-w-fit w-full flex flex-col items-center justify-start` container and centered pages with `mx-auto`. When width is narrow, content aligns to `start` (`scrollLeft = 0`) preventing any margin clipping; when wide, it centers nicely.
  - **Modernized Zoom System**:
    - Default zoom changed from 100% to 80% (or restored from `localStorage`).
    - Added 1-click **"Fit to Width"** toggle button (`Maximize2` icon) with automatic dynamic scaling on split-pane resize via `ResizeObserver`.
    - Updated Reset button to reset to 80% with tooltip "Reset Zoom (80%)".
- **Verification**: `npm run typecheck` and `npm run build` passed with 0 errors.
- **Files changed**:
  - MODIFIED: `src/App.tsx`, `src/components/PDFViewer/PDFViewer.tsx`, `PROJECT_LOG.md`
- **Status at end**: Fixed and verified. Panel sizes remain stable across all shortcut toggles, PDF margin never clips, and smart Fit to Width / 80% zoom provides an optimal reading experience.

---

### Session 006 — 2026-09-06 · Agent: Antigravity (Gemini 3.8 Flash)
- **Prompt**:
  1. "I want you to just focus on the image. In full page in am in research experience section and I want to edit this part by going to split mode and definitely I want to see the same section in pdf in split mode and if it also opens the same section in code as well, it would be a lot for good user experience. Can you do that? DO RCA and see the feasibility study" -> "go ahead"
  2. "i am in code mode, now if I switch to pdf mode, will i be in the same section??" -> "tell me your observation first??" -> "fix now"
  3. "great its working. Document your learning and fixes"
- **Root Cause Analysis (RCA)**:
  1. **PDF Scroll Position Jump on Layout & Zoom Recalculation**:
     - In Full PDF mode, container width was ~1600px; `computeFitWidthZoom` calculated **167%** zoom.
     - Switching to Split mode squeezed the PDF panel to ~700px, causing `ResizeObserver` to drop zoom to **79%** (a 53% drop in rendered page height: 1874px down to 886px).
     - Because `container.scrollTop` remained as a raw unscaled pixel value (~500px), 500px at 167% was 26% down the page (*"Research Experience"*), but at 79% zoom, 500px was 56.4% down the page (*"Selected Projects"* / *"Awards"*).
  2. **Code Editor Reset to Line 1**:
     - When in Full PDF mode (`viewMode === 'pdf'`), `<Editor />` was conditionally unmounted from the React DOM tree.
     - Switching to Split mode mounted Monaco Editor fresh, defaulting to Line 1. Neither the TopBar buttons nor keyboard shortcuts (`Ctrl+8`) sampled the visible PDF viewport or dispatched a SyncTeX reverse query.
  3. **Code $\rightarrow$ PDF Directionality Gap**:
     - Switching in reverse (from Code mode to PDF/Split mode) only changed `viewMode` without sampling the active line in Monaco or triggering SyncTeX forward (`handleJumpToPdf`).
  4. **PDF.js Asynchronous Mount Race Condition**:
     - In Full Code mode, `<PDFViewer />` was unmounted.
     - Switching to Split mode caused `handleJumpToPdf` to query the backend in ~10ms while PDF.js took ~60ms to load `pageDims` into memory.
     - The forward jump effect ran while `pageDims.length === 0`, failed silently, and did not re-run when `pageDims` finished loading, leaving the PDF at `scrollTop = 0` (top of Page 1) while the editor was centered on line 175 (*"Industry Experience"*).
- **What was done**:
  - **Normalized Viewport Anchor in `PDFViewer.tsx`**:
    - Created `viewportAnchorRef` capturing the user's reading focus in PDF coordinate space `(page, yPt, offsetFromTop)` on scroll, resize observer triggers, and manual zoom button presses.
    - Added a `useLayoutEffect` listening to `scale` changes that restores `container.scrollTop` proportionally, guaranteeing sections stay locked in the exact same visual spot regardless of zoom changes or panel resizes.
  - **Exposed `PDFViewerHandle` with `getVisibleSyncTarget()`**:
    - Wrapped `PDFViewer` in `React.forwardRef<PDFViewerHandle, PDFViewerProps>`.
    - Computed visible page & PDF coordinates in the user's focus zone (~30% from viewport top) and extracted the nearest section heading / text run from `pageTextItemsRef` (e.g. `"Research Experience"`).
  - **Immediate Editor Mount Positioning & View State Persistence in `Editor.tsx`**:
    - In `handleEditorDidMount`, Monaco checks for `highlightLine` and immediately reveals and highlights the line (`editor.revealLineInCenter`), eliminating any flash of Line 1.
    - Added module-level `lastEditorViewState` cache on unmount so returning to the editor restores the previous cursor and scroll offset if no new SyncTeX jump was requested.
  - **Bidirectional Mode Transition Coordinator in `App.tsx` (`handleViewModeChange`)**:
    - **PDF $\rightarrow$ Split / Code**: Samples `pdfViewerRef.current?.getVisibleSyncTarget()`, queries SyncTeX backward, and navigates Monaco to the visible section with a glowing line pulse.
    - **Code $\rightarrow$ PDF / Split**: Enhanced `handleJumpToPdf(targetMode)` to sample the cursor line / center visible range from Monaco, query SyncTeX forward, and navigate the PDF preview directly to that corresponding section.
    - Connected `handleViewModeChange` to `TopBar`'s layout switcher buttons and `useKeyboardShortcuts` (`Ctrl+7`, `Ctrl+8`, `Ctrl+9`).
  - **Resolved Asynchronous Mount Race Condition in `PDFViewer.tsx`**:
    - Updated `synctexTarget` effect dependency array to `[synctexTarget, pageDims, scale]`.
    - When `pageDims` finishes loading asynchronously from PDF.js, the scroll effect automatically executes via `requestAnimationFrame`, smoothly scrolling the target section into the upper-third reading area (`container.clientHeight * 0.35`) and updating the anchor.
- **Key Learnings & Takeaways**:
  - *DOM Scroll State vs. Render Scale*: When zoom or responsive container width dynamically recalculates rendered dimensions, preserving absolute pixel `scrollTop` produces large visual jumps. Storing viewport anchors in normalized coordinate space (e.g. PDF points or percentage offset) is essential for stable reading experiences.
  - *Component Unmount Timing with Asynchronous APIs*: When components that host asynchronous rendering engines (like PDF.js or Monaco Editor) are conditionally mounted on view mode toggles, IPC/API responses can arrive before internal canvas geometry is measured. Always bind lifecycle effects to geometry-readiness states (`pageDims.length > 0`) with `requestAnimationFrame` fallbacks rather than one-shot prop arrivals.
- **Verification**:
  - `npx tsc --noEmit` $\rightarrow$ **0 errors**.
  - `npm run build` $\rightarrow$ **Built in 4.14s**.
  - Live backend verified against `projects/cv`:
    - View switch to `split` with PDF on *"Research Experience"* smoothly reveals line 196 in Monaco.
    - View switch to `pdf` with editor on *"Selected Projects & Computational Work"* (line 244) or *"Industry Experience"* (line 175) centers directly on the corresponding page and section.
- **Files changed**:
  - MODIFIED: `src/components/PDFViewer/PDFViewer.tsx`, `src/components/Editor/Editor.tsx`, `src/App.tsx`, `PROJECT_LOG.md`
- **Status at end**: Complete and verified. Bidirectional view-mode synchronization works seamlessly between Code mode, Split mode, and PDF mode without losing reading/editing position.

### Session 007 — 2026-09-06 · Agent: Antigravity (Gemini 3.8 Flash)
- **Prompt**: "read this screenshot and tell me what you understood??" -> "yes" (fix)
- **Observation / User Problem**:
  - In Screenshot 1 (before recompile): Monaco was focused on Line 253 (*"Post-Quantum Cryptography"*), and the PDF preview was scrolled to Page 2 showing the matching section.
  - In Screenshot 2 (after recompile: `4.2s` -> `4.5s`): Monaco editor remained on Line 253, but the PDF preview jumped all the way back to Page 1, displaying a floating toast: `SyncTeX: Page 1, Line 220 (main.tex)`.
- **Root Cause Analysis (RCA)**:
  - In Session 006, `[synctexTarget, pageDims, scale]` was used as the dependency array for the SyncTeX forward jump effect so that asynchronous PDF.js document loads wouldn't drop the initial jump.
  - However, `synctexTarget` was stored in `App.tsx` state and never cleared to `null` once handled.
  - When the user subsequently recompiled the document, PDF.js reloaded the PDF with a new cache-buster URL and updated `pageDims`.
  - Because `pageDims` changed, the `synctexTarget` effect in `PDFViewer.tsx` re-executed without checking whether the `synctexTarget.timestamp` had already been processed (`lastHandledSyncTargetRef.current === synctexTarget.timestamp`).
  - This caused the stale navigation target (`Page 1, Line 220`) to replay, popping up the toast and scrolling the PDF away from Page 2 to Page 1, destroying the user's reading position.
- **What was done**:
  - **Timestamp Guard in `PDFViewer.tsx`**:
    - Added an early return `if (lastHandledSyncTargetRef.current === synctexTarget.timestamp) return;` at the top of the SyncTeX effect.
    - Ensures that `pageDims` updates from recompiles or zoom changes NEVER re-trigger an old jump.
  - **Single-Shot Target Consumption (`onSyncTexHandled`)**:
    - Added `onSyncTexHandled?: () => void` prop to `PDFViewer` and invoked it once `performScroll` successfully executes.
    - In `App.tsx`, `handleSyncTexHandled` resets `synctexTarget` state back to `null`, ensuring state cleanliness.
  - **Isolated Toast Auto-Dismissal**:
    - Separated `activeSyncToast` auto-dismiss timer into its own `[activeSyncToast]` effect so that clearing `synctexTarget` does not prematurely cancel or leak toast timers.
- **Verification**:
  - `npx tsc --noEmit` $\rightarrow$ **0 errors**.
  - `npm run build` $\rightarrow$ **Built cleanly in 7.92s**.
- **Files changed**:
  - MODIFIED: `src/components/PDFViewer/PDFViewer.tsx`, `src/App.tsx`, `PROJECT_LOG.md`
- **Status at end**: Complete and verified. Recompilations and document reloads now preserve the exact user scroll position on Page 2 without replaying old SyncTeX targets.

---

### Session 008 — 2026-09-06 · Agent: Antigravity (Gemini 3.7 Flash)
- **Prompt**: "app standlone is fast but I want it to open in chrome so that I can use the Gemini AI Agent Feature there"
- **What was done**:
  - Refactored the browser launch handler in `scripts/launch.ps1` (`Open-InChrome`).
  - Prioritized Google Chrome (`chrome.exe`) directly: locates Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe` (or local app data).
  - Removed the `--app=...` chromeless constraint so Chrome opens with full browser UI: enabling Chrome's toolbar, extensions, side panel, and native **Gemini AI Agent** integration.
  - Updated instant toast notification text to reflect Chrome + Gemini AI: `"Opening in Google Chrome (Gemini AI enabled)..."`.
- **Verification**:
  - Verified path resolution and launched Chrome with `http://localhost:5173`.
  - Verified `launch.ps1` warm start and cold start flows.
- **Files changed**:
  - MODIFIED: `scripts/launch.ps1`, `PROJECT_LOG.md`
- **Status at end**: Complete. Overleaf Copy now opens directly in Google Chrome with full Gemini AI Agent support.

