// pdf-text.mjs — turn a PDF into plain text with pdf.js.
//
// Real resumes (Word, Google Docs, Chrome "Save as PDF", LaTeX, macOS Print)
// compress their content streams with FlateDecode and encode glyphs through
// embedded fonts and ToUnicode maps, so scanning the raw bytes for text
// operators finds nothing useful. pdf.js does the decompression and font
// decoding. This module is shared by the popup (pdf-import.mjs) and the tests,
// and takes the pdf.js module as an argument so both use the vendored copy.

/** Join pdf.js text items into lines, keeping the reading order pdf.js gives. */
export function textFromItems(items) {
  let out = "";
  let space = false; // a separator is owed before the next item
  for (const item of items) {
    if (typeof item.str !== "string") continue; // marked-content markers
    if (space && item.str && !/^[\s,.;:)\]]/.test(item.str)) out += " ";
    out += item.str;
    if (item.hasEOL) { out += "\n"; space = false; }
    else space = Boolean(item.str) && !/\s$/.test(item.str);
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract the text layer of a PDF. `data` is an ArrayBuffer or Uint8Array.
 * Scanned (image-only) PDFs have no text layer and return "".
 */
export async function extractPdfText(pdfjsLib, data, { maxPages = 10 } = {}) {
  // Always hand pdf.js a plain Uint8Array copy: it may transfer the buffer to
  // its worker, and it rejects Node Buffers.
  const bytes = new Uint8Array(ArrayBuffer.isView(data) ? data : new Uint8Array(data));
  const task = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,  // extension CSP forbids eval
    disableFontFace: true,   // we only need text, not rendering
    useSystemFonts: false,
  });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(textFromItems(content.items));
    }
    return pages.filter(Boolean).join("\n\n");
  } finally {
    await task.destroy();
  }
}
