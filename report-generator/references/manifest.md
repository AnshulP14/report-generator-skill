# Manifest

Use this compact shape. `report.yml` is the single plan, state, and build manifest.

```yaml
title: Example report
subtitle: Optional explanatory subtitle
kicker: Research report
date: 2026-08-06
accent: "#3157a4"
audience: Decision-makers evaluating the approaches
thesis: The specific question or claim the report will resolve
evidence_strategy: Prefer primary sources; distinguish facts, estimates, and inference
word_budget: 5000
plan_status: proposed
output: output/report.pdf

approved_visuals: []
# After explicit approval:
# approved_visuals:
#   - section: approach-comparison
#     components: [DecisionBanner, ComparisonMatrix]

sections:
  - id: executive-summary
    title: Executive Summary
    purpose: State the conclusion, confidence, and decisive evidence
    target_words: 500
    status: planned
    file: sections/executive-summary.md

  - id: approach-comparison
    title: Approach Comparison
    purpose: Compare viable approaches against decision criteria
    target_words: 1200
    status: planned
    file: sections/approach-comparison.md
    # Add only after visual approval:
    # layout: layouts/approach-comparison.openui
```

Allowed section states are `planned`, `drafted`, and `approved`. Keep section order stable unless the user approves a structural revision. Section files must remain addressable independently and should not rely on prose in neighboring files.
