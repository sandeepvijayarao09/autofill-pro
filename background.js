const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-4-31b-it";
const PROFILE_MAX_CHARS = 3000; // guard against oversized prompts

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension (popup, content script, devtools)
  const ownId = chrome.runtime.id;
  const fromOwnExtension = sender.id === ownId;
  if (!fromOwnExtension) {
    sendResponse({ error: "Unauthorized sender" });
    return false;
  }

  switch (msg.type) {
    case "GET_PROFILE":       getProfile().then(sendResponse); return true;
    case "SAVE_PROFILE":      saveProfile(msg.data).then(sendResponse); return true;
    case "GET_SETTINGS":      getSettings().then(sendResponse); return true;
    case "SAVE_SETTINGS":     saveSettings(msg.data).then(sendResponse); return true;
    case "AI_MATCH_FIELDS":   aiMatchFields(msg.fields, msg.profile).then(sendResponse); return true;
    case "AI_ANSWER":         aiAnswer(msg.question, msg.profile).then(sendResponse); return true;
    case "FILL_ALL_FRAMES":   fillAllFrames(sender.tab?.id).then(sendResponse); return true;
    case "AI_COMPRESS_BATCH": aiCompressBatch(msg.items).then(sendResponse); return true;
    case "AI_PARSE_RESUME":   aiParseResume(msg.text).then(sendResponse); return true;
    default:
      sendResponse({ error: `Unknown message type: ${msg.type}` });
      return false;
  }
});

// Keyboard shortcut → send TRIGGER_FILL to active tab's main frame
chrome.commands.onCommand.addListener(command => {
  if (command !== "fill-page") return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FILL" }, { frameId: 0 }, () =>
        chrome.runtime.lastError
      );
    }
  });
});

// ─── Storage ──────────────────────────────────────────────────────────────────
async function getProfile() {
  const r = await chrome.storage.local.get("profile");
  return r.profile || {};
}
async function saveProfile(data) {
  await chrome.storage.local.set({ profile: data });
  return { ok: true };
}
async function getSettings() {
  const r = await chrome.storage.local.get("settings");
  return r.settings || { apiKey: "", aiEnabled: true, showButton: true, model: DEFAULT_MODEL };
}
async function saveSettings(data) {
  await chrome.storage.local.set({ settings: data });
  return { ok: true };
}

// ─── Iframe fill (for Taleo / Workday embeds) ─────────────────────────────────
async function fillAllFrames(tabId) {
  if (!tabId) return { ok: false };
  return new Promise(resolve => {
    chrome.webNavigation.getAllFrames({ tabId }, frames => {
      if (!frames) return resolve({ ok: false });
      frames
        .filter(f => f.frameId !== 0) // main frame already handled
        .forEach(f => {
          chrome.tabs.sendMessage(tabId, { type: "FILL_FRAME" }, { frameId: f.frameId }, () =>
            chrome.runtime.lastError
          );
        });
      resolve({ ok: true });
    });
  });
}

// ─── NVIDIA API ───────────────────────────────────────────────────────────────
async function callAPI(messages, opts = {}) {
  const settings = await getSettings();
  if (!settings.apiKey) throw new Error("No API key — add it in extension Settings");
  const model = settings.model || DEFAULT_MODEL;

  const response = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream"
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.2,
      top_p: 0.95,
      stream: true,
      chat_template_kwargs: { enable_thinking: opts.thinking ?? false }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }

  // Buffer across reads to handle \r\n and chunk-split SSE lines
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        if (line.startsWith("data: ") && !line.includes("[DONE]")) {
          try {
            const data = JSON.parse(line.slice(6));
            content += data.choices?.[0]?.delta?.content || "";
          } catch { /* partial chunk, skip */ }
        }
      }
    }
  } finally {
    // Always release the reader lock, even if an error interrupts reading
    reader.cancel().catch(() => {});
  }

  return content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
}

// ─── AI Field Matching ────────────────────────────────────────────────────────
async function aiMatchFields(fields, profile) {
  try {
    // Strip private/EEOC fields before sending anything to external API
    const safeProfile = sanitizeProfileForAI(profile);
    // Guard against oversized profile blowing context window
    const profileStr = truncateProfile(safeProfile);

    const prompt = `You are a form-filling assistant. Match form fields to user profile values.
Return ONLY a valid JSON object mapping each field's "uid" to the string value to fill.
Omit uids that cannot be confidently matched. Never invent values not in the profile.

Fields (use "uid" as keys in your response):
${JSON.stringify(fields.map(f => ({ uid: f.uid, label: f.label, placeholder: f.placeholder, id: f.id })))}

Profile:
${profileStr}

Return ONLY JSON. Example: {"3": "Boston", "7": "No"}`;

    const raw = await callAPI([{ role: "user", content: prompt }], {
      maxTokens: 512, temperature: 0.1, thinking: false
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};

    const parsed = JSON.parse(match[0]);
    // Schema validation: ensure all values are strings
    const safe = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && v !== undefined) safe[k] = String(v);
    }
    return safe;
  } catch (e) {
    console.error("AI match error:", e);
    // Return _error sentinel so content.js can show the right indicator
    return { _error: classifyApiError(e.message) };
  }
}

// ─── AI Q&A ───────────────────────────────────────────────────────────────────
async function aiAnswer(question, profile) {
  try {
    // Strip private/EEOC fields before sending anything to external API
    const safeProfile = sanitizeProfileForAI(profile);
    const prompt = `Answer the user's question using their profile as context. Be concise.

Profile:
${truncateProfile(safeProfile)}

Question: ${question}`;

    const answer = await callAPI([{ role: "user", content: prompt }], {
      maxTokens: 16384, temperature: 1.0, thinking: true
    });
    return { answer };
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Fields that must NEVER be transmitted to any external AI service.
// Covers DOB, EEOC data, and other personally sensitive identifiers.
const PRIVATE_FIELDS = new Set([
  "dateOfBirth",
  "raceEthnicity",
  "veteranStatus",
  "disabilityStatus",
  "gender",
  "pronouns",
  "securityClearance",
  "visaStatus",
  "expectedSalary",
  "phone",
]);

/**
 * Return a copy of the profile with all private/EEOC fields stripped out.
 * Only call this copy when sending data to an external AI endpoint.
 */
function sanitizeProfileForAI(profile) {
  return Object.fromEntries(
    Object.entries(profile).filter(([k]) => !PRIVATE_FIELDS.has(k))
  );
}

// Maps raw error messages to stable codes consumed by content.js indicators
function classifyApiError(message) {
  if (!message)                                           return "API_ERROR";
  if (/no api key/i.test(message))                        return "NO_API_KEY";
  if (/401/.test(message))                                return "INVALID_KEY";
  if (/429/.test(message))                                return "RATE_LIMIT";
  if (/5\d\d/.test(message))                              return "SERVER_ERROR";
  if (/network|fetch|failed to fetch|ERR_/i.test(message)) return "NETWORK_ERROR";
  return "API_ERROR";
}

function truncateProfile(profile) {
  const str = JSON.stringify(profile, null, 2);
  if (str.length <= PROFILE_MAX_CHARS) return str;
  // Keep identity fields always; truncate long-form fields
  const safe = Object.fromEntries(
    Object.entries(profile).map(([k, v]) => {
      if (typeof v === "string" && v.length > 200) return [k, v.slice(0, 200) + "…"];
      return [k, v];
    })
  );
  return JSON.stringify(safe, null, 2).slice(0, PROFILE_MAX_CHARS);
}

// ─── AI Compression (character-limited fields) ────────────────────────────────
// Called when a field value exceeds its maxlength — rewrites text to fit.
async function aiCompressBatch(items) {
  if (!items || !items.length) return {};
  try {
    const itemList = items.map(item =>
      `uid "${item.uid}" (field: "${item.label}", limit: ${item.limit} chars):\n${item.value}`
    ).join("\n\n---\n\n");

    const prompt = `Rewrite each text to fit within its character limit. Preserve the most important information and professional tone. Each uid maps to one text block.

Return ONLY a valid JSON object mapping each uid to the rewritten text. No explanation.

${itemList}

Return format: {"uid1": "rewritten text under limit", "uid2": "rewritten text under limit"}`;

    const raw = await callAPI([{ role: "user", content: prompt }], {
      maxTokens: 2048, temperature: 0.3, thinking: false
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]);

    // Enforce limits as a hard safety net
    const safe = {};
    const itemMap = Object.fromEntries(items.map(i => [i.uid, i]));
    for (const [uid, text] of Object.entries(parsed)) {
      if (typeof text !== "string") continue;
      const limit = itemMap[uid]?.limit;
      safe[uid] = limit ? text.slice(0, limit) : text;
    }
    return safe;
  } catch (e) {
    console.error("AI compress error:", e);
    // Fallback: hard truncate
    return Object.fromEntries(items.map(i => [i.uid, String(i.value).slice(0, i.limit)]));
  }
}

// ─── Resume / Profile Import ───────────────────────────────────────────────────
// Parses raw resume or LinkedIn text and extracts structured profile fields.
async function aiParseResume(resumeText) {
  if (!resumeText || resumeText.trim().length < 20) {
    return { _error: "Text is too short to parse. Paste more resume content." };
  }
  try {
    const prompt = `Extract profile information from the following resume or profile text. Return ONLY a valid JSON object using exactly these keys (omit a key if the information is not clearly present — never guess or invent):

firstName, lastName, preferredName, email, phone, addressLine1, addressLine2, city, state, zipCode, country, currentTitle, currentCompany, yearsOfExp, skills, languages, linkedInUrl, githubUrl, portfolioUrl, twitterUrl, university, degree, major, graduationYear, gpa, classYear, summary, visaStatus, expectedSalary, workArrangement, jobFunction, relocation

Rules:
- skills: comma-separated string (e.g. "Python, React, SQL")
- languages: comma-separated with proficiency (e.g. "English (fluent), Spanish (conversational)")
- summary: a concise 2-3 sentence professional summary from the content
- expectedSalary: include currency symbol if present (e.g. "$120,000")
- yearsOfExp: just the number as a string
- graduationYear, gpa: strings

Resume/Profile text:
${resumeText.slice(0, 5000)}

Return ONLY valid JSON. No explanation. No markdown.`;

    const raw = await callAPI([{ role: "user", content: prompt }], {
      maxTokens: 1024, temperature: 0.1, thinking: false
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { _error: "Could not parse resume — try pasting more text" };

    const parsed = JSON.parse(match[0]);
    // Validate: only string values, no nulls/undefined
    const safe = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && v !== undefined && v !== "" && typeof v !== "object") {
        safe[k] = String(v).trim();
      }
    }

    if (!Object.keys(safe).length) return { _error: "No profile fields could be extracted" };
    return { profile: safe };
  } catch (e) {
    return { _error: e.message || "Resume parsing failed" };
  }
}
