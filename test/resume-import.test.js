// Runs the real background.js in a sandbox with chrome.* and fetch stubbed, to
// check what resume import actually sends to the AI endpoint.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

function loadBackground(modelReply) {
  const sent = [];
  const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: modelReply } }] })}\n\ndata: [DONE]\n\n`;
  const ctx = {
    console,
    TextDecoder,
    chrome: {
      runtime: { id: "test", onMessage: { addListener() {} } },
      commands: { onCommand: { addListener() {} } },
      storage: { local: { get: async () => ({ settings: { apiKey: "test-key", aiEnabled: true } }) } },
    },
    fetch: async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body) });
      const bytes = new TextEncoder().encode(sse);
      let done = false;
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () => (done ? { done: true } : ((done = true), { done: false, value: bytes })),
            cancel: async () => {},
          }),
        },
      };
    },
  };
  ctx.importScripts = file => vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "background.js"), "utf8"), ctx);
  return { ctx, sent };
}

const RESUME = `Jordan Rivera
jordan.rivera@example.com · (617) 555-0142
360 Huntington Ave, Boston, MA 02115
Software Engineer at Acme Robotics since 2021. Python, Go, Kubernetes.`;

test("resume import never sends email, phone or street address", async () => {
  const reply = JSON.stringify({ firstName: "Jordan", lastName: "Rivera", email: "[EMAIL]",
                                 currentCompany: "Acme Robotics", skills: "Python, Go, Kubernetes" });
  const { ctx, sent } = loadBackground(reply);
  const result = await ctx.aiParseResume(RESUME);

  assert.equal(sent.length, 1);
  const prompt = sent[0].body.messages.map(m => m.content).join("\n");
  for (const secret of ["jordan.rivera@example.com", "555-0142", "360 Huntington", "02115"]) {
    assert.ok(!prompt.includes(secret), `leaked to the AI: ${secret}`);
  }
  assert.ok(prompt.includes("Acme Robotics"));

  // Contact fields come back from the local extraction, not the model.
  assert.equal(result.profile.email, "jordan.rivera@example.com");
  assert.equal(result.profile.phone, "(617) 555-0142");
  assert.equal(result.profile.addressLine1, "360 Huntington Ave");
  assert.equal(result.profile.zipCode, "02115");
  assert.equal(result.profile.firstName, "Jordan");
});
