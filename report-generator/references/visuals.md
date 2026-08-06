# Approved OpenUI visuals

Read this file only after the user approves visuals for a section. Put one `SectionLayout` root in `layouts/<section-id>.openui`, keep prose in Markdown, and include `Narrative("<section-id>")` exactly once.

```openui
root = SectionLayout([decision, comparison, prose])
decision = DecisionBanner("Prefer A", "High confidence", "A leads on the decisive criteria.")
comparison = ComparisonMatrix(["Accuracy", "Cost"], [{name: "A", scores: [5, 3], note: "Best fit"}, {name: "B", scores: [3, 5], note: "Cheapest"}])
prose = Narrative("approach-comparison")
```

Available optional components:

- `MetricStrip(["label value", ...])` — three compact headline metrics.
- `Callout(title, body, tone?)` — short emphasized judgment.
- `DecisionBanner(recommendation, confidence, rationale)` — decision summary.
- `TrendChart(title, labels, [{label, values, color?}])` — print-safe SVG lines.
- `RiskMatrix(title, [{label, likelihood, impact, tone}])` — 1–5 risk map.
- `ComparisonMatrix(criteria, [{name, scores, note}])` — 1–5 score table.
- `EvidenceBalance(title, [{label, support, mixed, contradict}])` — percentages totaling 100.
- `ConceptMap(center, [{label, tone}])` — radial concept map.
- `ProcessFlow([{title, body}, ...])` — two to four ordered steps.
- `WorkedExample(title, steps, result)` — calculation or reasoning walkthrough.
- `ContrastPair(leftTitle, leftBody, rightTitle, rightBody)` — misconception versus better model.

Use only components named for that section under `approved_visuals`. Prefer one or two visuals; every value must trace to report evidence or be clearly labeled illustrative. Keep labels short enough to print legibly.
