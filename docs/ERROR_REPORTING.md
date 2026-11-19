# Compile errors: how Oberleaf reports them, and how that compares with Overleaf

## Compared with Overleaf (2026-11-19)

The same 10 broken documents were compiled on overleaf.com (TeX Live 2026, LaTeX 2026-06-01) and in Oberleaf (MiKTeX 26.5, LaTeX 2025-11-01). The documents are cases 1-10 in `tests/diagnosticCases.ts`.

| Case | Overleaf | Oberleaf before | Oberleaf now |
|---|---|---|---|
| Undefined command next to `\ref` and `\cite` | PDF, references resolved | PDF, `??` and `[?]` (one latexmk pass) | PDF, references resolved (`latexmk -f`) |
| Missing `\input` file | No PDF, 1 error | No PDF, 3 errors | No PDF, 1 error, at the `\input` line |
| Missing `.sty` | No PDF, 1 error | No PDF, 3 errors | No PDF, 1 error |
| Missing image | PDF, placeholder box | PDF, empty gap | PDF, empty gap (the box comes from LaTeX 2026-06; update MiKTeX) |
| `\textbf{` never closed | No PDF, 2 errors | No PDF, 3 errors | No PDF, 1 error |
| No `\end{document}` | No PDF, Emergency stop | No PDF, 2 errors | No PDF, 1 error that says `\end{document}` is missing |
| `itemize` closed by `enumerate` | PDF, errors | PDF, "Compilation failed" | PDF, "Compiled with 1 error" |
| Double super/subscript | PDF, errors | PDF, "Compilation failed" | PDF, "Compiled with 2 errors" |
| Missing `.bib` | PDF, warnings | PDF, an error | PDF, warnings |
| More than 100 errors | No PDF | No PDF | No PDF |

Overleaf's log also showed `\write18 enabled` (shell escape on). Oberleaf keeps it off unless the project asks for it.

## What the compile reports now

- `-f` is passed to latexmk, so every pass runs even after an error. Overleaf does the same unless "Stop on first error" is on.
- The fatal tail is collapsed: "Emergency stop" and "Fatal error occurred, no output PDF file produced!" are dropped when an earlier error caused them. A lone Emergency stop stays, with the reason TeX printed (`*** (job aborted, no legal \end found)`).
- Status has three states: compiled, compiled with errors (PDF written), no PDF.
- Warnings carry a file and line: `server/logWarnings.ts` replays the log's file stack, including paths with spaces such as `OneDrive/Documents/Oberleaf Projects`. Kinds: undefined reference, undefined citation, duplicate label, font substituted, missing `\include` file, overfull/underfull box, other.
- An error in one file is never marked as fallout of an error in another file.
- An empty document gets "No pages of output" instead of a silent failure.

## In the editor

Errors and warnings from the last compile appear in the gutter (red circle for errors, amber triangle for warnings, grey circle for layout), with the message on hover, a mark in the scrollbar, and a wavy underline under an undefined command. Clicking a mark opens its card in the PDF panel. The marks move with the text while you edit and are replaced by the next compile. Entries without a line number stay in the panel only; Overleaf pins those to line 1.

## Checking it

```
npx tsx scripts/compare-error-cases.ts            compile every case and print the result
npx tsx scripts/compare-error-cases.ts --record   also store the logs as test fixtures
npx vitest run tests/compileDiagnostics.test.ts
```

## Reporting problems

Code: `server/reporting.ts` (report builder, redaction, signals, PostHog), routes under `/api/system/report*` in `server/index.ts` (local-only, so a collaborator on the share tunnel cannot read the owner's logs), `src/components/Report/`, `src/utils/reporting.ts`. Tests: `tests/reporting.test.ts`, `tests/importedReports.test.ts`.

### 1. "Report a problem" (user-initiated)

Opened from Ctrl+K ("Report a problem") and from the diagnostics panel ("Report problem" when Oberleaf could not explain a failure, otherwise "Diagnosis wrong or unclear? Report it").

The report holds: the user's description, optional contact, Oberleaf version and commit, Windows, Node, pdfTeX and latexmk versions, the last compile's errors, warnings and log, and page crashes from this session. The main `.tex` file only when the user ticks "Include my document's main file". The user can read the whole report in the dialog before doing anything with it.

Redaction, applied to every log line and file name: the Windows user name and every project folder name below the home folder (the project's own name, "OneDrive - <organisation>") become same-length filler, so a saved log still wraps where TeX wrapped it and parses the same way. E-mail addresses are masked.

Ways out: **Send report** (to PostHog, when configured), **GitHub issue** (saves the report file and opens a pre-filled issue on `sahgyan9/Oberleaf`; the user attaches the file; needs a GitHub account), **Save file**, **Copy**.

### 2. Error signals (opt-in)

Asked once, after the app has loaded, and only when a PostHog key is configured. Off until the user says yes; Ctrl+K, "Error signals: turn on/off" changes it. The choice and a random install ID are stored in `%APPDATA%\Oberleaf\reporting.json`.

Sent only for failures that point at Oberleaf, not the document:

| kind | when |
|---|---|
| `compile-no-reason` | no PDF and no error in the log |
| `unexplained-error` | a TeX error no rule in `server/compiler.ts` explains |
| `parser-missed` | the log has a `! ` line but nothing was parsed |
| `compile-crash` | the compile route threw |
| `package-install-failed` | the package manager could not install a package |
| `client-crash` | an uncaught error in the page |

Each event carries the kind, an error signature (`errorSignature`: paths, user file names, line numbers and e-mails removed; TeX package names kept), the engine, Oberleaf version and commit, Windows and TeX versions, and the install ID. No document text, file or project names, user name. One event per signature per run, at most 50 per day. PostHog person profiles are off (`$process_person_profile: false`).

### Setting up PostHog (once)

1. Create a free PostHog account and a project for Oberleaf. Choose the EU region if testers are mostly in Europe; otherwise US is fine.
2. Copy the project's API key (starts with `phc_`) into `config/reporting.json` as `posthogKey`, and set `posthogHost` to `https://us.i.posthog.com` or `https://eu.i.posthog.com`. This key can only write events, so it is safe in the public repository; PostHog designs it to be embedded in apps.
3. In the project settings, turn on discarding client IP data, so testers' IP addresses are not stored.
4. Commit and push. Testers get it with their next in-app update, and the one-time question appears.
5. For the developer only: create a personal API key with read access, and put it in `.env` (gitignored):

```
POSTHOG_PERSONAL_API_KEY=phx_...
POSTHOG_PROJECT_ID=12345
POSTHOG_API_HOST=https://us.posthog.com
```

`OBERLEAF_POSTHOG_KEY` and `OBERLEAF_POSTHOG_HOST` override the config file; that is how the feature was tested against a local stand-in endpoint.

### 3. Turning reports into tests (developer routine)

Weekly, or when a tester says something broke:

```
npx tsx scripts/fetch-reports.ts            new reports to .tmp/reports/, signal counts printed
npx tsx scripts/import-report.ts .tmp/reports/<id>.txt
```

`import-report` stores `tests/fixtures/reports/<id>/` (the redacted log and system info; never the user's description or e-mail, and their document only with `--with-source` after asking them, because the repository is public) and prints today's parse, marking errors no rule explains with `!!`.

Then add or fix the rule in `server/compiler.ts`, add a minimal case to `tests/errorCorpus.ts` or `tests/diagnosticCases.ts`, and run `npx tsx scripts/import-report.ts --accept <id>`. From then on `tests/importedReports.test.ts` fails if that report's output changes.

Signals with the same signature on several installs are the first to fix. A file attached to a GitHub issue goes through the same `import-report` step.
