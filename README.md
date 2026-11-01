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

---

## Why Oberleaf?

Overleaf's free tier stops a compile after a fixed time limit. Large documents with long bibliographies, high-resolution figures or heavy TikZ/PGFPlots can hit that limit and fail.

Oberleaf compiles with the TeX distribution installed on your machine:

- **Local compiles.** A recompile while writing takes about 1.3 to 1.8 seconds for the bundled templates on a 2021 laptop CPU; a build from an empty cache takes 2 to 3 seconds. See [Measured performance](#measured-performance).
- **Your time limit, not ours.** A compile is stopped after 10 minutes by default so a stuck TeX process cannot hang the app. Set `OVERLEAF_COPY_COMPILE_TIMEOUT_MS` to change it, or to `0` to disable the limit.
- **Live equation preview.** KaTeX renders the formula under your cursor as you type, a few milliseconds of work per keystroke.
- **Documents stay on disk.** Projects are stored and compiled locally. The network is used only for the things listed under [Network & Privacy](#network-and-privacy).

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
- **Error explanations:** common TeX errors (undefined commands, missing `$`, unbalanced braces, missing packages, option clashes, locked output files, fontspec under pdfLaTeX, and others) are shown with a plain-English explanation, and some offer a one-click fix. Errors outside that set show the raw TeX message.
- **PDF night filter:** inverts the PDF canvas for dark mode without changing the exported PDF.
- **TeX Diagnostics:** checks for Node.js, pdflatex, latexmk (and Perl), xelatex and biber; whether MiKTeX installs missing packages silently; whether microtype font expansion works; and whether two TeX distributions are on PATH. Two MiKTeX problems (silent install off, stale font maps) can be repaired from the dialog. For the rest it shows the command to run.

---

## Quickstart

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
| Shortly after launch | Check for a newer version | GitHub API (`api.github.com`) |
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
├── docs/                    # Benchmark report
├── scripts/                 # Installer, launcher, benchmark, probe generator
├── server/                  # Local Node.js / Express compile server
│   ├── compiler.ts          # latexmk/pdflatex runner, log parser, error explanations
│   ├── doctor.ts            # TeX Diagnostics checks and repairs
│   └── projects.ts          # Project storage and templates
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

```bash
npm run typecheck   # TypeScript check
npm run bench       # Measure compile and preview performance on your machine
```

---

## License

Distributed under the **MIT License**.
