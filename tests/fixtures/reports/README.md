# Imported problem reports

One folder per report, created by `npx tsx scripts/import-report.ts <report.txt>`:

- `report.json` - the report as the user sent it (user name and folder names already masked)
- `main.log` - the compile log
- `main.tex` - only when the user ticked "Include my document's main file"
- `expect.json` - written by `--accept <id>` once the output is right; `tests/importedReports.test.ts` then holds the parser to it

Do not import a report that includes a document the user marked private. Ask them first if the source is needed in the repository, since it is public.
