# Report Generator Skill

A Codex and Pi skill for planning and incrementally writing long, cited, print-ready reports.

## Features

- Modular Markdown sections for efficient navigation and editing
- CSL-compatible JSONL citations with numbered references
- Approval-gated OpenUI charts and visual compositions
- Print-ready A4 PDFs rendered with Vivliostyle
- Guided planning, one-section drafting, review, and finalization

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

`setup` installs the pinned OpenUI Lang renderer (`@openuidev/react-lang`), React, Markdown/YAML tooling, Vivliostyle CLI, and its rendering browser. No separate OpenUI installation is needed.

The shared runtime is installed once under `~/.cache/report-generator` and uses approximately 300 MB. Setup finishes by building a smoke-test PDF.

## Update

Because the installed skill is a symlink, pull the repository and refresh only the shared runtime:

```bash
cd /path/to/report-generator-skill
git pull --ff-only
node report-generator/scripts/report.mjs setup
```

## Use

Invoke `$report-generator` in Codex or `/skill:report-generator` in Pi. The skill creates addressable Markdown sources, optional approved `.openui` layouts, and a compiled PDF without retaining raw research notes.
