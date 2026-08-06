# Report Generator Skill

A Codex and Pi skill for planning and incrementally writing long, cited, print-ready reports.

## Features

- Modular Markdown sections for efficient navigation and editing
- CSL-compatible JSONL citations with numbered references
- Approval-gated OpenUI charts and visual compositions
- Print-ready A4 PDFs rendered with Vivliostyle
- Guided planning, one-section drafting, review, and finalization

## Install

```bash
git clone https://github.com/AnshulP14/report-generator-skill.git
ln -s "$PWD/report-generator-skill/report-generator" ~/.agents/skills/report-generator
node ~/.agents/skills/report-generator/scripts/report.mjs setup
```

The shared runtime is installed once under `~/.cache/report-generator`.

## Use

Invoke `$report-generator` in Codex or `/skill:report-generator` in Pi. The skill creates addressable Markdown sources, optional approved `.openui` layouts, and a compiled PDF without retaining raw research notes.
