# Missing-image check

Status: approved 2026-11-19, with chapter files checked.

## Goal

When an `\includegraphics` path names no file the compile can load, mark it in the editor while the user types. Where one project file is clearly what they meant, offer it in one action, in the editor and on the compile error card. Never mark a path that compiles.

## What exists today

Three pieces of code decide whether an image path resolves, and they disagree.

| Where | When it runs | Problem |
| :-- | :-- | :-- |
| `src/utils/latexLint.ts:490`, rule `missing-image` | Only when TeX Doctor's Document tab is open | Not visible while typing. Flags `#1` and `\figdir/plot` in definitions. Ignores `\graphicspath`. Misses `\includegraphics*`. Suggests by whole file name, so a typo without an extension gets no suggestion. |
| `server/projectFiles.ts:115`, `findMissingProjectFiles` | After a compile with errors | Server only, no suggestion. Adds up every `\graphicspath` (LaTeX keeps only the last). The file walk stops at depth 6 and lowercases paths. |
| `src/utils/imageHelper.ts:68`, `resolveProjectImage` | Image picker, when the caret enters a path | Exact path only. `{plot.png}` with the file at `figures/plot.png` compiles but counts as unresolved, so the picker opens on a valid path. |

`server/compiler.ts:1496` (Pattern 3) suggests `figures/<name>` from six fixed folders. Every subfolder is already on TEXINPUTS (`compiler.ts:1921`), so that file would have been found: Pattern 3 never fires. A missing image gets "could not be found" and no fix. Pattern 3a (EPS conversion from a subfolder, `compiler.ts:1445`) is a different case and stays.

TeX's behaviour (`tests/diagnosticCases.ts`, `missing-image`): one error, and a PDF with a placeholder box.

## Design

### 1. One resolver: `server/imagePaths.ts`

Pure: imports only `./texKnowledge.js`, no `fs` (the client imports it, as `latexLint.ts` already imports `texKnowledge`). A test asserts it has no Node imports.

```ts
export const GRAPHICS_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.eps', '.jbig2', '.mps']; // moved from projectFiles.ts
export const UNLOADABLE_IMAGE_EXTENSIONS = ['.svg', '.gif', '.webp', '.heic', '.bmp', '.tif', '.tiff'];

export type ImagePathResult =
  | { status: 'found'; path: string }                 // project-relative, original case
  | { status: 'skip' }                                // cannot be checked statically
  | { status: 'unloadable'; path: string }            // the file exists in a format pdfLaTeX cannot read
  | { status: 'missing'; suggestion?: string };       // project-relative, original case

/** `projectFiles`: project-relative paths, original case, forward slashes */
export function checkImagePath(name: string, projectFiles: string[], graphicsPaths: string[]): ImagePathResult;

/** The last \graphicspath declaration, from lines already masked for comments and verbatim */
export function graphicsPathsIn(maskedLines: string[]): string[];
```

**Normalising the name.** Trim. Strip a leading `./`. Then **skip** if the name is empty, contains `\ # < > { } "`, starts with `..`, or is absolute (`/`, `C:`). That covers macros, `#1`, brace-grouped or quoted names such as `{{plot.v2}.png}`, and paths TeX does not search.

**`\graphicspath`.** Parsed on the whole masked source with balanced braces, so a declaration split over lines works and a commented-out one is ignored. The last declaration wins. Each entry is normalised as above. If any entry starts with `..` or is absolute, `checkImagePath` returns `skip` for every name in that file.

**Found.** The extension is the part after the last `.` only if it is in `GRAPHICS_EXTENSIONS` (case ignored). `results.2024` has no extension, so the extensions are tried after it. For each prefix in `['', ...graphicsPaths]` and each extension the name needs (`''` if it has one, else every entry of `GRAPHICS_EXTENSIONS`), the lowercased `prefix + name + ext` is found when:

- it equals a project path, or
- it is the tail of one after a `/`, and that path is not under a top-level folder the compile leaves out of TEXINPUTS (`dist`, `node_modules`, anything starting with `.`). This mirrors `compiler.ts:1906-1927`.

**Unloadable.** Not found, but the same lookup with `UNLOADABLE_IMAGE_EXTENSIONS` hits a file: `plot.svg` exists. Message: pdfLaTeX cannot read .svg, so export it as PDF or PNG. No fix.

**Missing, with a suggestion.** Candidates are project files with a `GRAPHICS_EXTENSIONS` extension. The first step with any candidate decides. Exactly one candidate gives a suggestion; two or more give none.

1. Same file name, other folder: `figs/plot.png` written, `figures/plot.png` exists.
2. Same stem, other extension: `plot.jpg` written, `plot.png` exists.
3. Stem within edit distance 1 (stem of 4 characters or fewer) or 2 (longer), counting every candidate within the limit. Uses `editDistance` from `texKnowledge.ts`, not `closestMatch`, which returns nothing on an exact match and picks the nearest instead of counting.

The suggestion is always the file's project-relative path, which always compiles and is what the picker inserts.

### 2. One file list

- `server/projectFiles.ts` exports `listProjectFilePaths(projectDir)`: original case, no depth limit, skipping folders that start with `.` and `node_modules` at any depth (the same as the file-list API, `projects.ts:580`). The server builds it once per compile and passes it to both `findMissingProjectFiles` and the compile card.
- The client flattens App's `files` state once per change (`useMemo`) into `{ projectId, paths }`.
- **No check runs until the list is known for the open project.** `loadProjectFiles` (`App.tsx:581`) stops writing the fake `main.tex` + `figures` tree on a fetch error, and drops a reply whose project is no longer open. Until a real list for the current project arrives, the editor gets `null` and shows no image marks.

### 3. Live mark in the editor

- `src/utils/imageCheck.ts`: `checkImagePaths(lines: LineInfo[], projectFiles, graphicsPaths): StructureFinding[]`. It uses the `code` mask from `latexLint.analyze`, which `checkLatexStructure` already computes. The Editor effect calls `analyze` once and gives the result to both checks. It finds `\includegraphics` and `\includegraphics*` with optional `[...]` and `{...}` on one line. A call split across lines is not checked (no mark; the compile card still catches it).
- `StructureRule` gains `'missing-image'`. `StructureFinding` gains an optional `hideWhileCursorIn: { line, startColumn, endColumn }`, the braces of the path. `visibleStructureFindings` hides such a finding while the cursor is inside that range.
- Editor gets a prop `imageFiles: { projectId: string; paths: string[] } | null`, held in a ref. The structure-check effect depends on `imageFiles` as well, so an upload, rename or delete re-runs the check without an edit, and a project switch never checks against the old project's files.
- `graphicsPaths`:
  - A file with `\documentclass` (the main document, or a standalone one) uses its own last `\graphicspath`.
  - A file without it (a chapter) uses its own `\graphicspath` if it has one, else the main document's. TeX resolves a chapter's image paths from the project root, the same as main.tex's, so the resolver is the same.
  - App gets the main document's entries by fetching its text (`GET /api/projects/:id/file?path=<mainFile>`) whenever the open file is a chapter: on file switch, project switch and main-file change. It keeps `{ projectId, mainFile, paths }` and drops a reply for a project or main file that is no longer current.
  - Until that reply arrives, or if the fetch fails, chapters get no image marks. Editing main's `\graphicspath` and switching to a chapter refetches, because the switch saves main first.
- Severity `error`, the same as the compile card. Underline on the path inside the braces, gutter mark, scrollbar mark. Hover text (Editor adds the `Code check:` prefix itself):
  - with a suggestion: `No file "plott.png" in the project. Did you mean figures/plot.png? Click into the path to pick it.`
  - without: `No file "plott.png" in the project. Upload it or fix the path.`
  - unloadable: `pdfLaTeX cannot read plot.svg. Export it as PDF or PNG.`
- The picker's open rule (`Editor.tsx:833`) uses `checkImagePath`: it stays closed on a path that is `found` or `skip`, so walking the caret through a valid bare name no longer opens it.

### 4. Applying the suggestion in the editor

The image picker already opens when the caret enters an unresolved path. For a `missing` result with a suggestion, it shows one pinned row above the ranked list, labelled `Closest match`, selected by default. Enter or click inserts the suggestion as one undo step, as picking any image does today. `rankImages` is unchanged; today a typo such as `plott.png` shows "No image matches", so the pinned row is the only in-editor fix.

### 5. Compile error card

Pattern 3 in `server/compiler.ts` is replaced:

- It applies to `File '<name>' not found` lines (with or without an extension, names with spaces allowed) only when `<name>` matches the argument of an executable `\includegraphics` in main.tex. `\input{intro}` producing `File 'intro.tex' not found` is left alone.
- It calls `checkImagePath` with the compile's file list and main.tex's `\graphicspath` (via `executableLines`).
- A suggestion gives the explanation `No file named <name> in the project. <suggestion> is the closest match.` and a `replace_line` fix `Use <suggestion>`. The fix replaces the argument by its column range, found with the same scanner as the live check. It is offered only when the error is in main.tex and the name occurs in exactly one `\includegraphics` on that line. A caption containing the same word is never touched.
- With no suggestion: `No file named <name> in the project. Upload it, or fix the path.` No fix. Unloadable: the same text as the hover.

### 6. Removed

- `missing-image` in `latexLint.ts` and its tests. The live mark replaces it, and TeX Doctor no longer shows a second, different answer.
- The exact-path logic in `resolveProjectImage`. It stays as a thin wrapper over `checkImagePath` that returns the `FileEntry` for a `found` path, so its callers (`Editor.tsx:834`, `visualMode.ts:506`) keep their shape.
- The aggregating `\graphicspath` loop and `GRAPHICS_EXTENSIONS` in `projectFiles.ts`. They now come from `imagePaths.ts`.

## Not in scope

- Paths that work in Oberleaf but break on Overleaf or Linux: letter case, a bare name that relies on every subfolder being on TEXINPUTS.
- `\includegraphics` split across lines, in the live check.
- `\input`, `\include`, `\bibliography` paths; `\includesvg` and other image commands.
- Files changed on disk outside the app. App has no watcher; the list refreshes on the next in-app file action or project open.

## Tests

- `tests/imagePaths.test.ts`:
  - **found**: exact path; no extension; bare name in a subfolder; `./figures/plot`; `\graphicspath` prefix; case; dotted stem `results.2024` → `results.2024.png`.
  - **skip**: macro; `#1`; `{plot.v2}.png`; quoted name; `../x`; absolute path; `\graphicspath` entry outside the project.
  - **not found under excluded folders**: bare name only under top-level `dist/` or `.build/`.
  - **unloadable**: `.svg` and `.heic`.
  - **missing**: each suggestion step; ambiguity at each step; `plot.jpg` never suggested as `plot.svg`.
  - **`graphicsPathsIn`**: split over lines; spaces between groups; commented out; last one wins.
  - **imports**: no Node imports.
- `tests/imageCheck.test.ts`:
  - **ignored**: comments, verbatim, `\verb`.
  - **matching**: `\includegraphics*`; options with nested braces (`[trim={0 0 1cm 0}]`); two calls on one line.
  - **marks**: underline columns; hidden while the cursor is inside the braces.
  - **chapters**: a chapter uses main's `\graphicspath`; a chapter's own declaration wins; no marks in a chapter while main's paths are unknown (`null`).
  - **templates**: no marks on any bundled template.
- `tests/errorCorpus.ts`:
  - `missing-image` explanation regex updated to the new text.
  - new near-miss case (`plott.png` with `figures/plot.png`), recorded with MiKTeX, fix expected.
  - `\caption{plott} \includegraphics{plott}`: the fix edits only the argument.
  - `\input{intro}` missing: no image card.
  - regenerate `docs/ERROR_COVERAGE.md`.
- Read-only run over every project in the real projects folder: no image marks on documents that compile.
- Browser, sandbox projects folder, light and dark:
  - **live mark**: appears after typing a wrong name and leaving the braces.
  - **files**: uploading the missing file clears the mark with no edit; switching projects mid-load shows no marks from the old project.
  - **picker**: pinned `Closest match` row; Enter applies; a valid bare name does not open the picker.
  - **compile card**: `Use …` applies and the next compile is clean.

## Decisions (approved by Gyan, 2026-11-19)

1. Chapter files are checked, using the main document's `\graphicspath` (section 3).
2. Severity `error` (red), matching the compile card.

## Implementation notes (2026-11-19)

Where the build differs from the sections above:

- **Compile file list.** The compile card lists the project files itself, once per compile and only when an image error occurs. `findMissingProjectFiles` still does its own walk. That is two walks, not one shared list; both are cheap.
- **Chapter errors on the compile card.** When the failing `\includegraphics` is in an `\input` file, the card reads that file and gives the explanation without a fix.
- **"Error is in main.tex" test.** The fix is offered only when the error's own line in main.tex holds exactly one matching call. It does not compare absolute log paths with the project folder: recorded logs carry the recording machine's folder.
- **Image hover.** The preview hover in `latexCompletions.ts` was a fourth resolver. It now uses `resolveProjectImage` and shows nothing for an unresolved path, which the code-check hover covers.
- **TeX Live recordings.** The four new corpus cases have MiKTeX logs only. TeX Live logs come from the CI job's artifact.
