# Citations

Use compact Pandoc-style citations in Markdown:

```markdown
Revenue grew 18% year over year [@annual-report-2025, p. 94].
The two reviews reach different conclusions [@smith-2024] [@lee-2025].
```

Store one CSL-compatible JSON object per line in `citations.jsonl`. Keep IDs stable and human-searchable.

```json
{"id":"annual-report-2025","type":"report","title":"2025 Annual Report","author":[{"literal":"Example Corp"}],"issued":{"date-parts":[[2025]]},"URL":"https://example.com/report.pdf","accessed":{"date-parts":[[2026,8,6]]}}
```

Use locator labels such as `p.`, `pp.`, `sec.`, or `fig.`. The renderer assigns fixed numeric references by first appearance and builds the bibliography. Cite primary sources for factual claims; label synthesis or inference in prose rather than attaching a citation that does not directly support it.
