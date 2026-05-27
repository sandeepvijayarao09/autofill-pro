# AutoFill Pro — Chrome Extension

Fill job applications instantly across 30+ ATS platforms. Pattern-matches 44 profile fields locally. AI fallback (NVIDIA Gemma 4) for custom questions only. All data stays on your device.

## Features

- **Instant fill** — one click or `Alt+Shift+F` fills the whole page
- **Long-press preview** — hold the button 500ms to see what will be filled before committing
- **Undo** — toast button restores the page to its state before fill
- **Character limit aware** — detects `maxlength`, `aria-describedby` counters, sibling counter divs; AI compresses long-form text to fit
- **Resume import** — drop a PDF or paste LinkedIn text; AI extracts all 44 profile fields
- **Ask AI** — answer custom essay questions using your profile as context
- **Privacy-first** — DOB, EEOC fields (race, disability, veteran), gender, salary never sent to any external API
- **SPA support** — works across React, Angular, Vue Router single-page apps
- **iframe support** — fills Workday and Taleo embedded form iframes
- **WCAG 2.1 AA** — fully keyboard navigable, screen-reader compatible

## ATS platforms tested

Workday · Greenhouse · Lever · Taleo · iCIMS · SmartRecruiters · Ashby · Rippling · Jobvite · JazzHR · BreezyHR · SAP SuccessFactors · Recruitee · Pinpoint · Personio · Meta · Amazon · Microsoft · Apple · 15+ more

## Installation (developer mode)

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select this folder

## Running tests

```bash
node test.js
```

424 test cases covering all ATS platforms, field variations, false positives, DOB format detection, age computation, and FIELD_PATTERNS sync between `test.js` and `content.js`.

## AI setup (optional)

1. Get a free API key from [NVIDIA NIM](https://build.nvidia.com)
2. Open the extension popup → Settings → paste key
3. Enable "AI matching for unknown fields"

Only unmatched custom question labels are sent to the API — never your profile values, DOB, or EEOC data.

## Privacy

See [privacy_policy.html](./privacy_policy.html) or the live policy at:  
`https://sandeepvijayarao09.github.io/autofill-pro/privacy_policy.html`

## License

MIT
