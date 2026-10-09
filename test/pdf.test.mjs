// PDF resume import against real, FlateDecode-compressed PDFs made by three
// different producers (fixtures and their sources are in test/fixtures/).
// Uses the same vendored pdf.js and pdf-text.mjs that the popup loads.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import * as pdfjsLib from "../vendor/pdfjs/pdf.min.mjs";
import { extractPdfText, textFromItems } from "../pdf-text.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
const { redactContactInfo } = createRequire(import.meta.url)("../redact.js");

const FIXTURES = {
  "resume-chrome.pdf": "Chrome / Skia",
  "resume-macos.pdf": "macOS Quartz (Print > Save as PDF)",
  "resume-latex.pdf": "LaTeX (XeTeX / xdvipdfmx)",
};

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

for (const [name, producer] of Object.entries(FIXTURES)) {
  test(`extracts readable text from ${producer}`, async () => {
    const bytes = fixture(name);
    assert.ok(bytes.includes("FlateDecode"), "fixture should use compressed streams");

    const text = await extractPdfText(pdfjsLib, bytes);
    for (const expected of ["Jordan Rivera", "jordan.rivera@example.com", "(617) 555-0142",
                            "Acme Robotics", "Northeastern University", "Kubernetes"]) {
      assert.ok(text.includes(expected), `${name}: missing "${expected}" in:\n${text}`);
    }
    assert.ok(!text.includes("FlateDecode") && !text.includes("endstream"), "PDF structure leaked into text");
  });
}

test("extracted PDF text redacts cleanly before the AI step", async () => {
  const text = await extractPdfText(pdfjsLib, fixture("resume-chrome.pdf"));
  const { text: redacted, found } = redactContactInfo(text);
  assert.equal(found.email, "jordan.rivera@example.com");
  assert.equal(found.phone, "(617) 555-0142");
  assert.equal(found.addressLine1, "360 Huntington Ave");
  assert.equal(found.zipCode, "02115");
  assert.ok(!/example\.com|555-0142|Huntington|02115/.test(redacted));
});

test("textFromItems joins items into lines without stray spaces", () => {
  const items = [
    { str: "Software Engineer", hasEOL: false },
    { str: ", Acme", hasEOL: false },
    { str: "Robotics", hasEOL: true },
    { type: "beginMarkedContent" },
    { str: "Boston", hasEOL: false },
  ];
  assert.equal(textFromItems(items), "Software Engineer, Acme Robotics\nBoston");
});

test("a non-PDF is rejected rather than returning garbage", async () => {
  await assert.rejects(extractPdfText(pdfjsLib, new TextEncoder().encode("not a pdf at all")));
});
