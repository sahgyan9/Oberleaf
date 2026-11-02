# Oberleaf

<p align="center">
  <img src="assets/icon.svg" width="128" height="128" alt="Oberleaf Logo" />
</p>

<p align="center">
  <b>A local-first LaTeX editor with live equation preview, side-by-side PDF rendering, and compiles that run on your own CPU.</b>
</p>

<p align="center">
  <a href="#why-oberleaf">Why Oberleaf</a> •
  <a href="#measured-performance">Performance</a> •
  <a href="#features">Features</a> •
  <a href="#quickstart">Quickstart</a> •
  <a href="#network-and-privacy">Network &amp; Privacy</a> •
  <a href="#architecture">Architecture</a>
</p>

<p align="center">
  <b>Windows 10/11 installer:</b> <a href="https://friendly-learning-srmap.vercel.app/oberleaf">friendly-learning-srmap.vercel.app/oberleaf</a>
  &nbsp;·&nbsp; <a href="LICENSE">MIT License</a>
</p>

> Oberleaf is an independent open-source project. It is not affiliated with, endorsed by or connected to Overleaf or Digital Science.

---

## Why Oberleaf?

Cloud LaTeX editors run every compile on their servers, so free plans have to ration them. On Overleaf's free plan that shows up as a compile limit ("You've reached the compile limit on your current plan") and as a time limit per compile, which long bibliographies, high-resolution figures or heavy TikZ/PGFPlots can exceed. Both are a reasonable way to pay for shared servers. They are also a bad surprise the night before a deadline.

Your laptop already has a CPU that can compile LaTeX. Oberleaf uses it:

- **No compile quota.** Compiles run on your machine, so there is no count to run out of. A recompile while writing takes about 1.3 to 1.8 seconds for the bundled templates on a 2021 laptop CPU; a build from an empty cache takes 2 to 3 seconds. See [Measured performance](#measured-performance).
- **Your time limit, not ours.** A compile is stopped after 10 minutes by default so a stuck TeX process cannot hang the app. Set `OVERLEAF_COPY_COMPILE_TIMEOUT_MS` to change it, or to `0` to disable the limit.
- **Live equation preview.** KaTeX renders the formula under your cursor as you type, a few milliseconds of work per keystroke.
- **Errors you can act on.** 52 common TeX mistakes are explained in plain English, and 27 of them have a one-click fix. See [Features](#features).
- **Works offline.** Writing and compiling need no internet connection once the TeX packages a document uses are installed.
- **Documents stay on disk.** Unpublished results and work under NDA are never uploaded. The network is used only for the things listed under [Network & Privacy](#network-and-privacy).

---

## Measured performance

Numbers come from `npm run bench` ([scripts/benchmark.ts](scripts/benchmark.ts)), which compiles every bundled template through the same code path as the Recompile button. The full report, including the environment, is in [docs/BENCHMARKS.md](docs/BENCHMARKS.md).

Measured on an Intel Core i7-1165G7, 16 GB RAM, Windows 10, MiKTeX 26.5 with latexmk, 5 runs each:

| Template | Recompile after an edit (median) | Build from empty cache (median) |
| :--- | ---: | ---: |
| Blank document | 1.3 s | 2.0 s |
| CV | 1.5 s | 2.5 s |
| IEEE conference paper | 1.8 s | 2.7 s |
| Thesis | 1.7 s | 2.9 s |

Equation preview, per keystroke (math detection over the whole buffer plus KaTeX render, excluding the browser's paint):

| Document size | Median | p95 |
| :--- | ---: | ---: |
| 10 pages (29 KB) | 0.8 ms | 1.8 ms |
| 100 pages (293 KB) | 1.8 ms | 2.9 ms |
| 500 pages (1.4 MB) | 4.4 ms | 7.0 ms |

Your numbers will differ with CPU, TeX distribution, antivirus scanning and document content. The first compile on a fresh MiKTeX install also downloads packages, which the benchmark excludes. Run `npm run bench` to measure your own machine, or `npm run bench -- --write` to update the report.

---

## Features

- **Side-by-side split view:** Monaco code editor on the left, PDF viewer on the right, resizable divider.
- **Three view modes:** split, code only and PDF only.
- **Live equation preview:** a floating KaTeX card for inline (`$...$`), `\[...\]` and display environments (`equation`, `align`, `gather`, `multline` and their starred forms) at the cursor.
- **Authoring tools:**
  - **Insert Image:** pick an uploaded figure, set width, caption and label.
  - **Insert Table:** grid-size picker with header and border options.
  - **Project templates:** Blank Document, CV, IEEE Conference Paper and Master's/PhD Thesis.
  - **File upload:** drag and drop `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.pdf`, `.bib`, `.tex`, `.sty`, `.cls` and `.txt` files into the file tree.
- **Auto-save:** edits are saved 800 ms after you stop typing, and any pending save is flushed before each compile.
- **Error explanations:** 52 common LaTeX and BibTeX mistakes, drawn from Overleaf's error guide and l2tabu, are explained in plain English. 27 of them come with a one-click fix you can preview first: a typo correction such as `\textbff` to `\textbf`, the missing package, an escaped `&`, a matching `\end{...}`, or a unit for `width=0.5`. Each one is a test case compiled with real TeX, with logs recorded on both MiKTeX and TeX Live; [docs/ERROR_COVERAGE.md](docs/ERROR_COVERAGE.md) lists them. Errors outside that list show the raw TeX message with a generic hint.
- **Document outline:** a section tree in the sidebar. Click a heading to jump to it, or drag a section to move it and everything under it.
- **SyncTeX:** `Ctrl + Alt + J` jumps from the cursor to the matching place in the PDF, and double-clicking the PDF jumps back to the source.
- **Citations and references:** autocomplete for `\cite`, `\ref`, `\eqref` and `\includegraphics`, and an Insert Citation dialog that lists the project's bibliography and can add a new BibTeX entry.
- **Review comments:** press `Alt + M` on a line or selection to start a comment thread anchored to it. Threads can be replied to and resolved, and are stored in the project folder.
- **History and GitHub sync:** each project is a Git repository. Commit with a message, mark milestones, compare any version in a side-by-side diff, and push to or pull from a GitHub remote.
- **Live collaboration:** share a project over the local network or through a temporary public link, and edit it together with live cursors. See [Network & Privacy](#network-and-privacy) for what this sends where.
- **Export:** download the compiled PDF, named after the document's `\title`, or the whole project as a `.zip`.
- **PDF night filter:** inverts the PDF canvas for dark mode without changing the exported PDF.
- **TeX Diagnostics, Installation tab:** checks for Node.js, pdflatex, xelatex and biber. It tells apart latexmk being missing from latexmk being installed without Perl. It also checks whether MiKTeX installs missing packages silently, whether microtype font expansion works, whether two TeX distributions are on PATH, whether Ghostscript is there for `.eps` figures, and whether the projects folder is inside OneDrive (sync locks files during compiles) or low on disk space. Two MiKTeX problems (silent install off, stale font maps) can be repaired from the dialog; for the rest it shows the command to run. Checks that could not run are listed as "Not checked", never as working.
- **TeX Diagnostics, Document tab:** checks the open `.tex` file for mistakes that compile but print wrong, based on l2tabu and ChkTeX:
  - `$$`, `{\bf ...}`-style font commands, `eqnarray`, `\over` and obsolete packages
  - a missing `~` before `\ref` / `\cite`, `...` instead of `\dots`, and straight `"quotes"`
  - `\label` before `\caption`, and `center` inside a float
  - duplicate labels, and `\ref` / `\cite` keys that point nowhere (with the near-miss suggested)
  - images missing from the project

  Most come with a fix that shows the line before and after, and Ctrl+Z undoes it. Math, verbatim, comments and the preamble are left out of the text rules, and the rules are tested in [tests/latexLint.test.ts](tests/latexLint.test.ts).

---

## Quickstart

### Platform support
- **Windows 10/11:** supported, with a setup wizard from the [download page](https://friendly-learning-srmap.vercel.app/oberleaf).
- **macOS and Linux:** running from source with `npm start` is expected to work but is untested, and there is no installer yet. Reports are welcome.

### Prerequisites
- [Node.js](https://nodejs.org/) 18 or later
- A LaTeX distribution: **MiKTeX** or **TeX Live**

On Windows, MiKTeX can be installed with:
```powershell
winget install MiKTeX.MiKTeX
```
TeX Diagnostics checks the installation on first launch.

### Install and run

1. Clone the repository:
   ```bash
   git clone https://github.com/sahgyan9/Oberleaf.git
   cd Oberleaf
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the app:
   ```bash
   npm start
   ```
   The editor opens at `http://localhost:5173`; the local compile server runs on port `3001`.

---

## Windows Integration

- **Setup wizard:** choose the install location and whether to add Desktop and Start Menu shortcuts.
- **Start Menu search:** press the Windows key and type `oberleaf`.
- **Projects folder:** projects live in `Documents\Oberleaf Projects` (or the local `projects/` folder). **Reveal in File Explorer** is available from the Dashboard, File Tree and Status Bar.
- **Status Bar:** shows the local server (`:3001`), compiler status, active file path and diagnostic health.
- **Uninstall:** registered in **Settings > Apps > Installed apps**. The uninstaller leaves your documents in place.
- **Download page:** hosted at [friendly-learning-srmap.vercel.app/oberleaf](https://friendly-learning-srmap.vercel.app/oberleaf).

---

## Network and Privacy

Projects are stored and compiled on your machine. Oberleaf makes these network requests:

| When | What | Destination |
| :--- | :--- | :--- |
| Every launch | UI fonts | Google Fonts (`fonts.googleapis.com`) |
| Shortly after launch | Check for a newer version (`git fetch` of `main`; an update is only offered, and only applied, as a fast-forward that cannot discard local commits or edits) | GitHub (`github.com`) |
| First compile that needs a missing package (MiKTeX) | Package download | MiKTeX package repositories |
| Only when you start collaboration | Peer discovery; edits then travel peer-to-peer | Public y-webrtc signaling servers |
| Only when you start a share tunnel | Expose the local app at a public URL | Cloudflare (`cloudflared`) |

No document content is sent anywhere unless you start collaboration or a share tunnel.

---

## Design Principles

1. **Visible state:** the compile button shows a timer during the build, and the result shows its duration and a success or warning badge.
2. **Errors in plain language:** recognised TeX errors are explained in English with a suggested fix, and missing packages come with install advice.
3. **Natural mapping:** source on the left, rendered output on the right.
4. **Safety:** edits auto-save, and compiles always run on the saved file.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Enter` (or `Cmd + Enter`) | Recompile |
| `Ctrl + 7` (or `Cmd + 7`) | Code only |
| `Ctrl + 8` (or `Cmd + 8`) | Split view |
| `Ctrl + 9` (or `Cmd + 9`) | PDF only (repeated presses cycle through all three views) |
| `Ctrl + B` (or `Cmd + B`) | Bold (`\textbf`) in the editor; toggles the file tree sidebar elsewhere |
| `Ctrl + I` (or `Cmd + I`) | Italic (`\textit`) in the editor |
| `Ctrl + S` (or `Cmd + S`) | Save active file |
| `Ctrl + Alt + J` | SyncTeX forward search (cursor to PDF) |

---

## Architecture

```
Oberleaf/
├── assets/                  # SVG and ICO logos
├── docs/                    # Benchmark and error-coverage reports
├── scripts/                 # Installer, launcher, benchmark, probe generator
├── server/                  # Local Node.js / Express compile server
│   ├── compiler.ts          # latexmk/pdflatex runner, log parser, error explanations
│   ├── doctor.ts            # TeX Diagnostics checks and repairs
│   ├── texKnowledge.ts      # Package/command tables the error rules look up
│   └── projects.ts          # Project storage and templates
├── tests/                   # Error corpus, recorded TeX logs, unit tests
├── src/                     # React 18 + Vite + Tailwind CSS frontend
│   ├── components/
│   │   ├── Editor/          # Monaco editor integration
│   │   ├── EditorToolbar/   # Formatting and insert actions
│   │   ├── EquationPreview/ # Live KaTeX preview card
│   │   ├── PDFViewer/       # PDF viewer with zoom and night filter
│   │   └── Modals/          # Image and table insert dialogs
│   └── context/             # Light/dark theme provider
└── README.md
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for details. Oberleaf runs locally only; there is no hosted or cloud version.

---

## Contributing

Issues and pull requests are welcome.

The most useful contribution needs no code: a LaTeX error that Oberleaf explained badly or not at all. Open an issue with the smallest document that produces it. It becomes a case in the [error corpus](docs/ERROR_COVERAGE.md) before a rule is written for it: compiled once with real TeX, its log is saved and every test run checks the rule against that log.

```bash
npm run typecheck   # TypeScript check
npm test            # Error corpus (recorded logs) and unit tests, no TeX needed
npm run test:live   # Same corpus, compiled with your installed TeX
npm run test:record # Re-record the corpus logs and regenerate docs/ERROR_COVERAGE.md
npm run bench       # Measure compile and preview performance on your machine
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the typecheck, the tests and the production build on Windows and Ubuntu for every push and pull request. The tests check every error case against logs recorded with both MiKTeX and TeX Live. A second job recompiles the corpus with the current TeX Live image and uploads fresh logs. It is not a required check: it exists to catch a newer TeX Live wording a message differently.

---

## Acknowledgements

Most of the error corpus is drawn from Overleaf's guide to common LaTeX errors and from l2tabu. The editor is [Monaco](https://microsoft.github.io/monaco-editor/), equations are rendered with [KaTeX](https://katex.org/), PDFs with [PDF.js](https://mozilla.github.io/pdf.js/), and collaboration uses [Yjs](https://yjs.dev/).

---

## License

Distributed under the [MIT License](LICENSE). "Overleaf" is a trademark of its owner and is used here only to describe what Oberleaf is an alternative to.
