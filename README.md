# Report Generator Skill

A Codex and Pi skill for planning and incrementally writing long, cited reports with a standalone interactive reader and a print-ready PDF.

## Features

- Modular Markdown sections for efficient navigation and editing
- CSL-compatible JSONL citations with numbered references
- Standalone interactive HTML reader built with OpenUI layouts
- Evidence-backed charts, callouts, cards, tabs, and accordions
- Print-ready A4 PDFs rendered with Vivliostyle
- Autonomous planning, drafting, review, and finalization

## Install

Requirements:

- Git
- Node.js 20 or later with npm
- An internet connection during the first setup

```bash
git clone https://github.com/AnshulP14/report-generator-skill.git
cd report-generator-skill
mkdir -p ~/.agents/skills
ln -s "$PWD/report-generator" ~/.agents/skills/report-generator
node ~/.agents/skills/report-generator/scripts/report.mjs setup
```

`setup` installs the pinned OpenUI renderers, React, Markdown/YAML tooling, Vivliostyle CLI, and its rendering browser. No separate OpenUI installation is needed.

The shared runtime is installed once under `~/.cache/report-generator` and uses approximately 300 MB. Setup builds a smoke-test PDF, then atomically replaces the prior runtime only when the new one is ready.

## Update

Because the installed skill is a symlink, pull the repository and refresh only the shared runtime:

```bash
cd /path/to/report-generator-skill
git pull --ff-only
node report-generator/scripts/report.mjs setup
```

## Use

Invoke `$report-generator` in Codex or `/skill:report-generator` in Pi. The skill creates addressable Markdown sources, a `layouts/reader.openui` interactive layout, a standalone `output/report.html`, and a flat `output/report.pdf`, without retaining raw research notes.

The reader can use OpenUI tabs, accordions, cards, callouts, tables, and evidence-backed charts. The PDF renders the same Markdown sections as conventional print-safe chapters, so it remains readable without the interactive layout.
