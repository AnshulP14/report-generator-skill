#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as bundle } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parse as parseYaml } from "yaml";

const h = React.createElement;
const command = process.argv[2];
const strict = command === "finalize";
if (command !== "build" && command !== "finalize") throw new Error("Expected build or finalize");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function run(program, args, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${program} exited with ${code}${stderr ? `: ${stderr.trim()}` : ""}`)));
  });
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

const citationRecords = (await readOptional("citations.jsonl") ?? "")
  .split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid citations.jsonl record on line ${index + 1}`); }
  });
const citations = new Map(citationRecords.map((record) => [record.id, record]));
if (citations.size !== citationRecords.length || citationRecords.some((record) => !record.id)) throw new Error("Every citation needs a unique id");
const citationNumbers = new Map();
const citationPattern = /\[@([A-Za-z0-9_.:-]+)(?:,\s*([^\]]+))?\]/g;
const sectionContent = new Map();
for (const section of manifest.sections) {
  const source = await readOptional(section.file);
  if (source === null) {
    if (strict) throw new Error(`Missing section file: ${section.file}`);
    warnings.add(`Missing section file: ${section.file}`);
    sectionContent.set(section.id, "> **Draft pending.** This section is planned but has not been written.");
  } else {
    sectionContent.set(section.id, source);
    for (const match of source.matchAll(citationPattern)) {
      if (!citations.has(match[1])) {
        if (strict) throw new Error(`Unknown citation: ${match[1]}`);
        warnings.add(`Unknown citation: ${match[1]}`);
      } else if (!citationNumbers.has(match[1])) citationNumbers.set(match[1], citationNumbers.size + 1);
    }
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
          const number = citationNumbers.get(match[1]);
          parts.push(number
            ? { type: "link", url: `#ref-${match[1]}`, data: { hProperties: { className: ["citation"] } }, children: [{ type: "text", value: match[2] ? `[${number}, ${match[2]}]` : `[${number}]` }] }
            : { type: "text", value: `[? ${match[1]}]` });
          cursor = match.index + match[0].length;
        }
        if (!cursor) continue;
        if (cursor < child.value.length) parts.push({ type: "text", value: child.value.slice(cursor) });
        node.children.splice(index, 1, ...parts);
        index += parts.length - 1;
      }
    }
    visit(tree);
  };
}

function slug(text) {
  return String(text).toLowerCase().replace(/[`*_~]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function headings(source, sectionId) {
  return [...source.matchAll(/^(#{2,3})\s+(.+)$/gm)].map((match) => ({
    depth: match[1].length,
    text: match[2].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, ""),
    id: `${sectionId}--${slug(match[2])}`,
  }));
}

function markdown(source, sectionId) {
  const components = {};
  for (const level of [2, 3]) components[`h${level}`] = ({ children }) => {
    const text = children.flat?.().join("") ?? children;
    return h(`h${level}`, { id: `${sectionId}--${slug(text)}` }, children);
  };
  return renderToStaticMarkup(h(ReactMarkdown, { remarkPlugins: [remarkGfm, citationPlugin], components, children: source }));
}

function referenceText(record) {
  const author = record.author?.map((item) => item.literal ?? item.family).filter(Boolean).join(", ");
  const year = record.issued?.["date-parts"]?.[0]?.[0];
  return [author, year && `(${year}).`, record.title && `${record.title}.`, record["container-title"] && `${record["container-title"]}.`, record.publisher && `${record.publisher}.`].filter(Boolean).join(" ");
}

const usedCitations = [...citationNumbers.entries()].sort((a, b) => a[1] - b[1]).map(([id, number]) => ({ ...citations.get(id), number }));
const sectionData = manifest.sections.map((section) => ({ ...section, headings: headings(sectionContent.get(section.id), section.id) }));
function sectionMarkup(section, interactive = false) {
  const guide = interactive ? `<details class="section-guide" open><summary>Section guide</summary><p>${section.purpose}</p><div class="guide-links">${section.headings.map((heading) => `<a class="level-${heading.depth}" href="#${heading.id}">${heading.text}</a>`).join("")}</div></details>` : "";
  return `<section class="report-section" id="${section.id}"><h1>${section.title}</h1>${guide}${markdown(sectionContent.get(section.id), section.id)}</section>`;
}
const pdfSectionMarkup = sectionData.map((section) => sectionMarkup(section)).join("\n");
const interactiveSectionMarkup = sectionData.map((section) => sectionMarkup(section, true)).join("\n");
const references = usedCitations.length ? `<section class="references" id="references"><h1>References</h1><ol>${usedCitations.map((record) => {
  const href = record.URL ?? (record.DOI ? `https://doi.org/${record.DOI}` : null);
  return `<li id="ref-${record.id}">${referenceText(record)} ${href ? `<a href="${href}">Open source</a>` : ""}</li>`;
}).join("")}</ol></section>` : "";
const toc = `<ol class="flat-toc">${manifest.sections.map((section) => `<li><a href="#${section.id}">${section.title}</a></li>`).join("")}${usedCitations.length ? '<li><a href="#references">References</a></li>' : ""}</ol>`;
const title = String(manifest.title).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const cover = `<section class="cover"><div><div class="cover-kicker">${manifest.kicker ?? "Research report"}</div><h1 id="report-title">${title}</h1>${manifest.subtitle ? `<div class="subtitle">${manifest.subtitle}</div>` : ""}</div><div class="cover-meta">${[manifest.date && `Prepared ${manifest.date}`, manifest.audience && `For ${manifest.audience}`].filter(Boolean).join(" · ")}</div></section>`;
const base = `<base href="${pathToFileURL(`${rootDir}${path.sep}`).href}">`;
const pdfCss = (await fs.readFile(path.join(runtimeDir, "report.css"), "utf8")).replace("--accent: #3157a4", `--accent: ${manifest.accent ?? "#3157a4"}`);
const pdfHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8">${base}<title>${title}</title><style>${pdfCss}</style></head><body>${cover}<nav class="contents" role="doc-toc"><h1>Contents</h1>${toc}</nav><main>${pdfSectionMarkup}${references}</main></body></html>`;
const interactiveCss = `:root{font-family:Inter,Avenir Next,Segoe UI,sans-serif;color:#18212f;background:#f4f7fb}body{margin:0}.report-shell{padding:clamp(2.5rem,7vw,6rem) max(1.5rem,calc((100vw - 1100px)/2));background:radial-gradient(circle at 85% 5%,#dceafb 0,transparent 32%),linear-gradient(135deg,#112b47,#365f91);color:#fff}.report-shell span{font-size:.75rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.75}.report-shell h1{max-width:760px;margin:.7rem 0;font-family:Georgia,serif;font-size:clamp(2.2rem,5vw,4.2rem);line-height:1.02}.report-shell p{max-width:650px;margin:0;font-size:1.08rem;line-height:1.55;opacity:.85}#app{max-width:1100px;margin:0 auto;padding:clamp(1.5rem,4vw,3.5rem)}#app .narrative{line-height:1.7}#app .narrative h2{margin-top:2.4rem;font-family:Georgia,serif;font-size:1.75rem}#app .narrative h3{margin-top:1.7rem}#app .narrative img{max-width:100%;height:auto;border-radius:1rem}#app .narrative table{width:100%;border-collapse:collapse;background:#fff;border-radius:.75rem;overflow:hidden;box-shadow:0 8px 24px rgba(21,48,78,.06)}#app .narrative th,#app .narrative td{padding:.75rem;border-bottom:1px solid #dce2ea;text-align:left;vertical-align:top}#app .narrative th{background:#eaf1f8;font-weight:750}#app .narrative blockquote{margin:1.5rem 0;padding:1rem 1.25rem;border-left:4px solid ${manifest.accent ?? "#3157a4"};background:#edf4fb;border-radius:0 .75rem .75rem 0}#app .citation{color:${manifest.accent ?? "#3157a4"};white-space:nowrap;font-weight:700}.references{max-width:1100px;margin:0 auto 4rem;padding:2rem clamp(1.5rem,4vw,3.5rem);background:#fff;border-radius:1rem}.references li:target{background:#fff5c2;outline:2px solid #e4bd34;border-radius:.35rem} @media(max-width:700px){.report-shell{padding:2.5rem 1.25rem}#app{padding:1.25rem}.references{margin:0 1.25rem 2rem;padding:1.25rem}}`;
function defaultInteractiveLayout() {
  return `root = Stack([Tabs([${sectionData.map((section) => `TabItem(${JSON.stringify(section.id)}, ${JSON.stringify(section.title)}, [Narrative(${JSON.stringify(section.id)})])`).join(",")}])])`;
}

const cacheDir = safePath(".report-cache", "internal cache");
const pdfHtmlPath = path.join(cacheDir, "report.pdf.html");
const outputPath = safePath(option("--output", manifest.output ?? "output/report.pdf"), "PDF output");
const interactivePath = safePath(manifest.interactive_output ?? "output/report.html", "interactive output");
const interactiveAssetPrefix = path.relative(path.dirname(interactivePath), rootDir) || ".";
const interactiveBody = interactiveSectionMarkup.replaceAll('src="assets/', `src="${interactiveAssetPrefix}/assets/`);
const interactiveLayoutPath = manifest.interactive_layout;
const interactiveLayout = interactiveLayoutPath ? await read(interactiveLayoutPath) : defaultInteractiveLayout();
const bundleName = `${path.basename(interactivePath, path.extname(interactivePath))}.interactive.js`;
const bundlePath = path.join(path.dirname(interactivePath), bundleName);
const bundleCssName = bundleName.replace(/\.js$/, ".css");
const interactiveEntry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { ThemeProvider } from "@openuidev/react-ui";
import "@openuidev/react-ui/index.css";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { z } from "zod/v4";
const sections = ${JSON.stringify(Object.fromEntries(sectionData.map((section) => [section.id, markdown(sectionContent.get(section.id), section.id).replaceAll('src="assets/', `src="${interactiveAssetPrefix}/assets/`)])))};
const Narrative = defineComponent({
  name: "Narrative",
  description: "Render a report Markdown section by stable ID.",
  props: z.object({ sectionId: z.string() }),
  component: ({ props }) => React.createElement("div", { className: "narrative", dangerouslySetInnerHTML: { __html: sections[props.sectionId] ?? "" } }),
});
const library = createLibrary({ root: "Stack", components: [...Object.values(openuiLibrary.components), Narrative] });
createRoot(document.getElementById("app")).render(React.createElement(ThemeProvider, { mode: "light", cssSelector: "#app" }, React.createElement(Renderer, { library, response: ${JSON.stringify(interactiveLayout)}, isStreaming: false })));
`;
await fs.mkdir(cacheDir, { recursive: true });
await fs.writeFile(path.join(cacheDir, ".gitignore"), "*\n");
await fs.writeFile(pdfHtmlPath, pdfHtml);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(interactivePath), { recursive: true });
await bundle({ stdin: { contents: interactiveEntry, resolveDir: runtimeDir, sourcefile: "report-interactive.jsx", loader: "jsx" }, bundle: true, format: "iife", platform: "browser", target: ["es2020"], outfile: bundlePath, minify: true });
const buildVersion = Date.now();
await fs.writeFile(interactivePath, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${bundleCssName}?v=${buildVersion}"><style>${interactiveCss}</style></head><body><header class="report-shell"><span>${manifest.kicker ?? "Research report"}</span><h1>${title}</h1>${manifest.subtitle ? `<p>${manifest.subtitle}</p>` : ""}</header><main id="app" aria-live="polite">Loading interactive report…</main>${references}<script src="${bundleName}?v=${buildVersion}"></script></body></html>`);

const vivliostyle = path.join(runtimeDir, "node_modules", ".bin", process.platform === "win32" ? "vivliostyle.cmd" : "vivliostyle");
await run(vivliostyle, ["build", pdfHtmlPath, "-o", outputPath, "-s", "A4"], rootDir);

const extracted = await run("pdftotext", ["-layout", outputPath, "-"], rootDir, true);
for (const section of manifest.sections) if (!extracted.stdout.includes(section.title)) warnings.add(`PDF text does not contain section title: ${section.title}`);
const info = await run("pdfinfo", [outputPath], rootDir, true);
const pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
if (!pages) warnings.add("Could not determine PDF page count");
for (let page = 3; page < pages; page += 1) {
  const text = await run("pdftotext", ["-f", String(page), "-l", String(page), "-layout", outputPath, "-"], rootDir, true);
  const density = text.stdout.replace(/\s/g, "").length;
  if (density < 500) warnings.add(`Sparse interior PDF page ${page} (${density} non-space characters)`);
}
if (warnings.size && strict) throw new Error(`Artifact QA failed:\n${[...warnings].join("\n")}`);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
console.log(`${strict ? "Finalized" : "Built"} ${outputPath} and ${interactivePath} (${manifest.sections.length} sections, ${usedCitations.length} references).`);
