#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parse as parseYaml } from "yaml";
import { z } from "zod/v4";
import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";

const h = React.createElement;
const command = process.argv[2];
const strict = command === "finalize";
if (command !== "build" && command !== "finalize") throw new Error("Expected build or finalize");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const rootDir = path.resolve(option("--root", process.cwd()));
const manifestName = option("--manifest", "report.yml");
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const warnings = new Set();

function safePath(relativePath, label) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) throw new Error(`${label} must be a relative path`);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) throw new Error(`${label} escapes the report directory`);
  return resolved;
}

const read = (relativePath) => fs.readFile(safePath(relativePath, relativePath), "utf8");
async function readOptional(relativePath) {
  try { return await read(relativePath); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const manifest = parseYaml(await read(manifestName));
if (!manifest || typeof manifest !== "object") throw new Error("report.yml must contain a YAML object");
if (!manifest.title || !Array.isArray(manifest.sections) || manifest.sections.length === 0) throw new Error("report.yml needs a title and at least one section");
if (!/^#[0-9a-fA-F]{6}$/.test(manifest.accent ?? "#3157a4")) throw new Error("accent must be a six-digit hex color");
if (strict && manifest.plan_status !== "approved") throw new Error("finalize requires plan_status: approved");

const sectionIds = new Set();
for (const section of manifest.sections) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id ?? "")) throw new Error(`Invalid section id: ${section.id}`);
  if (sectionIds.has(section.id)) throw new Error(`Duplicate section id: ${section.id}`);
  sectionIds.add(section.id);
  if (!section.title || !section.file) throw new Error(`Section ${section.id} needs title and file`);
  safePath(section.file, `file for ${section.id}`);
  if (section.layout) safePath(section.layout, `layout for ${section.id}`);
  if (strict && section.status !== "approved") throw new Error(`Section ${section.id} is not approved`);
}

const citationSource = await readOptional("citations.jsonl") ?? "";
const citationRecords = citationSource
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid citations.jsonl record on line ${index + 1}`); }
  });
const citations = new Map(citationRecords.map((record) => [record.id, record]));
if (citations.size !== citationRecords.length || citationRecords.some((record) => !record.id)) throw new Error("Every citation needs a unique id");
const citationNumbers = new Map();

const sectionContent = new Map();
for (const section of manifest.sections) {
  const source = await readOptional(section.file);
  if (source === null) {
    if (strict) throw new Error(`Missing section file: ${section.file}`);
    warnings.add(`Missing section file: ${section.file}`);
    sectionContent.set(section.id, `> **Draft pending.** This section is planned but has not been written.`);
  } else {
    sectionContent.set(section.id, source);
  }
}

const citationPattern = /\[@([A-Za-z0-9_.:-]+)(?:,\s*([^\]]+))?\]/g;
for (const section of manifest.sections) {
  for (const match of sectionContent.get(section.id).matchAll(citationPattern)) {
    const id = match[1];
    if (!citations.has(id)) {
      if (strict) throw new Error(`Unknown citation: ${id}`);
      warnings.add(`Unknown citation: ${id}`);
      continue;
    }
    if (!citationNumbers.has(id)) citationNumbers.set(id, citationNumbers.size + 1);
  }
}

function citationPlugin() {
  return (tree) => {
    function visit(node) {
      if (!Array.isArray(node.children)) return;
      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (child.type !== "text") { visit(child); continue; }
        const parts = [];
        let cursor = 0;
        for (const match of child.value.matchAll(citationPattern)) {
          if (match.index > cursor) parts.push({ type: "text", value: child.value.slice(cursor, match.index) });
          const id = match[1];
          const number = citationNumbers.get(id);
          if (!number) {
            parts.push({ type: "text", value: `[? ${id}]` });
          } else {
            const label = match[2] ? `[${number}, ${match[2]}]` : `[${number}]`;
            parts.push({ type: "link", url: `#ref-${id}`, data: { hProperties: { className: ["citation"] } }, children: [{ type: "text", value: label }] });
          }
          cursor = match.index + match[0].length;
        }
        if (cursor === 0) continue;
        if (cursor < child.value.length) parts.push({ type: "text", value: child.value.slice(cursor) });
        node.children.splice(index, 1, ...parts);
        index += parts.length - 1;
      }
    }
    visit(tree);
  };
}

function markdownElement(source) {
  return React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, citationPlugin], children: source });
}

const Narrative = defineComponent({
  name: "Narrative",
  description: "Renders one Markdown section by stable section ID.",
  props: z.object({ sectionId: z.string() }),
  component: ({ props }) => {
    const source = sectionContent.get(props.sectionId);
    if (!source) throw new Error(`Unknown section: ${props.sectionId}`);
    return React.createElement("div", { className: "narrative" }, markdownElement(source));
  },
});

const Callout = defineComponent({
  name: "Callout",
  description: "Displays a short emphasized judgment.",
  props: z.object({ title: z.string(), body: z.string(), tone: z.string().optional() }),
  component: ({ props }) => React.createElement(
    "aside",
    { className: `callout callout-${props.tone ?? "info"}` },
    React.createElement("strong", null, props.title),
    React.createElement("p", null, props.body),
  ),
});

const MetricStrip = defineComponent({
  name: "MetricStrip",
  description: "Displays three compact summary metrics.",
  props: z.object({ items: z.array(z.string()) }),
  component: ({ props }) => React.createElement(
    "div",
    { className: "metric-strip" },
    props.items.map((item) => React.createElement("div", { className: "metric", key: item }, item)),
  ),
});

const TrendChart = defineComponent({
  name: "TrendChart",
  description: "Displays multiple indexed time series as a print-safe SVG line chart.",
  props: z.object({
    title: z.string(),
    labels: z.array(z.string()),
    series: z.array(z.object({
      label: z.string(),
      values: z.array(z.number()),
      color: z.string().optional(),
    })),
  }),
  component: ({ props }) => {
    const width = 760;
    const height = 270;
    const left = 56;
    const right = 18;
    const top = 26;
    const bottom = 46;
    const values = props.series.flatMap((item) => item.values);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const x = (index) => left + (index * (width - left - right)) / Math.max(props.labels.length - 1, 1);
    const y = (value) => top + ((max - value) * (height - top - bottom)) / range;

    return h("figure", { className: "visual-card trend-chart" },
      h("figcaption", null, props.title),
      h("div", { className: "chart-legend" }, props.series.map((item) =>
        h("span", { key: item.label },
          h("i", { style: { background: item.color ?? "#3157a4" } }),
          item.label,
        ),
      )),
      h("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": props.title },
        ...Array.from({ length: 5 }, (_, index) => {
          const value = min + ((4 - index) * range) / 4;
          const yy = y(value);
          return h(React.Fragment, { key: `grid-${index}` },
            h("line", { x1: left, x2: width - right, y1: yy, y2: yy, className: "chart-grid" }),
            h("text", { x: left - 9, y: yy + 4, textAnchor: "end", className: "chart-label" }, Math.round(value)),
          );
        }),
        ...props.labels.map((label, index) => h("text", {
          x: x(index), y: height - 18, textAnchor: "middle", className: "chart-label", key: label,
        }, label)),
        ...props.series.flatMap((item, seriesIndex) => {
          const color = item.color ?? ["#3157a4", "#12a594", "#d28716"][seriesIndex % 3];
          const points = item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
          return [
            h("polyline", { points, fill: "none", stroke: color, strokeWidth: 4, strokeLinejoin: "round", strokeLinecap: "round", key: `${item.label}-line` }),
            ...item.values.map((value, index) => h("circle", {
              cx: x(index), cy: y(value), r: 5, fill: "white", stroke: color, strokeWidth: 3, key: `${item.label}-${index}`,
            })),
          ];
        }),
      ),
    );
  },
});

const RiskMatrix = defineComponent({
  name: "RiskMatrix",
  description: "Plots named risks on likelihood and impact axes.",
  props: z.object({
    title: z.string(),
    items: z.array(z.object({
      label: z.string(),
      likelihood: z.number(),
      impact: z.number(),
      tone: z.string(),
    })),
  }),
  component: ({ props }) => {
    const width = 760;
    const height = 330;
    const left = 72;
    const top = 22;
    const cellWidth = 124;
    const cellHeight = 49;
    const toneColor = { high: "#c94d4d", medium: "#d28716", low: "#2c9b77" };
    const cellColor = (xIndex, yIndex) => {
      const severity = xIndex + yIndex;
      if (severity >= 7) return "#f8dddd";
      if (severity >= 4) return "#fff0c9";
      return "#e3f3ec";
    };

    return h("figure", { className: "visual-card risk-matrix" },
      h("figcaption", null, props.title),
      h("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": props.title },
        ...Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) => h("rect", {
          x: left + column * cellWidth,
          y: top + row * cellHeight,
          width: cellWidth,
          height: cellHeight,
          fill: cellColor(column, 4 - row),
          stroke: "white",
          strokeWidth: 2,
          key: `cell-${row}-${column}`,
        }))).flat(),
        ...Array.from({ length: 5 }, (_, index) => h("text", {
          x: left + index * cellWidth + cellWidth / 2,
          y: top + 5 * cellHeight + 22,
          textAnchor: "middle",
          className: "chart-label",
          key: `x-${index}`,
        }, index + 1)),
        ...Array.from({ length: 5 }, (_, index) => h("text", {
          x: left - 18,
          y: top + (4 - index) * cellHeight + cellHeight / 2 + 4,
          textAnchor: "middle",
          className: "chart-label",
          key: `y-${index}`,
        }, index + 1)),
        h("text", { x: left + 2.5 * cellWidth, y: height - 10, textAnchor: "middle", className: "axis-label" }, "Likelihood"),
        h("text", { x: 17, y: top + 2.5 * cellHeight, textAnchor: "middle", transform: `rotate(-90 17 ${top + 2.5 * cellHeight})`, className: "axis-label" }, "Impact"),
        ...props.items.flatMap((item, index) => {
          const cx = left + (item.likelihood - 0.5) * cellWidth;
          const cy = top + (5 - item.impact + 0.5) * cellHeight + (index % 2 ? 7 : -7);
          const color = toneColor[item.tone] ?? "#3157a4";
          return [
            h("circle", { cx, cy, r: 9, fill: color, stroke: "white", strokeWidth: 3, key: `${item.label}-dot` }),
            h("text", { x: cx + 14, y: cy + 4, className: "risk-label", key: `${item.label}-label` }, item.label),
          ];
        }),
      ),
    );
  },
});

const DecisionBanner = defineComponent({
  name: "DecisionBanner",
  description: "Displays a recommendation, confidence, and rationale.",
  props: z.object({ recommendation: z.string(), confidence: z.string(), rationale: z.string() }),
  component: ({ props }) => h("aside", { className: "decision-banner" },
    h("div", null, h("span", null, "Decision"), h("strong", null, props.recommendation)),
    h("div", { className: "confidence" }, props.confidence),
    h("p", null, props.rationale),
  ),
});

const ComparisonMatrix = defineComponent({
  name: "ComparisonMatrix",
  description: "Compares approaches across criteria using one-to-five scores.",
  props: z.object({
    criteria: z.array(z.string()),
    options: z.array(z.object({ name: z.string(), scores: z.array(z.number()), note: z.string() })),
  }),
  component: ({ props }) => h("figure", { className: "visual-card comparison-matrix" },
    h("figcaption", null, "Approach comparison"),
    h("table", null,
      h("thead", null, h("tr", null,
        h("th", null, "Criterion"),
        ...props.options.map((option) => h("th", { key: option.name }, option.name)),
      )),
      h("tbody", null,
        ...props.criteria.map((criterion, criterionIndex) => h("tr", { key: criterion },
          h("td", null, criterion),
          ...props.options.map((option) => h("td", { className: `score score-${option.scores[criterionIndex]}`, key: option.name }, option.scores[criterionIndex])),
        )),
      ),
      h("tfoot", null, h("tr", null,
        h("td", null, "Readout"),
        ...props.options.map((option) => h("td", { key: option.name }, option.note)),
      )),
    ),
  ),
});

const EvidenceBalance = defineComponent({
  name: "EvidenceBalance",
  description: "Shows supportive, mixed, and contradictory evidence as stacked bars.",
  props: z.object({
    title: z.string(),
    items: z.array(z.object({ label: z.string(), support: z.number(), mixed: z.number(), contradict: z.number() })),
  }),
  component: ({ props }) => h("figure", { className: "visual-card evidence-balance" },
    h("figcaption", null, props.title),
    h("div", { className: "evidence-legend" },
      h("span", { className: "support" }, "Supportive"),
      h("span", { className: "mixed" }, "Mixed"),
      h("span", { className: "contradict" }, "Contradictory"),
    ),
    ...props.items.map((item) => h("div", { className: "evidence-row", key: item.label },
      h("strong", null, item.label),
      h("div", { className: "evidence-bar" },
        h("span", { className: "support", style: { width: `${item.support}%` } }, item.support >= 15 ? `${item.support}%` : ""),
        h("span", { className: "mixed", style: { width: `${item.mixed}%` } }, item.mixed >= 15 ? `${item.mixed}%` : ""),
        h("span", { className: "contradict", style: { width: `${item.contradict}%` } }, item.contradict >= 15 ? `${item.contradict}%` : ""),
      ),
    )),
  ),
});

const ConceptMap = defineComponent({
  name: "ConceptMap",
  description: "Places related concepts around one central idea.",
  props: z.object({ center: z.string(), nodes: z.array(z.object({ label: z.string(), tone: z.string() })) }),
  component: ({ props }) => {
    const width = 760;
    const height = 330;
    const cx = width / 2;
    const cy = height / 2;
    const colors = { blue: "#3157a4", teal: "#168f84", amber: "#c48212", violet: "#7456a6" };
    const positions = props.nodes.map((_, index) => {
      const angle = (Math.PI * 2 * index) / props.nodes.length - Math.PI / 2;
      return { x: cx + Math.cos(angle) * 250, y: cy + Math.sin(angle) * 112 };
    });

    return h("figure", { className: "visual-card concept-map" },
      h("figcaption", null, "Concept map"),
      h("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `Concept map for ${props.center}` },
        ...positions.map((position, index) => h("line", { x1: cx, y1: cy, x2: position.x, y2: position.y, className: "concept-link", key: `line-${index}` })),
        h("rect", { x: cx - 94, y: cy - 32, width: 188, height: 64, rx: 18, className: "concept-center" }),
        h("text", { x: cx, y: cy + 5, textAnchor: "middle", className: "concept-center-label" }, props.center),
        ...props.nodes.flatMap((node, index) => {
          const position = positions[index];
          const color = colors[node.tone] ?? colors.blue;
          return [
            h("rect", { x: position.x - 78, y: position.y - 25, width: 156, height: 50, rx: 14, fill: "white", stroke: color, strokeWidth: 3, key: `${node.label}-box` }),
            h("text", { x: position.x, y: position.y + 5, textAnchor: "middle", className: "concept-label", key: `${node.label}-label` }, node.label),
          ];
        }),
      ),
    );
  },
});

const ProcessFlow = defineComponent({
  name: "ProcessFlow",
  description: "Shows a four-step sequence with short explanations.",
  props: z.object({ steps: z.array(z.object({ title: z.string(), body: z.string() })) }),
  component: ({ props }) => h("div", { className: "process-flow" },
    ...props.steps.map((step, index) => h("div", { className: "process-step", key: step.title },
      h("span", null, String(index + 1).padStart(2, "0")),
      h("strong", null, step.title),
      h("p", null, step.body),
    )),
  ),
});

const WorkedExample = defineComponent({
  name: "WorkedExample",
  description: "Displays a compact calculation with numbered steps and result.",
  props: z.object({ title: z.string(), steps: z.array(z.string()), result: z.string() }),
  component: ({ props }) => h("aside", { className: "worked-example" },
    h("div", { className: "worked-title" }, props.title),
    h("ol", null, ...props.steps.map((step) => h("li", { key: step }, step))),
    h("div", { className: "worked-result" }, props.result),
  ),
});

const ContrastPair = defineComponent({
  name: "ContrastPair",
  description: "Contrasts a misconception with a better mental model.",
  props: z.object({ leftTitle: z.string(), leftBody: z.string(), rightTitle: z.string(), rightBody: z.string() }),
  component: ({ props }) => h("div", { className: "contrast-pair" },
    h("aside", { className: "contrast-wrong" }, h("strong", null, props.leftTitle), h("p", null, props.leftBody)),
    h("aside", { className: "contrast-right" }, h("strong", null, props.rightTitle), h("p", null, props.rightBody)),
  ),
});

const SectionChild = z.union([
  Narrative.ref,
  Callout.ref,
  MetricStrip.ref,
  TrendChart.ref,
  RiskMatrix.ref,
  DecisionBanner.ref,
  ComparisonMatrix.ref,
  EvidenceBalance.ref,
  ConceptMap.ref,
  ProcessFlow.ref,
  WorkedExample.ref,
  ContrastPair.ref,
]);
const SectionLayout = defineComponent({
  name: "SectionLayout",
  description: "Composes print-safe report blocks.",
  props: z.object({ children: z.array(SectionChild) }),
  component: ({ props, renderNode }) => React.createElement("div", { className: "section-layout" }, renderNode(props.children)),
});

const library = createLibrary({
  root: "SectionLayout",
  components: [
    SectionLayout,
    Narrative,
    Callout,
    MetricStrip,
    TrendChart,
    RiskMatrix,
    DecisionBanner,
    ComparisonMatrix,
    EvidenceBalance,
    ConceptMap,
    ProcessFlow,
    WorkedExample,
    ContrastPair,
  ],
});

const usedCitations = [...citationNumbers.entries()]
  .sort((left, right) => left[1] - right[1])
  .map(([id, number]) => ({ ...citations.get(id), number }));

function referenceText(record) {
  const author = record.author?.map((item) => item.literal ?? item.family).filter(Boolean).join(", ");
  const year = record.issued?.["date-parts"]?.[0]?.[0];
  return [author, year && `(${year}).`, record.title && `${record.title}.`, record["container-title"] && `${record["container-title"]}.`, record.publisher && `${record.publisher}.`]
    .filter(Boolean)
    .join(" ");
}

const approvedVisuals = new Map((manifest.approved_visuals ?? []).map((entry) => [entry.section, new Set(entry.components ?? [])]));
const alwaysAllowed = new Set(["SectionLayout", "Narrative"]);
const renderedSections = [];
const rendererPrefix = '<div style="position:relative"><div style="opacity:1;transition:opacity 0.2s ease">';
const rendererSuffix = "</div></div>";

function sectionMarkup(section, bodyMarkup) {
  return `<section class="report-section" id="${section.id}">${renderToStaticMarkup(h("h1", null, section.title))}${bodyMarkup}</section>`;
}

for (const section of manifest.sections) {
  let body = markdownElement(sectionContent.get(section.id));
  if (section.layout) {
    const approved = approvedVisuals.get(section.id);
    if (!approved) throw new Error(`Layout for ${section.id} has no approved_visuals entry`);
    const response = await readOptional(section.layout);
    if (response === null) {
      if (strict) throw new Error(`Missing layout: ${section.layout}`);
      warnings.add(`Missing layout: ${section.layout}`);
    } else {
      const usedComponents = [...response.matchAll(/\b([A-Z][A-Za-z0-9]*)\s*\(/g)].map((match) => match[1]);
      const unauthorized = usedComponents.filter((name) => !alwaysAllowed.has(name) && !approved.has(name));
      if (unauthorized.length) throw new Error(`Unapproved visual in ${section.layout}: ${[...new Set(unauthorized)].join(", ")}`);
      if (!response.includes(`Narrative("${section.id}")`)) throw new Error(`${section.layout} must include Narrative("${section.id}")`);
      body = React.createElement(Renderer, { library, response, isStreaming: false });
    }
  }

  try {
    let bodyMarkup = renderToStaticMarkup(body);
    if (section.layout && bodyMarkup.startsWith(rendererPrefix) && bodyMarkup.endsWith(rendererSuffix)) {
      bodyMarkup = bodyMarkup.slice(rendererPrefix.length, -rendererSuffix.length);
    }
    renderedSections.push(sectionMarkup(section, bodyMarkup));
  } catch (error) {
    if (strict || !section.layout) throw error;
    warnings.add(`Layout failed for ${section.id}: ${error.message}`);
    renderedSections.push(sectionMarkup(section, renderToStaticMarkup(h(React.Fragment, null,
      h("aside", { className: "callout" }, h("strong", null, "Layout pending"), h("p", null, error.message)),
      markdownElement(sectionContent.get(section.id)),
    ))));
  }
}

const cover = renderToStaticMarkup(h("section", { className: "cover" },
  h("div", null,
    h("div", { className: "cover-kicker" }, manifest.kicker ?? "Research report"),
    h("h1", { id: "report-title" }, manifest.title),
    manifest.subtitle ? h("div", { className: "subtitle" }, manifest.subtitle) : null,
  ),
  h("div", { className: "cover-meta" }, [manifest.date && `Prepared ${manifest.date}`, manifest.audience && `For ${manifest.audience}`].filter(Boolean).join(" · ")),
));

const contents = renderToStaticMarkup(h("nav", { className: "contents", role: "doc-toc" },
  h("h1", null, "Contents"),
  h("ol", null,
    ...manifest.sections.map((section) => h("li", { key: section.id }, h("a", { href: `#${section.id}` }, h("span", null, section.title)))),
    usedCitations.length ? h("li", { key: "references" }, h("a", { href: "#references" }, h("span", null, "References"))) : null,
  ),
));

const references = usedCitations.length ? renderToStaticMarkup(h("section", { className: "references", id: "references" },
  h("h1", null, "References"),
  h("ol", null, ...usedCitations.map((record) => {
    const href = record.URL ?? (record.DOI ? `https://doi.org/${record.DOI}` : null);
    return h("li", { id: `ref-${record.id}`, key: record.id }, `${referenceText(record)} `, href ? h("a", { href }, href) : null);
  })),
)) : "";

const css = (await fs.readFile(path.join(runtimeDir, "report.css"), "utf8"))
  .replace("--accent: #3157a4", `--accent: ${manifest.accent ?? "#3157a4"}`);
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${pathToFileURL(`${rootDir}${path.sep}`).href}">
  <title>${String(manifest.title).replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title>
  <style>${css}</style>
</head>
<body>${cover}${contents}<main>${renderedSections.join("")}${references}</main></body>
</html>`;

const cacheDir = safePath(".report-cache", "internal cache");
const htmlPath = path.join(cacheDir, "report.html");
const outputPath = safePath(option("--output", manifest.output ?? "output/report.pdf"), "PDF output");
await fs.mkdir(cacheDir, { recursive: true });
await fs.writeFile(path.join(cacheDir, ".gitignore"), "*\n");
await fs.writeFile(htmlPath, html);
await fs.mkdir(path.dirname(outputPath), { recursive: true });

function run(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: rootDir, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${program} exited with ${code}`)));
  });
}

const vivliostyle = path.join(runtimeDir, "node_modules", ".bin", process.platform === "win32" ? "vivliostyle.cmd" : "vivliostyle");
await run(vivliostyle, ["build", htmlPath, "-o", outputPath, "-s", "A4"]);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
console.log(`${strict ? "Finalized" : "Built"} ${outputPath} (${manifest.sections.length} sections, ${usedCitations.length} references, ${manifest.sections.filter((section) => section.layout).length} OpenUI layouts).`);
