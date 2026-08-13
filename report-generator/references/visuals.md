# Interactive OpenUI layouts

Use one root layout in `layouts/reader.openui`. Keep narrative in Markdown and insert it with `Narrative("section-id")`.

Use `Tabs` for major report paths and `Accordion` for drill-downs. Use `Card`, `Callout`, tables, and charts when they clarify the report. Every chart value must trace to report evidence or be labeled illustrative.

```openui
root = Stack([
  Tabs([
    TabItem("summary", "Summary", [
      Callout("info", "Reader guide", "Use the tabs to explore the report."),
      Narrative("executive-summary"),
    ]),
    TabItem("analysis", "Analysis", [
      Accordion([
        AccordionItem("method", "Method", [Narrative("evaluation-method")]),
        AccordionItem("findings", "Findings", [Narrative("recommendations")]),
      ]),
    ]),
  ]),
])
```
