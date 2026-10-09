#!/usr/bin/env node
/**
 * build.mjs — produce a Chrome Web Store-ready zip of the extension.
 *
 * Bundles ONLY the runtime files an end user needs (no tests, no dev tooling,
 * no node_modules, no fixtures). The version is read from manifest.json so the
 * artifact name always matches the shipped version.
 *
 * Usage: npm run build   ->   dist/autofill-pro-v<version>.zip
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const staging = join(dist, "_staging");

// Files/dirs that ship inside the extension package.
const INCLUDE = [
  "manifest.json",
  "background.js",
  "redact.js",
  "patterns.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "pdf-import.mjs",
  "pdf-text.mjs",
  "vendor",
  "icons",
];

function fail(msg) {
  console.error(`\n❌ build failed: ${msg}\n`);
  process.exit(1);
}

// 1. Read + validate version from the manifest (single source of truth).
const manifestPath = join(root, "manifest.json");
if (!existsSync(manifestPath)) fail("manifest.json not found");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  fail(`manifest.json has an invalid version: "${version}"`);
}

// 2. Verify every required file exists before we package anything.
const missing = INCLUDE.filter((f) => !existsSync(join(root, f)));
if (missing.length) fail(`missing required files: ${missing.join(", ")}`);

// 3. Stage a clean copy.
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
for (const item of INCLUDE) {
  cpSync(join(root, item), join(staging, item), { recursive: true });
}

// 4. Zip it. `-X` strips extra file attributes; `-r` recurses.
const outName = `autofill-pro-v${version}.zip`;
const outPath = join(dist, outName);
rmSync(outPath, { force: true });
try {
  execFileSync("zip", ["-r", "-X", "-q", outPath, ...INCLUDE], { cwd: staging });
} catch {
  fail("the `zip` command is required but was not found on PATH");
}

// 5. Clean up staging.
rmSync(staging, { recursive: true, force: true });

const { size } = (await import("node:fs")).statSync(outPath);
console.log(`\n✅ Built ${outName} (${(size / 1024).toFixed(1)} KB)`);
console.log(`   → ${outPath}`);
console.log(`   contents: ${INCLUDE.join(", ")}\n`);
