// pdf-import.mjs — popup glue for PDF resume import.
//
// Loads the vendored pdf.js (vendor/pdfjs/: pdfjs-dist 6.4.299 legacy build,
// Apache-2.0; refresh with `npm run vendor:pdfjs`) as an ES module and
// exposes window.AutofillPdf.extractText(arrayBuffer) for popup.js, which is a
// classic script. Everything runs locally inside the extension; the PDF is not
// uploaded anywhere.

import * as pdfjsLib from "./vendor/pdfjs/pdf.min.mjs";
import { extractPdfText } from "./pdf-text.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

window.AutofillPdf = {
  extractText: data => extractPdfText(pdfjsLib, data),
};
