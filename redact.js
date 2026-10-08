// redact.js — strip contact details from resume text before it goes to the AI.
//
// Resume import sends text to NVIDIA NIM to be split into profile fields. The
// email address, phone number and street address are easy to pull out locally
// with patterns, so they are removed here, replaced by placeholders, and merged
// back into the parsed profile on-device. The AI never sees them.
//
// Loaded by background.js via importScripts() and require()d by the tests.

const REDACT_PATTERNS = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // +1 (617) 555-0123, 617.555.0123, +44 20 7946 0958, +91 98765 43210
  phone: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}\b|\+\d{8,14}\b/g,
  // 360 Huntington Ave, 12 Oak Street Apt 4B, 1600 Amphitheatre Pkwy
  street: new RegExp(
    String.raw`\b\d{1,6}[A-Za-z]?[ \t]+(?:[A-Za-z0-9.'-]+[ \t]+){0,4}?` +
    String.raw`(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|` +
    String.raw`Terrace|Ter|Parkway|Pkwy|Circle|Cir|Highway|Hwy|Square|Sq)\b\.?` +
    String.raw`(?:,?[ \t]*(?:Apt|Apartment|Suite|Ste|Unit|#)\.?[ \t]*[A-Za-z0-9-]+)?`,
    "g"
  ),
  // Boston, MA 02115   (US city, state, ZIP)
  cityStateZip: /\b([A-Z][A-Za-z.' -]{1,30}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/g,
};

const PLACEHOLDERS = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  street: "[STREET_ADDRESS]",
  cityStateZip: "[CITY_STATE_ZIP]",
};

/**
 * Returns { text, found } where `text` has contact details replaced with
 * placeholders and `found` holds the first value of each kind as profile fields
 * (email, phone, addressLine1, city, state, zipCode).
 */
function redactContactInfo(input) {
  const found = {};
  let text = String(input || "");

  text = text.replace(REDACT_PATTERNS.email, m => {
    found.email ??= m;
    return PLACEHOLDERS.email;
  });
  // Phone before street: a phone number on the line above an address would
  // otherwise look like a house number.
  text = text.replace(REDACT_PATTERNS.phone, m => {
    if (m.replace(/\D/g, "").length < 7) return m; // too short to be a phone number
    found.phone ??= m.trim();
    return PLACEHOLDERS.phone;
  });

  text = text.replace(REDACT_PATTERNS.street, m => {
    found.addressLine1 ??= m.trim();
    return PLACEHOLDERS.street;
  });
  text = text.replace(REDACT_PATTERNS.cityStateZip, (m, city, state, zip) => {
    if (!found.zipCode) {
      found.city = city.trim();
      found.state = state;
      found.zipCode = zip;
    }
    return PLACEHOLDERS.cityStateZip;
  });
  return { text, found };
}

/** True if a value is one of our placeholders (the model sometimes echoes them). */
function isPlaceholder(value) {
  return Object.values(PLACEHOLDERS).some(p => String(value).includes(p));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { redactContactInfo, isPlaceholder, PLACEHOLDERS };
}
