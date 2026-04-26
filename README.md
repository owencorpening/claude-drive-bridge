# claude-drive-bridge

A two-part bridge that lets Claude (running as a web artifact on claude.ai) push files and notes directly into Google Drive.

## How it works

1. **`apps-script/claude_drive_endpoint.gs`** — Google Apps Script web app that accepts POST requests to upload files, save/append a `claude.md` note, or list files in a `claude-uploads` Drive folder.
2. **`artifact/ClaudeDriveSender.jsx`** — React UI meant to run as a Claude artifact (or locally via Vite). Runs an agentic loop: your message → Claude API with Drive tools → Drive endpoint.

## Setup

### 1. Deploy the Apps Script endpoint

1. Go to [script.google.com](https://script.google.com) → New project → name it `claude-drive-endpoint`
2. Paste `apps-script/claude_drive_endpoint.gs`
3. Set `BEARER_TOKEN` to a long random string in Script Properties
4. Deploy → Web app → Execute as: **Me** → Access: **Anyone** → copy the URL

### 2. Run the artifact UI

**As a Claude artifact:**
- Paste `artifact/ClaudeDriveSender.jsx` into claude.ai as a React artifact
- Enter your endpoint URL, Drive token, and Anthropic API key in the UI

**Locally:**
```bash
npm install
npm run dev
```

## API

All requests are POST to the Apps Script endpoint URL.

| Action | Body fields |
|--------|-------------|
| Upload file | `action: "uploadFile"`, `filename`, `mimeType`, `dataBase64` |
| Save/append note | `action: "saveClaude"`, `content`, `mode: "overwrite"\|"append"` |
| List files | `action: "list"` |

Include `token: "<your bearer token>"` in every request body.

## Auth

- **Drive endpoint:** token passed as `token` field in POST body (Apps Script can't read headers)
- **Anthropic API:** `x-api-key` header + `anthropic-dangerous-direct-browser-access: true` (required for browser-direct calls)

## Credentials

Never commit credentials. Two secrets are required at runtime:

- `BEARER_TOKEN` — set in Apps Script → Project Settings → Script Properties; rotate there
- `ANTHROPIC_API_KEY` — entered in the UI, never stored
