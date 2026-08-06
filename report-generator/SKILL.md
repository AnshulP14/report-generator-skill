---
name: report-generator
description: Plan and incrementally write long, cited, print-ready PDF reports from large document sets, web research, financial analysis, literature reviews, comparisons, or learning material. Use when work needs a readable multi-section report, durable Markdown sources, numeric citations, optional approved OpenUI visuals, or repeated editing without loading the whole report.
---

# Report Generator

Build a report as small addressable Markdown sections, then compile them through the bundled renderer. Treat `report.yml` as the sole plan and state file.

## Run the workflow

1. Find `report.yml` in the requested report directory.
2. If it is absent, perform the planning pass only:
   - Read `references/manifest.md`.
   - Create `report.yml`, `sections/`, `layouts/`, `assets/`, `output/`, and an empty `citations.jsonl`.
   - Define the thesis, audience, evidence strategy, total word budget, ordered section IDs, section purposes, and target words.
   - Propose optional visual components by section. Keep `approved_visuals` empty.
   - Set `plan_status: proposed` and stop for approval. Write no section prose or layouts.
3. If the plan is proposed, incorporate the user's approval or requested changes. Record only explicitly approved visuals and set `plan_status: approved`.
4. If the plan is approved, advance at most one section per invocation:
   - Write or revise `sections/<id>.md` without repeating its report-level title.
   - Read `references/citations.md` when the section contains sourced claims.
   - Create `layouts/<id>.openui` only when that section has approved visuals; first read `references/visuals.md`.
   - Set the section to `drafted`, run `build`, and stop for review.
   - On approval, set it to `approved`; the same invocation may draft the next single section.
5. When every section is approved, run `finalize`. Deliver the PDF and keep the Markdown, manifest, citations, layouts, and assets as editable sources.

An explicit user instruction to continue autonomously may waive the stop points. It does not waive citation checks, visual approval, one-section commits, or final validation.

## Keep the source lean

Use Markdown for narrative, tables, lists, equations, code, and ordinary callouts. Use OpenUI only for an approved composition that materially improves comprehension. Reference prose from layouts with `Narrative("section-id")`; keep prose out of `.openui` files.

Keep research inputs in the active context. Persist only report content and source metadata—no raw-document copies, extraction dumps, or research-note files.

Use stable lowercase kebab-case section IDs. Read only `report.yml`, the current section, directly relevant source context, and referenced citation records during an edit. Search section IDs and citation IDs before broad file reads.

## Use the renderer

Resolve `scripts/report.mjs` relative to this `SKILL.md`; do not copy the runtime into a report.

```bash
node <skill-dir>/scripts/report.mjs setup
node <skill-dir>/scripts/report.mjs build --root <report-dir>
node <skill-dir>/scripts/report.mjs finalize --root <report-dir>
```

Run `setup` only when the shared runtime is absent or outdated. `build` permits planned sections and renders placeholders. `finalize` requires an approved plan, approved sections, valid citations, approved layouts, and a successful PDF build.

After each build, inspect the PDF page render when layout changed materially. Check overflow, clipped visuals, sparse spill pages, broken links, table splits, and unreadably small text before presenting it.
