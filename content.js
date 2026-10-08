// ─── Field Pattern Matching ───────────────────────────────────────────────────
// FIELD_PATTERNS and AUTOCOMPLETE_MAP live in patterns.js, which manifest.json
// loads before this file.


// ─── Visibility ───────────────────────────────────────────────────────────────
// FIX: replaced unreliable offsetParent check with computed style check
function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  // checkVisibility available Chrome 105+; fall back to rect check
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

// ─── Label Detection ──────────────────────────────────────────────────────────
// FIX: aria-labelledby now handles multiple space-separated IDs; added sibling scan
// FIX: no longer strips input.value from label text (was corrupting labels on re-fill)
function getLabel(input) {
  if (input.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  const parentLabel = input.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll("input,textarea,select").forEach(e => e.remove());
    const t = clone.textContent.trim();
    if (t) return t;
  }
  const al = input.getAttribute("aria-label");
  if (al) return al;
  const alby = input.getAttribute("aria-labelledby");
  if (alby) {
    const text = alby.split(/\s+/)
      .map(id => document.getElementById(id)?.textContent?.trim() || "")
      .filter(Boolean).join(" ");
    if (text) return text;
  }
  // Scan preceding siblings for label-like text
  let prev = input.previousElementSibling;
  while (prev) {
    if (["LABEL", "SPAN", "P", "DIV", "DT", "LI", "LEGEND"].includes(prev.tagName)) {
      const t = prev.textContent.trim();
      if (t && t.length < 80) return t;
    }
    prev = prev.previousElementSibling;
  }
  // Fallback: short parent text
  const pt = input.parentElement?.textContent?.trim() || "";
  if (pt && pt.length < 60) return pt;
  return "";
}

// ─── Key Matching ─────────────────────────────────────────────────────────────
// FIX: added data-automation-id (Workday), data-field, data-testid to haystack
function buildHaystack(input) {
  return [
    input.name || "",
    input.id || "",
    input.placeholder || "",
    input.getAttribute("data-automation-id") || "",
    input.getAttribute("data-field") || "",
    input.getAttribute("data-testid") || "",
    input.getAttribute("aria-label") || "",
    getLabel(input)
  ].join(" ").toLowerCase();
}

function matchKey(input) {
  const ac = input.getAttribute("autocomplete") || "";
  if (AUTOCOMPLETE_MAP[ac]) return AUTOCOMPLETE_MAP[ac];
  const hay = buildHaystack(input);
  for (const [key, pats] of Object.entries(FIELD_PATTERNS)) {
    if (pats.some(p => p.test(hay))) return key;
  }
  return null;
}

function matchKeyForRadioGroup(name, radios) {
  const hay = [name, ...radios.map(r => getLabel(r))].join(" ").toLowerCase();
  for (const [key, pats] of Object.entries(FIELD_PATTERNS)) {
    if (pats.some(p => p.test(hay))) return key;
  }
  return null;
}

// ─── Field Collection ─────────────────────────────────────────────────────────
function collectFields() {
  const fields = [];
  let uid = 0;

  // Text inputs, textareas, selects
  document.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file]):not([type=image]):not([type=checkbox]):not([type=radio]),textarea,select"
  ).forEach(el => {
    if (!isVisible(el)) return;
    fields.push({
      el, isGroup: false, uid: String(uid++),
      key: matchKey(el),
      id: el.id || el.name || "",
      label: getLabel(el),
      ph: el.placeholder || ""
    });
  });

  // Radio button groups — critical for EEOC, work auth, gender selects
  const radioGroups = new Map();
  document.querySelectorAll("input[type=radio]").forEach(r => {
    const n = r.name || r.getAttribute("data-name") || "";
    if (!n) return;
    if (!radioGroups.has(n)) radioGroups.set(n, []);
    radioGroups.get(n).push(r);
  });
  radioGroups.forEach((radios, name) => {
    if (!isVisible(radios[0])) return;
    const key = matchKeyForRadioGroup(name, radios);
    if (!key) return;
    fields.push({ el: radios, isGroup: true, uid: String(uid++), key, id: name, label: name, ph: "" });
  });

  return fields;
}

// ─── Stealth Fill ─────────────────────────────────────────────────────────────
// FIX: correct prototype selection for textarea vs input
// FIX: returns boolean so caller can count filled fields
function stealthFill(field, value) {
  if (value === undefined || value === null || value === "") return false;
  const str = String(value);
  if (field.isGroup) return fillRadioGroup(field.el, str);
  const el = field.el;
  el.focus();
  if (el.tagName === "SELECT") return fillSelect(el, str);

  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, str); else el.value = str;

  ["focus", "input", "change", "blur"].forEach(e =>
    el.dispatchEvent(new Event(e, { bubbles: true }))
  );
  // Angular ngModel trigger
  el.dispatchEvent(new Event("ngModelChange", { bubbles: true }));

  highlight(el);
  return true;
}

// FIX: exact match → value match → partial (prevents "United States" matching "United Arab Emirates")
function fillSelect(sel, value) {
  const v = value.toLowerCase().trim();
  const opts = Array.from(sel.options);
  const match =
    opts.find(o => o.text.toLowerCase().trim() === v) ||
    opts.find(o => o.value.toLowerCase().trim() === v) ||
    opts.find(o => o.text.toLowerCase().trim().startsWith(v) || v.startsWith(o.text.toLowerCase().trim())) ||
    opts.find(o => o.text.toLowerCase().includes(v));
  if (!match) return false;
  sel.value = match.value;
  ["input", "change"].forEach(e => sel.dispatchEvent(new Event(e, { bubbles: true })));
  highlight(sel);
  return true;
}

// FIX: new — handles EEOC radio groups (veteran, disability, gender) by label scoring
function fillRadioGroup(radios, value) {
  const v = value.toLowerCase().trim();
  const vWords = new Set(v.split(/\W+/).filter(w => w.length > 2));
  let best = null, bestScore = -1;

  radios.forEach(r => {
    const lbl = getLabel(r).toLowerCase();
    const rv = r.value.toLowerCase();
    const score =
      (lbl === v || rv === v) ? 100 :
      (lbl.includes(v) || v.includes(lbl)) ? 60 :
      [...vWords].filter(w => lbl.includes(w)).length * 15;
    if (score > bestScore) { bestScore = score; best = r; }
  });

  if (!best || bestScore <= 0) return false;
  best.click();
  ["input", "change"].forEach(e => best.dispatchEvent(new Event(e, { bubbles: true })));
  highlight(best.closest("label") || best);
  return true;
}

function highlight(el) {
  if (!el?.style) return;
  const prev = el.style.outline;
  el.style.transition = "outline 0.15s ease";
  el.style.outline = "2px solid #22c55e";
  setTimeout(() => { el.style.outline = prev; }, 1800);
}

// ─── DOB / Age Helpers ────────────────────────────────────────────────────────
// Parse profile DOB (stored as YYYY-MM-DD) and reformat to match what the field expects.
// Detection order: input type → placeholder → data-date-format → pattern attr → maxlength
function formatDOB(dob, el) {
  if (!dob) return dob;
  // Normalise stored value — accept YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
  let yyyy, mm, dd;
  const iso   = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us    = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);  // MM/DD/YYYY
  const eu    = dob.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);  // DD.MM.YYYY
  if (iso)  { [, yyyy, mm, dd] = iso; }
  else if (us) { [, mm, dd, yyyy] = us; }
  else if (eu) { [, dd, mm, yyyy] = eu; }
  else return dob; // unknown format — pass through as-is

  // Native date input always expects YYYY-MM-DD regardless of locale
  if (el?.type === "date") return `${yyyy}-${mm}-${dd}`;

  // Gather all format hints from the element
  const hints = [
    el?.placeholder || "",
    el?.getAttribute("data-date-format") || "",
    el?.getAttribute("data-format") || "",
    el?.getAttribute("pattern") || "",
    el?.getAttribute("data-mask") || "",
  ].join(" ").toUpperCase();

  const sep = hints.includes("/") ? "/" : hints.includes(".") ? "." : "-";

  if (/DD[\s/.-]MM[\s/.-]YYYY/.test(hints)) return `${dd}${sep}${mm}${sep}${yyyy}`;
  if (/MM[\s/.-]DD[\s/.-]YYYY/.test(hints)) return `${mm}${sep}${dd}${sep}${yyyy}`;
  if (/YYYY[\s/.-]MM[\s/.-]DD/.test(hints)) return `${yyyy}-${mm}-${dd}`;
  if (/MM[\s/.-]YYYY/.test(hints))              return `${mm}${sep}${yyyy}`;
  if (/YYYYMMDD/.test(hints))                      return `${yyyy}${mm}${dd}`;
  if (/MMDDYYYY/.test(hints))                      return `${mm}${dd}${yyyy}`;
  if (/DDMMYYYY/.test(hints))                      return `${dd}${mm}${yyyy}`;

  // Fallback: infer from maxlength
  const maxl = parseInt(el?.maxLength) || 0;
  if (maxl === 8)  return `${mm}${dd}${yyyy}`;   // MMDDYYYY compact
  if (maxl === 10) return `${mm}/${dd}/${yyyy}`; // MM/DD/YYYY (US most common 10-char)

  // Default: US format
  return `${mm}/${dd}/${yyyy}`;
}

// Calculate age (integer) from stored DOB string (YYYY-MM-DD)
function computeAge(dob) {
  const m = dob?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const birth = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age > 0 ? String(age) : null;
}

// ─── Character Limit Detection ────────────────────────────────────────────────
// Detects the max character limit for an input/textarea from multiple sources.
// Returns null if no limit is detected.
function getCharLimit(el) {
  // 1. Native maxlength (defaults: -1 for textarea, 524288 for input when unset)
  const ml = parseInt(el.maxLength);
  if (ml > 0 && ml < 100000) return ml;

  // 2. Data attributes (Workday, Greenhouse, Lever variants)
  for (const attr of ["data-maxlength","data-max-length","data-charlimit","data-char-limit","data-limit","data-max"]) {
    const v = parseInt(el.getAttribute(attr));
    if (v > 0 && v < 100000) return v;
  }

  // 3. aria-describedby counter element
  const describedBy = el.getAttribute("aria-describedby") || "";
  for (const id of describedBy.split(/\s+/).filter(Boolean)) {
    const desc = document.getElementById(id);
    if (!desc) continue;
    const t = desc.textContent.trim();
    // "250/500" or "250 of 500"
    let m = t.match(/(\d+)\s*[/]\s*(\d+)/);
    if (m) return parseInt(m[2]);
    m = t.match(/(\d+)\s+of\s+(\d+)/i);
    if (m) return parseInt(m[2]);
    // "Max 500" or "Limit: 500"
    m = t.match(/(?:max|limit|maximum)[^\d]*(\d+)/i);
    if (m) return parseInt(m[1]);
    // "250 characters remaining" → current length + remaining = total
    m = t.match(/(\d+)\s*(?:chars?|characters?)\s*(?:remaining|left)/i);
    if (m) return (el.value?.length || 0) + parseInt(m[1]);
  }

  // 4. Sibling/nearby counter elements (Workday, SmartRecruiters, iCIMS)
  const checkParents = [el.parentElement, el.parentElement?.parentElement].filter(Boolean);
  for (const parent of checkParents) {
    for (const sel of ['[class*="count"]','[class*="limit"]','[class*="remain"]','[class*="char-"]','[data-length]']) {
      try {
        const counter = parent.querySelector(sel);
        if (!counter || counter.contains(el)) continue;
        const t = counter.textContent.trim();
        let m = t.match(/(\d+)\s*[/]\s*(\d+)/);
        if (m) return parseInt(m[2]);
        m = t.match(/(?:max|limit)[^\d]*(\d+)/i);
        if (m) return parseInt(m[1]);
      } catch { /* invalid selector on exotic pages — skip */ }
    }
  }

  return null;
}

// ─── AI Candidate Gate ────────────────────────────────────────────────────────
// Only send fields to AI that are genuinely unknown custom questions.
// Basic profile fields (name, email, phone, DOB, address…) must NEVER go to AI:
// - if pattern matching missed them, AI won't do better
// - avoids wasting API quota on standard fields
function isAICandidate(field) {
  if (field.key !== null) return false;          // already matched — no AI needed
  if (field.isGroup) return false;               // radio groups: pattern match or skip

  const el = field.el;
  const elType = (el.type || "").toLowerCase();
  const tag = el.tagName;

  // Only plain text and textarea make sense for AI-generated answers
  if (tag !== "TEXTAREA" && !["text", "search", "url"].includes(elType)) return false;

  // Must have a meaningful label — AI can't help with a blank field name
  const label = (field.label || field.ph || "").trim();
  if (label.length < 8) return false;

  // If the label contains any basic-field keyword that patterns should have caught,
  // skip AI — the field either has unusual markup or is a system field.
  const basicKeywords = /\b(first[\s_]?name|last[\s_]?name|full[\s_]?name|middle[\s_]?name|email|phone|mobile|address|linkedin|github|portfolio|twitter|city|state|zip|postal|country|birthday|birth[\s_]?date|date[\s_]?of[\s_]?birth|company|employer|current[\s_]?title|salary|university|school|degree|major|gpa)\b/i;
  if (basicKeywords.test(label)) return false;

  return true; // genuine custom question — let AI handle it
}

// ─── Snapshot / Undo ──────────────────────────────────────────────────────────
let lastSnapshot = null;

function snapshotFields(fields) {
  return fields.map(f => {
    if (f.isGroup) {
      const checked = f.el.find(r => r.checked) || null;
      return { f, value: checked?.value ?? null, isGroup: true };
    }
    return { f, value: f.el.value ?? "", isGroup: false };
  });
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return;
  for (const { f, value, isGroup } of snapshot) {
    try {
      if (isGroup) {
        f.el.forEach(r => {
          const before = r.checked;
          r.checked = r.value === value;
          if (r.checked !== before)
            ["input","change"].forEach(ev => r.dispatchEvent(new Event(ev, { bubbles: true })));
        });
      } else {
        const el = f.el;
        if (el.tagName === "SELECT") {
          el.value = value ?? "";
        } else {
          const proto = el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) setter.call(el, value ?? ""); else el.value = value ?? "";
        }
        ["input","change"].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true })));
      }
    } catch { /* element may have been removed from DOM */ }
  }
}

function undoFill() {
  if (!lastSnapshot) return;
  restoreSnapshot(lastSnapshot);
  lastSnapshot = null;
  showToast("Fill undone — all fields restored", "info");
  setButtonState("idle");
}

// ─── Fill Page ────────────────────────────────────────────────────────────────
// FIX: isFilling debounce prevents concurrent fills & duplicate API calls
let isFilling = false;

// fillPage returns { filled, total, aiError } or throws { code, msg } for hard failures
async function fillPage() {
  if (isFilling) return null;
  isFilling = true;
  try {
    let profile = await sendMsg({ type: "GET_PROFILE" });

    if (!profile || !Object.keys(profile).length) {
      throw { code: "NO_PROFILE", msg: "No profile saved — open popup and fill your profile" };
    }

    if (!profile.fullName && profile.firstName && profile.lastName) {
      profile = { ...profile, fullName: `${profile.firstName} ${profile.lastName}` };
    }

    if (profile.dateOfBirth) {
      const computed = computeAge(profile.dateOfBirth);
      if (computed) profile = { ...profile, age: computed };
    }

    const settings = await sendMsg({ type: "GET_SETTINGS" });
    const fields = collectFields();

    if (!fields.length) {
      throw { code: "NO_FIELDS", msg: "No fillable fields found on this page" };
    }

    // Snapshot current field values for undo BEFORE any changes
    lastSnapshot = snapshotFields(fields);

    let filled = 0;
    const aiCandidates = [];
    const compressQueue = []; // fields whose value exceeds char limit — need AI compression

    for (const f of fields) {
      if (f.key && profile[f.key] !== undefined) {
        await delay(80 + Math.random() * 100);

        let value = profile[f.key];
        if (f.key === "dateOfBirth" && !f.isGroup) value = formatDOB(value, f.el);

        // Character limit handling — detect before fill
        if (value && !f.isGroup && f.el.tagName !== "SELECT") {
          const limit = getCharLimit(f.el);
          if (limit && String(value).length > limit) {
            if (limit < 100) {
              // Simple truncation for short fields (title, company, etc.)
              value = String(value).slice(0, limit);
            } else {
              // Long-form field — queue for AI compression (cover letter, summary, etc.)
              compressQueue.push({ f, value: String(value), limit });
              continue;
            }
          }
        }

        if (stealthFill(f, value)) filled++;
      } else if (isAICandidate(f)) {
        aiCandidates.push({ uid: f.uid, label: f.label, placeholder: f.ph, id: f.id });
      }
    }

    // AI fallback for unmatched fields
    let aiError = null;
    if (settings.aiEnabled && settings.apiKey && aiCandidates.length) {
      const mapping = await sendMsg({ type: "AI_MATCH_FIELDS", fields: aiCandidates, profile });
      if (mapping?._error) {
        aiError = mapping._error;
      } else {
        for (const f of fields) {
          const val = mapping?.[f.uid];
          if (val) {
            let finalVal = val;
            // Also check char limit on AI-generated values
            if (!f.isGroup && f.el.tagName !== "SELECT") {
              const limit = getCharLimit(f.el);
              if (limit && finalVal.length > limit) {
                if (limit < 100) {
                  finalVal = finalVal.slice(0, limit);
                } else {
                  compressQueue.push({ f, value: finalVal, limit });
                  continue;
                }
              }
            }
            await delay(80 + Math.random() * 100);
            if (stealthFill(f, finalVal)) filled++;
          }
        }
      }
    } else if (settings.aiEnabled && !settings.apiKey && aiCandidates.length) {
      aiError = "NO_API_KEY";
    }

    // AI compression for fields that exceeded their char limit
    if (compressQueue.length) {
      if (settings.aiEnabled && settings.apiKey) {
        const compressed = await sendMsg({
          type: "AI_COMPRESS_BATCH",
          items: compressQueue.map(({ f, value, limit }) => ({
            uid: f.uid, value, limit, label: f.label || f.ph || f.key
          }))
        });
        for (const { f, value, limit } of compressQueue) {
          const result = compressed?.[f.uid] || String(value).slice(0, limit);
          await delay(80 + Math.random() * 100);
          if (stealthFill(f, result)) filled++;
        }
      } else {
        // No AI — just truncate
        for (const { f, value, limit } of compressQueue) {
          await delay(80 + Math.random() * 100);
          if (stealthFill(f, String(value).slice(0, limit))) filled++;
        }
      }
    }

    return { filled, total: fields.length, aiError };
  } finally {
    isFilling = false;
  }
}

// Human-readable messages for each API error code
const AI_ERROR_MSG = {
  NO_API_KEY:    "No API key — add one in Settings",
  INVALID_KEY:   "Invalid API key (401) — check Settings",
  RATE_LIMIT:    "API rate limit hit — try again in a moment",
  SERVER_ERROR:  "AI server error — try again later",
  NETWORK_ERROR: "No internet connection for AI matching",
  API_ERROR:     "AI matching failed",
};

// Triggered by button click or keyboard shortcut; drives all button states and toasts
async function handleFill() {
  setButtonState("filling");
  try {
    const result = await fillPage();
    if (!result) return; // debounce (isFilling was true)

    const { filled, total, aiError } = result;

    if (aiError) {
      const aiMsg = AI_ERROR_MSG[aiError] || AI_ERROR_MSG.API_ERROR;
      if (filled > 0) {
        showToast(`Filled ${filled}/${total} fields · AI: ${aiMsg}`, "warning");
        setButtonState("warning", 5000);
      } else {
        showToast(aiMsg, "error");
        setButtonState("error", 5000);
      }
    } else if (filled === 0) {
      showToast("No fields matched your profile", "warning");
      setButtonState("warning", 4000);
    } else if (filled < total) {
      showToast(`Filled ${filled} of ${total} fields`, "warning", { label: "Undo", fn: undoFill });
      setButtonState("warning", 4000);
    } else {
      showToast(`Filled all ${filled} fields`, "success", { label: "Undo", fn: undoFill });
      setButtonState("success", 3000);
    }

    if (window === window.top) {
      sendMsg({ type: "FILL_ALL_FRAMES" }).catch(() => {});
    }
  } catch (err) {
    const code = err?.code;
    if (code === "NO_PROFILE") {
      showToast("No profile saved — open popup to add your details", "error");
      setButtonState("error", 6000);
    } else if (code === "NO_FIELDS") {
      showToast("No fillable fields found on this page", "info");
      setButtonState("warning", 4000);
    } else {
      const msg = err?.message || "Unknown error";
      showToast(`Error: ${msg}`, "error");
      setButtonState("error", 6000);
    }
  }
}

// ─── Field Preview (long-press) ───────────────────────────────────────────────
// Collects matched fields and shows a summary toast with a "Fill Now" action.
// Does NOT modify any field values — purely informational.
async function handlePreview() {
  setButtonState("filling");
  try {
    let profile = await sendMsg({ type: "GET_PROFILE" });
    if (!profile || !Object.keys(profile).length) {
      showToast("No profile saved — open popup to add your details", "error");
      setButtonState("error", 4000);
      return;
    }

    // Mirror fillPage() enrichment so preview counts match actual fill
    if (!profile.fullName && profile.firstName && profile.lastName) {
      profile = { ...profile, fullName: `${profile.firstName} ${profile.lastName}` };
    }
    if (profile.dateOfBirth) {
      const computed = computeAge(profile.dateOfBirth);
      if (computed) profile = { ...profile, age: computed };
    }

    const fields = collectFields();
    if (!fields.length) {
      showToast("No fillable fields found on this page", "info");
      setButtonState("warning", 3000);
      return;
    }

    const matched = [];
    for (const f of fields) {
      if (f.key && profile[f.key] !== undefined) {
        let val = String(profile[f.key]);
        if (f.key === "dateOfBirth" && !f.isGroup) val = formatDOB(val, f.el);
        const label = (f.label || f.ph || f.key).replace(/[\n\t]+/g, " ").trim().slice(0, 20);
        const preview = val.slice(0, 22) + (val.length > 22 ? "…" : "");
        matched.push(`${label} → ${preview}`);
      }
    }

    if (!matched.length) {
      showToast("No fields match your profile on this page", "warning");
      setButtonState("warning", 4000);
      return;
    }

    // Show first 3 matches + overflow count
    const shown = matched.slice(0, 3).join("  ·  ");
    const extra = matched.length > 3 ? `  +${matched.length - 3} more` : "";
    const summary = `${matched.length}/${fields.length} ready:  ${shown}${extra}`;

    showToast(summary, "info", { label: "Fill Now", fn: handleFill });
    setButtonState("idle");
  } catch (err) {
    showToast(`Preview error: ${err?.message || "Unknown"}`, "error");
    setButtonState("error", 4000);
  }
}

// ─── Button State & Toast Configuration ───────────────────────────────────────
const BTN_ICONS = {
  idle: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  filling: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" class="af-spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>`,
  success: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  warning: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};
const BTN_BG = {
  idle:    "linear-gradient(135deg,#6366f1,#8b5cf6)",
  filling: "linear-gradient(135deg,#6366f1,#8b5cf6)",
  success: "linear-gradient(135deg,#22c55e,#16a34a)",
  warning: "linear-gradient(135deg,#f59e0b,#d97706)",
  error:   "linear-gradient(135deg,#ef4444,#dc2626)",
};
const TOAST_ACCENT = {
  success: "#22c55e",
  warning: "#f59e0b",
  error:   "#ef4444",
  info:    "#6366f1",
};

// ─── Floating Button ──────────────────────────────────────────────────────────
let _showToastFn = null;
let _setButtonStateFn = null;

function injectButton() {
  if (document.getElementById("__af_host__")) return;

  const host = document.createElement("div");
  host.id = "__af_host__";
  // Clamp saved position to the current viewport so the button is never off-screen
  // (viewport may have changed since position was stored — e.g. window resize, orientation change)
  const rawPos = JSON.parse(sessionStorage.getItem("__af_pos__") || "null");
  let pos = null;
  if (rawPos && typeof rawPos.x === "number" && typeof rawPos.y === "number") {
    pos = {
      x: Math.max(0, Math.min(rawPos.x, window.innerWidth  - 56)),
      y: Math.max(0, Math.min(rawPos.y, window.innerHeight - 56)),
    };
  }
  host.style.cssText = pos
    ? `all:initial;position:fixed;z-index:2147483647;left:${pos.x}px;top:${pos.y}px;`
    : "all:initial;position:fixed;z-index:2147483647;bottom:24px;right:24px;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  // Spinner keyframe injected into shadow DOM (isolated from page CSS)
  const style = document.createElement("style");
  style.textContent = `@keyframes af-spin { to { transform: rotate(360deg); } } .af-spin { animation: af-spin .8s linear infinite; transform-origin: center; }`;
  shadow.appendChild(style);

  const btn = document.createElement("button");
  btn.title = "AutoFill (Alt+Shift+F) · Long-press to preview";
  btn.setAttribute("aria-label", "AutoFill Pro: fill this page (Alt+Shift+F)");
  btn.innerHTML = BTN_ICONS.idle;
  btn.style.cssText = "width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 4px 14px rgba(99,102,241,.5);display:flex;align-items:center;justify-content:center;transition:transform .15s,box-shadow .15s,background .25s;";

  btn.addEventListener("mouseenter", () => { btn.style.transform = "scale(1.1)"; });
  btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });

  const toast = document.createElement("div");
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");
  toast.style.cssText = "position:fixed;background:#1e1e2e;color:#e2e8f0;padding:8px 14px 8px 12px;border-radius:8px;border-left:3px solid #6366f1;font:13px/1.4 system-ui;opacity:0;transition:opacity .2s;pointer-events:none;z-index:2147483647;max-width:340px;white-space:normal;display:flex;align-items:center;gap:10px;";

  shadow.appendChild(btn);
  shadow.appendChild(toast);

  // Toast: typed with color-coded left border + optional inline action button
  let _toastTimer = null;
  _showToastFn = (message, type = "info", action = null) => {
    const r = host.getBoundingClientRect();
    toast.style.left = Math.max(8, r.left) + "px";
    toast.style.top  = Math.max(8, r.top - (action ? 66 : 52)) + "px";
    toast.style.borderLeftColor = TOAST_ACCENT[type] || TOAST_ACCENT.info;

    // Rebuild content each time
    toast.innerHTML = "";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    msgSpan.style.flex = "1";
    toast.appendChild(msgSpan);

    if (action) {
      const actionBtn = document.createElement("button");
      actionBtn.textContent = action.label;
      actionBtn.style.cssText = "background:none;border:1px solid rgba(226,232,240,0.45);border-radius:4px;color:#e2e8f0;font:600 11px/1 system-ui;padding:4px 10px;cursor:pointer;white-space:nowrap;flex-shrink:0;";
      actionBtn.addEventListener("click", () => {
        action.fn();
        toast.style.opacity = "0";
        toast.style.pointerEvents = "none";
        clearTimeout(_toastTimer);
      });
      toast.appendChild(actionBtn);
      toast.style.pointerEvents = "auto";
    } else {
      toast.style.pointerEvents = "none";
    }

    toast.style.opacity = "1";
    clearTimeout(_toastTimer);
    const dur = action ? 9000 : (type === "error" ? 4500 : 3000);
    _toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.pointerEvents = "none";
    }, dur);
  };

  // Aria label per state — describes current action to screen readers
  const BTN_ARIA = {
    idle:    "AutoFill Pro: fill this page (Alt+Shift+F)",
    filling: "AutoFill Pro: filling page…",
    success: "AutoFill Pro: fill complete",
    warning: "AutoFill Pro: fill completed with warnings",
    error:   "AutoFill Pro: fill failed",
  };

  // Button state: icon + color + aria-label + optional auto-revert to idle
  let _revertTimer = null;
  _setButtonStateFn = (state, revertMs = 0) => {
    btn.innerHTML = BTN_ICONS[state] || BTN_ICONS.idle;
    btn.style.background = BTN_BG[state] || BTN_BG.idle;
    btn.setAttribute("aria-label", BTN_ARIA[state] || BTN_ARIA.idle);
    clearTimeout(_revertTimer);
    if (revertMs > 0) {
      _revertTimer = setTimeout(() => {
        btn.innerHTML = BTN_ICONS.idle;
        btn.style.background = BTN_BG.idle;
        btn.setAttribute("aria-label", BTN_ARIA.idle);
      }, revertMs);
    }
  };

  // Short click → fill immediately  |  Long-press (500ms) → preview without filling
  // Drag flag prevents click after drag; longPress flag prevents click after preview
  let wasDragging  = false;
  let wasLongPress = false;

  let _longPressTimer = null;
  btn.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    wasLongPress = false;
    _longPressTimer = setTimeout(() => {
      _longPressTimer = null;
      wasLongPress = true;
      handlePreview();
    }, 500);
  });
  btn.addEventListener("mouseup",    () => clearTimeout(_longPressTimer));
  btn.addEventListener("mouseleave", () => clearTimeout(_longPressTimer));

  btn.addEventListener("click", () => {
    if (!wasDragging && !wasLongPress) handleFill();
    wasDragging  = false;
    wasLongPress = false;
  });

  makeDraggable(host, btn, (dragged) => { wasDragging = dragged; });
}

// FIX: cleanup functions stored so listeners can be removed; bounds clamped to viewport
function makeDraggable(host, handle, onDragEnd) {
  let ox = 0, oy = 0, dragging = false, moved = false;

  const onMouseMove = (e) => {
    if (!dragging) return;
    moved = true;
    const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - 56));
    const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - 56));
    host.style.left = x + "px"; host.style.top = y + "px";
    host.style.right = "auto"; host.style.bottom = "auto";
  };
  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    if (moved) {
      const r = host.getBoundingClientRect();
      sessionStorage.setItem("__af_pos__", JSON.stringify({ x: r.left, y: r.top }));
    }
    onDragEnd?.(moved);
    moved = false;
  };

  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true; moved = false;
    ox = e.clientX - host.getBoundingClientRect().left;
    oy = e.clientY - host.getBoundingClientRect().top;
    e.preventDefault();
  });

  // Store refs on host for cleanup
  host.__afMM = onMouseMove;
  host.__afMU = onMouseUp;
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

// ─── SPA Navigation (React / Next.js / Angular / Vue Router) ─────────────────
// FIX: button re-injects after pushState/replaceState/popstate; old button cleaned up
function handleSPANavigation() {
  let lastUrl = location.href;

  const reinject = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    const old = document.getElementById("__af_host__");
    if (old) {
      // Clean up document-level drag listeners to prevent memory leak
      document.removeEventListener("mousemove", old.__afMM);
      document.removeEventListener("mouseup", old.__afMU);
      old.remove();
    }
    setTimeout(injectButton, 600);
  };

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...a) => { origPush(...a); reinject(); };
  history.replaceState = (...a) => { origReplace(...a); reinject(); };
  window.addEventListener("popstate", reinject);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// FIX: retry loop handles "service worker not ready" race on fresh page load
function sendMsg(msg) {
  return new Promise((res, rej) => {
    const attempt = (tries) => {
      chrome.runtime.sendMessage(msg, r => {
        if (chrome.runtime.lastError) {
          if (tries > 1) setTimeout(() => attempt(tries - 1), 250);
          else rej(new Error(chrome.runtime.lastError.message));
        } else {
          res(r);
        }
      });
    };
    attempt(3);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function showToast(msg, type = "info", action = null) { _showToastFn?.(msg, type, action); }
function setButtonState(state, revertMs = 0) { _setButtonStateFn?.(state, revertMs); }

// ─── Message Listener (all frames) ───────────────────────────────────────────
// FIX: handles keyboard shortcut (TRIGGER_FILL) and iframe fill (FILL_FRAME)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "TRIGGER_FILL") {
    handleFill().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "FILL_FRAME") {
    fillPage().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
// FIX: button only injects in top-level frame; fill runs in ALL frames (all_frames: true)
// FIX: retry on settings fetch handles service worker wake-up race
(async () => {
  if (window !== window.top) return; // iframes: only respond to FILL_FRAME messages

  let settings;
  try {
    settings = await sendMsg({ type: "GET_SETTINGS" });
  } catch {
    settings = { showButton: true };
  }

  if (settings.showButton !== false) {
    injectButton();
    handleSPANavigation();
  }
})();
