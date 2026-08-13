#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRuntime = path.join(skillDir, "assets", "runtime");
const cacheRoot = process.env.REPORT_GENERATOR_CACHE
  ? path.resolve(process.env.REPORT_GENERATOR_CACHE)
  : path.join(os.homedir(), ".cache", "report-generator");
const runtimeDir = path.join(cacheRoot, "runtime");
const command = process.argv[2];

function run(program, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${program} exited with ${code}`)));
  });
}

async function setup() {
  await fs.mkdir(cacheRoot, { recursive: true });
  const stagingDir = await fs.mkdtemp(path.join(cacheRoot, "runtime-staging-"));
  const backupDir = path.join(cacheRoot, "runtime-previous");
  const smokeDir = await fs.mkdtemp(path.join(os.tmpdir(), "report-generator-"));
  try {
    await fs.cp(sourceRuntime, stagingDir, { recursive: true, force: true });
    await run(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], stagingDir);
    const smokeHtml = path.join(smokeDir, "smoke.html");
    const smokePdf = path.join(smokeDir, "smoke.pdf");
    await fs.writeFile(smokeHtml, "<!doctype html><style>@page{size:A4}</style><h1>Report runtime ready</h1>");
    const vivliostyle = path.join(stagingDir, "node_modules", ".bin", process.platform === "win32" ? "vivliostyle.cmd" : "vivliostyle");
    await run(vivliostyle, ["build", smokeHtml, "-o", smokePdf, "-s", "A4"], stagingDir);
    await fs.rm(backupDir, { recursive: true, force: true });
    try { await fs.rename(runtimeDir, backupDir); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await fs.rename(stagingDir, runtimeDir);
    await fs.rm(backupDir, { recursive: true, force: true });
    console.log(`Report runtime installed at ${runtimeDir}`);
  } finally {
    await fs.rm(smokeDir, { recursive: true, force: true });
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}

if (command === "setup") {
  await setup();
} else if (command === "build" || command === "finalize") {
  try {
    await fs.access(path.join(runtimeDir, "report.mjs"));
  } catch {
    throw new Error(`Report runtime is not installed. Run: node ${fileURLToPath(import.meta.url)} setup`);
  }
  await run(process.execPath, [path.join(runtimeDir, "report.mjs"), ...process.argv.slice(2)], process.cwd());
} else {
  console.error("Usage: report.mjs setup | build [--root DIR] [--manifest FILE] | finalize [--root DIR] [--manifest FILE]");
  process.exitCode = 2;
}
