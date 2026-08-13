---
name: report-generator
description: "Plan and iteratively produce cited reports with a navigable standalone HTML reader and a print-safe PDF. Use when building a multi-section research report, synthesizing a large document set, creating cited financial analysis or literature reviews, or iteratively exploring a tough topic across sessions."
---

# Report Generator

Build a report as small addressable Markdown sections, then compile it with the bundled renderer. Treat `report.yml` as the sole plan and state file. Run autonomously: decide the plan, visuals, section order, and revisions from the request and available evidence.

## Workflow

1. If `report.yml` is absent, create it and the report structure:
   - Read `references/manifest.md`.
   - Create `report.yml`, `sections/`, `assets/`, `output/`, and an empty `citations.jsonl`.
   - Define the thesis, audience, evidence strategy, ordered section IDs and purposes.
   - Choose static visuals that materially improve comprehension and record them in `approved_visuals`.
   - Set `plan_status: approved`.
2. Draft every section, iterating where evidence or artifact QA requires it:
   - Write or revise `sections/<id>.md` without repeating its report-level title.
   - Read `references/citations.md` for sourced claims; append a CSL-compatible record to `citations.jsonl` as soon as a source is used.
   - Set the section to `approved` after its source and build output pass review.
3. Run `finalize` after every section is approved. Deliver both final artifacts and retain the editable Markdown, manifest, citations, and assets.

## Outputs

`build` and `finalize` create:

- `output/report.html` (or `interactive_output`): a standalone React/OpenUI reader. It includes a bundled script and runs without a server.
- `output/report.pdf` (or `output`): a flat, print-safe PDF.

Use Markdown for prose, tables, lists, equations, and captions. Use `interactive_layout: layouts/reader.openui` in `report.yml` for the HTML interface; prefer `Tabs`, `Accordion`, `Card`, `Callout`, and charts to make reports explorable without writing HTML. Layouts use `Narrative("section-id")` to insert Markdown sections. The PDF intentionally ignores the OpenUI layout and renders the same Markdown as flat chapters. For an approved static chart, create an image asset and provide descriptive alt text.

Keep stable lowercase kebab-case section IDs. During edits, read only the manifest, target section, relevant source context, and cited records. Search IDs before broad reads.

## Renderer

Resolve `scripts/report.mjs` relative to this `SKILL.md`; never copy the runtime into a report. Run `setup` after upgrading the skill or when the runtime is absent. `build` permits planned sections and renders placeholders. `finalize` requires an approved plan, approved sections, valid citations, and successful HTML/PDF QA.

After each material build, open the HTML artifact and inspect the rendered PDF pages. Confirm all sections appear in both outputs. Check overflow, clipping, sparse spill pages, broken links, table splits, and unreadably small text. The renderer detects missing headings and nearly empty interior pages; repair every warning before finalizing.
