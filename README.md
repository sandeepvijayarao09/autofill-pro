# AutoFill Pro

A browser extension that fills out job applications and web forms for you.

You enter your details once (or import them from your resume), and from then on
a single click — or `Alt+Shift+F` — fills the whole form on any site. It
recognizes 44 common fields across 50+ application platforms. Everything you type
stays on your own device.

> **It's yours.** Install it, type in *your* data, and it fills forms with *your*
> data. Anyone you share it with does the same with theirs — no accounts, no
> sign-up, no server.

---

## Install (2 minutes)

1. Download or clone this folder to your computer.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Pin the **AutoFill Pro** icon to your toolbar.

> Works in Chrome, Edge, Brave, and any other Chromium browser.

## Add your data

Click the AutoFill Pro icon to open the popup, then either:

- **Type it in** — fill the Profile tab (name, contact, work, education, links)
  and click **Save Profile**, or
- **Import your resume** — drop a PDF or paste your LinkedIn text at the top of
  the Profile tab and click **Import & Fill Profile**. Review what it pulled out,
  then **Save**.

That's it. Your data is stored locally on your device and never sent anywhere.

## Use it

On any application page:

- Click the floating purple button, or press **`Alt+Shift+F`**.
- **Long-press** the button (hold ~½ second) to *preview* what will be filled
  before committing.
- After a fill, an **Undo** button appears in case you want to revert.

## Optional: AI for custom questions

Some applications ask open-ended questions ("Why do you want to work here?")
that can't be matched by a fixed field. If you want help with those:

1. Get a free API key from [NVIDIA NIM](https://build.nvidia.com).
2. Open the popup → **Settings** → paste the key → enable **AI matching**.

When AI is on, only the *question text* (and non-sensitive profile details) are
sent to draft an answer. Your date of birth, race/ethnicity, disability/veteran
status, gender, phone, and salary are **never** sent. If you leave AI off,
nothing ever leaves your device.

## Privacy in one line

No server, no tracking, no accounts. Your profile lives in your browser's local
storage and only you can see it. Full details: [privacy_policy.html](./privacy_policy.html).

---

## For tinkerers

Everything runs in plain JavaScript — no build step needed to *use* it. The
tooling below is only if you want to modify or repackage it.

```bash
npm install        # one-time: dev tooling (linter, icon generator)
npm test           # runs the 1300-case field-matching test suite
npm run lint       # style/consistency check
npm run build      # makes a clean dist/autofill-pro-v<version>.zip
```

Two test pages you can open directly in your browser to see it work:

- `test_application.html` — a realistic single job application.
- `test_form.html` — a stress test with 50+ platform variations of every field.

The field rules live in `FIELD_PATTERNS` inside `content.js` (mirrored in
`test.js`). To teach it a new field or platform, add a pattern and a test case —
`npm test` will tell you if the two ever drift out of sync.

## License

[MIT](./LICENSE) — free to use, change, and share.
