// ─── Tab Switching ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

// ─── Messaging ───────────────────────────────────────────────────────────────
function msg(payload) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage(payload, r => {
      if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
      else res(r);
    });
  });
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────
const profileForm = document.getElementById("profile-form");
const saveStatus  = document.getElementById("save-status");

async function loadProfile() {
  const profile = await msg({ type: "GET_PROFILE" });
  Object.entries(profile).forEach(([key, val]) => {
    const el = profileForm.querySelector(`[name="${key}"]`);
    if (el) el.value = val;
  });
}

profileForm.addEventListener("submit", async e => {
  e.preventDefault();
  const data = {};
  new FormData(profileForm).forEach((val, key) => {
    if (val.trim()) data[key] = val.trim();
  });
  try {
    await msg({ type: "SAVE_PROFILE", data });
    showStatus(saveStatus, "Saved");
  } catch {
    showStatus(saveStatus, "Save failed — try again", true);
  }
});

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const settingsForm   = document.getElementById("settings-form");
const settingsStatus = document.getElementById("settings-status");

async function loadSettings() {
  const s = await msg({ type: "GET_SETTINGS" });
  if (s.apiKey) document.getElementById("api-key-input").value = s.apiKey;
  if (s.model)  settingsForm.querySelector("[name=model]").value = s.model;
  document.getElementById("ai-toggle").checked  = s.aiEnabled !== false;
  document.getElementById("btn-toggle").checked = s.showButton !== false;
}

settingsForm.addEventListener("submit", async e => {
  e.preventDefault();
  const modelVal = settingsForm.querySelector("[name=model]").value.trim();
  const data = {
    apiKey:     settingsForm.querySelector("[name=apiKey]").value.trim(),
    model:      modelVal || "google/gemma-4-31b-it",
    aiEnabled:  document.getElementById("ai-toggle").checked,
    showButton: document.getElementById("btn-toggle").checked
  };
  try {
    await msg({ type: "SAVE_SETTINGS", data });
    showStatus(settingsStatus, "Saved");
  } catch {
    showStatus(settingsStatus, "Save failed — try again", true);
  }
});

// ─── Ask AI Tab ───────────────────────────────────────────────────────────────
const askBtn       = document.getElementById("ask-btn");
const questionInput = document.getElementById("question-input");
const answerBox    = document.getElementById("answer-box");

askBtn.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  if (!question) return;

  askBtn.disabled = true;
  answerBox.classList.remove("hidden");
  answerBox.innerHTML = '<span class="loading">Thinking</span>';

  try {
    const profile = await msg({ type: "GET_PROFILE" });
    const result  = await msg({ type: "AI_ANSWER", question, profile });

    if (result && result.error) {
      answerBox.textContent = "Error: " + result.error;
    } else if (result && result.answer) {
      answerBox.textContent = result.answer;
    } else {
      answerBox.textContent = "No response received. Please try again.";
    }
  } catch (err) {
    answerBox.textContent = "Error: " + (err.message || "Could not reach extension service.");
  } finally {
    askBtn.disabled = false;
  }
});

questionInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) askBtn.click();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Show a status message in the given element.
 * @param {HTMLElement} el      - status span
 * @param {string}      text    - message to show
 * @param {boolean}     isError - if true, render in error colour
 */
function showStatus(el, text, isError = false) {
  el.textContent = (isError ? "✕ " : "✓ ") + text;
  el.style.color = isError ? "#ef4444" : "";   // fallback to CSS var(--success) when not error
  el.classList.add("visible");
  setTimeout(() => {
    el.classList.remove("visible");
    el.style.color = "";
  }, 2500);
}

// ─── Resume Import ────────────────────────────────────────────────────────────
const importBtn     = document.getElementById("import-btn");
const importStatus  = document.getElementById("import-status");
const resumeFile    = document.getElementById("resume-file");
const resumePaste   = document.getElementById("resume-paste");
const fileDrop      = document.getElementById("file-drop");
const fileDropLabel = document.getElementById("file-drop-label");

// Drag-over highlight
fileDrop.addEventListener("dragover", e => { e.preventDefault(); fileDrop.classList.add("drag-over"); });
fileDrop.addEventListener("dragleave", () => fileDrop.classList.remove("drag-over"));
fileDrop.addEventListener("drop", e => {
  e.preventDefault();
  fileDrop.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});

resumeFile.addEventListener("change", () => {
  if (resumeFile.files[0]) handleFileSelected(resumeFile.files[0]);
});

function handleFileSelected(file) {
  fileDropLabel.textContent = file.name;
  resumePaste.value = ""; // clear paste if file selected
}

/**
 * Extract text from a File object.
 * .txt is read directly; .pdf goes through the vendored pdf.js
 * (pdf-import.mjs), which handles compressed streams and embedded fonts.
 */
async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  if (file.type === "text/plain" || name.endsWith(".txt")) {
    return file.text();
  }
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    if (!window.AutofillPdf) throw new Error("PDF reader did not load — try pasting your resume text");
    let text;
    try {
      text = await window.AutofillPdf.extractText(await file.arrayBuffer());
    } catch {
      throw new Error("Could not read PDF — try pasting your resume text");
    }
    if (text.length < 30) {
      throw new Error("No text found in this PDF (scanned image?) — try pasting instead");
    }
    return text;
  }
  throw new Error("Unsupported file type — use .pdf or .txt");
}

function showImportStatus(text, isError = false) {
  importStatus.textContent = (isError ? "✕ " : "✓ ") + text;
  importStatus.classList.toggle("error", isError);
  importStatus.classList.add("visible");
  setTimeout(() => {
    importStatus.classList.remove("visible");
    setTimeout(() => importStatus.classList.remove("error"), 300);
  }, isError ? 5000 : 3500);
}

importBtn.addEventListener("click", async () => {
  const file = resumeFile.files[0];
  const pasteText = resumePaste.value.trim();

  if (!file && !pasteText) {
    showImportStatus("Upload a file or paste resume text first", true);
    return;
  }

  importBtn.disabled = true;
  importStatus.textContent = "Parsing…";
  importStatus.style.color = "var(--muted)";
  importStatus.classList.add("visible");

  try {
    let text;
    if (file) {
      text = await extractTextFromFile(file);
    } else {
      text = pasteText;
    }

    const result = await msg({ type: "AI_PARSE_RESUME", text });

    if (result?._error) {
      showImportStatus(result._error, true);
      return;
    }

    if (!result?.profile || !Object.keys(result.profile).length) {
      showImportStatus("No fields extracted — try pasting more text", true);
      return;
    }

    // Populate profile form fields with extracted data
    const extracted = result.profile;
    let filled = 0;
    for (const [key, val] of Object.entries(extracted)) {
      const el = profileForm.querySelector(`[name="${key}"]`);
      if (el && val) {
        el.value = val;
        filled++;
      }
    }

    showImportStatus(`Imported ${filled} fields — review and save`);

    // Auto-scroll to profile form top so user can review
    profileForm.scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (err) {
    showImportStatus(err.message || "Import failed — try pasting text instead", true);
  } finally {
    importBtn.disabled = false;
    importStatus.style.color = "";
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadProfile().catch(err =>
  console.warn("AutoFill Pro: profile load failed —", err.message)
);
loadSettings().catch(err =>
  console.warn("AutoFill Pro: settings load failed —", err.message)
);
