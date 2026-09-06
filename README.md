# Oberleaf 🍃

<p align="center">
  <img src="assets/icon.svg" width="128" height="128" alt="Oberleaf Logo" />
</p>

<p align="center">
  <b>The open-source, local-first LaTeX suite with instant equation preview, side-by-side PDF rendering, and zero compute timeouts.</b>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quickstart">Quickstart</a> •
  <a href="#windows-integration">Windows Search</a> •
  <a href="#don-norman-ux">UX Philosophy</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## 💡 Why Oberleaf?

Overleaf's free tier imposes strict compilation timeouts (typically 60–120 seconds). Large documents with dense bibliographies, high-resolution figures, or extensive PGFPlots/TikZ environments frequently hit compute walls and freeze.

**Oberleaf** compiles directly on your local CPU:
- 🚀 **1–2 Second Compilations:** Uses your multi-core processor for near-instant builds.
- ♾️ **Unlimited Compute Time:** Zero timeout errors, compile 500-page theses or complex graphics with no limits.
- ⚡ **Instant Equation Preview:** KaTeX renders math formulas live beneath your cursor with 0ms latency as you type.
- 🔒 **100% Offline & Private:** Your research papers, formulas, and intellectual property never leave your machine.
- ☁️ **Cloud-Ready Architecture:** Clean separation of concerns allows deploying to the cloud (Docker + Supabase) whenever needed.

---

## 🎨 Brand Identity & Design System

Oberleaf is built around a distinct, modern 4-color palette designed for high legibility and eye comfort in both Light and Dark modes:

| Color | Hex | Role |
| :--- | :--- | :--- |
| **Deep Indigo** | `#2F39A9` | Brand identity, primary modal headers, deep elevation |
| **Ocean Blue** | `#2E6FA0` | Active tabs, panel borders, secondary controls |
| **Cyan Teal** | `#49A4BB` | Equation preview frame, syntax tags, line numbers |
| **Electric Mint** | `#15D8B3` | Recompile CTA, success indicators, logo aura |

---

## ✨ Features

- **Side-by-Side Split View:** Monaco code editor on the left, interactive PDF viewer on the right with resizable divider.
- **3-Way Viewport Modes:**
  - `Split View`: Default side-by-side writing and previewing.
  - `Code-Only Fullscreen`: Distraction-free editing across 100% of your monitor.
  - `PDF-Only Fullscreen`: Clean reading/presentation mode for proofreading.
- **Live Equation Preview:** Floating KaTeX tooltip detects inline (`$...$`) and display (`\begin{equation}`) math environments at your cursor.
- **Overleaf Authoring Parity:**
  - **Insert Image Modal:** Browse uploaded project figures, set width (`0.8\textwidth`), caption, and label with 1 click.
  - **Visual Table Generator:** Interactive grid selector ($M \times N$), header toggles, and border controls.
  - **Project Templates:** Pre-bundled with Blank Document, IEEE Conference Paper, and Master's Thesis.
  - **Asset Upload:** Drag & drop images (`.png`, `.jpg`, `.pdf`) directly from Windows Explorer into the file tree.
- **PDF Night Filter:** Eye-friendly canvas inversion filter for late-night reading in dark mode without altering the exported PDF.
- **Dependency Doctor:** Diagnostic screen inspired by Don Norman principles that tests your system PATH for TeX tools and gives 1-click `winget` installation commands.

---

## 🚀 Quickstart

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- A local LaTeX distribution (e.g. **MiKTeX** or **TeX Live**)

> **Don't have LaTeX installed yet?**  
> On Windows, run:
> ```powershell
> winget install MiKTeX.MiKTeX
> ```
> *(The built-in Dependency Doctor will also check this for you on first launch).*

### Installation & Launch

1. **Clone the repository** (or copy this folder to your preferred location):
   ```bash
   git clone https://github.com/sahgyan9/Oberleaf.git
   cd Oberleaf
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local suite:**
   ```bash
   npm start
   ```
   *Your browser will open to `http://localhost:5173` with the local compiler running on port `3001`.*

---

## 🪟 Windows Search Integration

You can launch **Oberleaf** directly from your Windows Start Menu just like a native desktop app:

1. In the project folder, run:
   ```powershell
   npm run setup:windows
   ```
2. Press the **Windows Key** and type:
   ```
   oberleaf
   ```
   or
   ```
   Oberleaf
   ```
3. Hit **Enter** — Oberleaf will launch in the background with its custom icon and open your browser automatically.

---

## 🧠 Don Norman UX Philosophy

1. **Immediate Visibility:** You always know the exact state of the system. The compile button displays duration timers (`1.42s`), active spinners, and clear success/warning badges.
2. **Error Forgiveness & Translation:** Cryptic LaTeX log output (e.g., `! LaTeX Error: File 'foo.sty' not found`) is translated into plain, human-friendly English with 1-click package installation advice.
3. **Natural Mapping:** Spatial layout mirrors your mental model—code edits on the left instantly reflect in the rendered document on the right.
4. **Safety & Auto-Recovery:** Code auto-saves on compilation; your work is safely persisted in the local filesystem.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Enter` (or `Cmd + Enter`) | **Recompile Document** |
| `Ctrl + 7` (or `Cmd + 7`) | **Full Code Mode** (Maximize Editor) |
| `Ctrl + 8` (or `Cmd + 8`) | **Split Mode** (Editor + PDF Preview) |
| `Ctrl + 9` (or `Cmd + 9`) | **Full PDF Mode** (Maximize Preview; double/triple/continuous press toggles between all 3 views) |
| `Ctrl + B` (or `Cmd + B`) | **Toggle Sidebar** (File Tree) |
| `Ctrl + S` (or `Cmd + S`) | **Save Active File** |
| `Ctrl + Alt + J` | **SyncTeX Forward** (Jump from cursor to PDF location) |

---

## 🏗️ Architecture

```
Oberleaf/
├── assets/                  # High-res SVG and Windows ICO logos
├── scripts/                 # Windows Start Menu installer & silent launcher
├── server/                  # Local Node.js / Express compiler daemon
│   ├── compiler.ts          # latexmk process runner & log parser
│   ├── doctor.ts            # System PATH diagnostic doctor
│   └── projects.ts          # Local project filesystem CRUD
├── src/                     # React 18 + Vite + Tailwind CSS Frontend
│   ├── components/
│   │   ├── Editor/          # Monaco editor integration
│   │   ├── EditorToolbar/   # Formatting & modal insert triggers
│   │   ├── EquationPreview/ # Live KaTeX preview card
│   │   ├── PDFViewer/       # Canvas PDF viewer with zoom & night filter
│   │   └── Modals/          # Image and Table insert generators
│   └── context/             # Dark/Light theme provider
└── README.md
```

### Future Cloud Deployment Path
The compiler and storage layers are written against decoupled interfaces (`ICompilerService`, `IStorageService`). To deploy to the cloud:
1. Host the React frontend on **Vercel**.
2. Store projects and auth using **Supabase** (Postgres + Storage buckets).
3. Deploy the TeX Live compiler container on **Railway / Fly.io / Hetzner** using Docker.

---

## 🤝 Contributing

Contributions are warmly welcomed! Please feel free to open issues, submit pull requests, or suggest new templates.

```bash
# Run typecheck
npm run typecheck
```

---

## 📄 License

Distributed under the **MIT License**. Free for personal, academic, and commercial use.
