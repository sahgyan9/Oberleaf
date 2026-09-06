// Regenerates the LaTeX warm-up probes embedded in scripts/install.ps1 from
// server/projects.ts, which is the real source of truth for what a fresh
// install will be asked to compile.
//
//   node scripts/generate-latex-probes.mjs           rewrite the block
//   node scripts/generate-latex-probes.mjs --check   fail if it is stale
//
// The installer cannot read projects.ts at runtime: it is downloaded and run
// before the repository is cloned, so the package list has to be baked in.
// It was maintained by hand for exactly one commit before this replaced it -
// the failure mode is silent, since a stale list still installs cleanly and
// only shows up as a stall on the first compile of whichever template gained a
// package.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const SOURCE = path.join(repo, "server", "projects.ts");
const TARGET = path.join(repo, "scripts", "install.ps1");

const BEGIN = "    # BEGIN GENERATED PROBES";
const END = "    # END GENERATED PROBES";

// Every document class the app can produce, mapped to the union of packages
// used with it. Order follows first appearance so the output is stable.
function collectProbes(source) {
  // The LaTeX lives inside TypeScript template literals, so each backslash is
  // doubled in the file text: `\\documentclass` on disk is \documentclass.
  const CLASS = /\\\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/g;
  const USE = /\\\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;

  const events = [];
  for (const m of source.matchAll(CLASS)) {
    events.push({ at: m.index, kind: "class", value: m[1].trim() });
  }
  for (const m of source.matchAll(USE)) {
    events.push({ at: m.index, kind: "use", value: m[1] });
  }
  events.sort((a, b) => a.at - b.at);

  const probes = new Map();
  let current = null;

  for (const ev of events) {
    if (ev.kind === "class") {
      if (!probes.has(ev.value)) probes.set(ev.value, new Set());
      current = ev.value;
      continue;
    }
    // A \usepackage before any \documentclass belongs to no document and is
    // not something a template would ever compile.
    if (!current) continue;
    for (const pkg of ev.value.split(",")) {
      const name = pkg.trim();
      if (name) probes.get(current).add(name);
    }
  }

  return probes;
}

function renderBlock(probes) {
  const lines = [
    BEGIN,
    "    # Generated from server/projects.ts. Do not edit by hand - run",
    "    #   npm run generate:latex-probes",
    "    # Class options are dropped on purpose: which package MiKTeX has to",
    "    # download does not depend on them, and templates disagree about them.",
    "    $probes = [ordered]@{",
  ];

  for (const [cls, pkgs] of probes) {
    const file = `probe-${cls.toLowerCase()}.tex`;
    lines.push(`        "${file}" = @(`);
    const body = [
      `\\documentclass{${cls}}`,
      ...[...pkgs].sort().map((p) => `\\usepackage{${p}}`),
      "\\begin{document}",
      "Oberleaf package warm-up. $E = mc^2$",
      "\\end{document}",
    ];
    lines.push(body.map((l) => `            '${l}'`).join(",\n"));
    lines.push("        )");
  }

  lines.push("    }", END);
  return lines.join("\n");
}

const source = readFileSync(SOURCE, "utf8");
const probes = collectProbes(source);

if (probes.size === 0) {
  console.error("[probes] found no \\documentclass in server/projects.ts - refusing to write an empty block.");
  process.exit(1);
}

// Read as utf8 so the leading BOM arrives as ﻿ and is written back
// untouched. Windows PowerShell 5.1 reads a BOM-less .ps1 as Windows-1252, so
// dropping it here would silently break the installer for every user.
const target = readFileSync(TARGET, "utf8");
const start = target.indexOf(BEGIN);
const end = target.indexOf(END);
if (start === -1 || end === -1) {
  console.error(`[probes] marker comments not found in ${path.relative(repo, TARGET)}.`);
  process.exit(1);
}

const updated = target.slice(0, start) + renderBlock(probes) + target.slice(end + END.length);
const summary = [...probes]
  .map(([cls, pkgs]) => `${cls} (${pkgs.size})`)
  .join(", ");

if (process.argv.includes("--check")) {
  if (updated !== target) {
    console.error(
      "[probes] scripts/install.ps1 is out of date with server/projects.ts.\n" +
        "         Run: npm run generate:latex-probes"
    );
    process.exit(1);
  }
  console.log(`[probes] up to date - ${summary}`);
} else {
  if (updated === target) {
    console.log(`[probes] already up to date - ${summary}`);
  } else {
    writeFileSync(TARGET, updated, "utf8");
    console.log(`[probes] regenerated scripts/install.ps1 - ${summary}`);
  }
}
