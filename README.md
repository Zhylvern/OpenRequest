# OpenRequest

OpenRequest is a security-first Chrome extension that logs outgoing POST requests locally for inspection and auditability.

## Features
- Logs outgoing POST requests (URL, method, headers, body)
- Supports JSON and form-encoded bodies with defensive parsing
- Stores data locally in `chrome.storage.local` (no network calls)
- Enforces bounded retention (oldest entries discarded)
- Provides export to JSON and immediate clear
- Summary view in the popup with a full inspection dashboard

## Install (Unpacked)
### Chromium-based (Chrome, Edge, Brave)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select this project folder.

## Development
After editing files, reload the extension from `chrome://extensions`.

## Project Structure
- `manifest.json` — extension manifest (MV3)
- `background.js` — webRequest capture, parsing, storage, retention
- `popup.html` — popup summary UI
- `popup.js` — popup rendering, export, clear, dashboard link
- `dashboard.html` — full request dashboard
- `dashboard.css` — dashboard styles
- `dashboard.js` — dashboard rendering, filtering, export, clear
- `assets/` — logo assets (`assets/logo.png`, `assets/logo-512w.png`)
- `icons/` — extension icons (`icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-128.png`)

## Privacy
- All data stays on your machine.
- No external network calls or telemetry.
- Logs are bounded and user-controlled (export/clear).

## License
MIT — see `LICENSE`.
