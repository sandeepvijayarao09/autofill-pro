const test = require("node:test");
const assert = require("node:assert/strict");
const { redactContactInfo, isPlaceholder } = require("../redact.js");

// Fictional person; 555-01xx numbers are reserved for fiction.
const RESUME = `Jordan Rivera
jordan.rivera@example.com | +1 (617) 555-0142 | linkedin.com/in/jordan-rivera-demo
360 Huntington Ave, Apt 4B
Boston, MA 02115

EXPERIENCE
Software Engineer, Acme Robotics (2021 - 2024)
Cut build times 40% across 12 services; on-call for 3 regions.
EDUCATION
B.S. Computer Science, 2021, GPA 3.8`;

test("removes email, phone and street address from the text", () => {
  const { text } = redactContactInfo(RESUME);
  assert.ok(!text.includes("jordan.rivera@example.com"));
  assert.ok(!text.includes("555-0142"));
  assert.ok(!text.includes("360 Huntington"));
  assert.ok(!text.includes("02115"));
  assert.ok(text.includes("[EMAIL]") && text.includes("[PHONE]"));
  assert.ok(text.includes("[STREET_ADDRESS]") && text.includes("[CITY_STATE_ZIP]"));
});

test("keeps everything the parser actually needs", () => {
  const { text } = redactContactInfo(RESUME);
  for (const kept of ["Jordan Rivera", "linkedin.com/in/jordan-rivera-demo", "Acme Robotics",
                      "2021 - 2024", "40%", "12 services", "GPA 3.8"]) {
    assert.ok(text.includes(kept), `lost: ${kept}`);
  }
});

test("returns the removed values as profile fields", () => {
  const { found } = redactContactInfo(RESUME);
  assert.equal(found.email, "jordan.rivera@example.com");
  assert.equal(found.phone, "+1 (617) 555-0142");
  assert.equal(found.addressLine1, "360 Huntington Ave, Apt 4B");
  assert.deepEqual([found.city, found.state, found.zipCode], ["Boston", "MA", "02115"]);
});

test("handles other phone formats", () => {
  for (const phone of ["617.555.0199", "617-555-0199", "+44 20 7946 0958", "+919876543210"]) {
    const { text, found } = redactContactInfo(`call ${phone} today`);
    assert.equal(text, "call [PHONE] today", phone);
    assert.equal(found.phone, phone);
  }
});

test("leaves years, percentages and short numbers alone", () => {
  const s = "Led 3 teams from 2019-2023, grew revenue 25% to $1.2M across 140 stores.";
  assert.equal(redactContactInfo(s).text, s);
});

test("empty input and placeholder detection", () => {
  assert.deepEqual(redactContactInfo(""), { text: "", found: {} });
  assert.ok(isPlaceholder("[EMAIL]"));
  assert.ok(!isPlaceholder("jordan@example.com"));
});
