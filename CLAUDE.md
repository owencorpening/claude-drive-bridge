# CLAUDE.md — claude-drive-bridge

## What this is

Two-part bridge that lets Claude (web/artifact) push files and notes directly into Google Drive:

1. **`apps-script/claude_drive_endpoint.gs`** — Google Apps Script Web App. Deploy to script.google.com. Accepts POST to upload files, save/append `claude.md`, or list files in the `claude-uploads` Drive folder.
2. **`artifact/ClaudeDriveSender.jsx`** — React UI. Run as a Claude artifact (paste into claude.ai) or locally. Provides an agentic loop: user message → Claude with tools → Drive endpoint.

## Deploy workflow

### Apps Script (one-time + on change)
1. Go to script.google.com → New project → name it `claude-drive-endpoint`
2. Paste `apps-script/claude_drive_endpoint.gs`
3. Set `BEARER_TOKEN` to a long random string
4. Deploy → Web app → Execute as: Me → Access: Anyone → copy URL

### Artifact UI
- Paste `artifact/ClaudeDriveSender.jsx` into claude.ai as a React artifact
- Enter Endpoint URL, Drive token, and Anthropic API key in the UI

## Auth

- Drive endpoint: token passed in POST body as `token` field (Apps Script can't read headers)
- Anthropic API: `x-api-key` header with `anthropic-dangerous-direct-browser-access: true` (required for browser direct calls)

## Endpoints

| Action | Method | Body fields |
|--------|--------|-------------|
| Upload file | POST | `action: "uploadFile"`, `filename`, `mimeType`, `dataBase64` |
| Save claude.md | POST | `action: "saveClaude"`, `content`, `mode: "overwrite"\|"append"` |
| List files | POST | `action: "list"` |

## Deployed endpoint

```
https://script.google.com/macros/s/AKfycbzlwyTMGoMLBjN893-N10xyAJharUFwLzLVnQ2OC4qkiMvs7IE7hEW-aWEq_lE-1-zV/exec
```

## Credentials (never commit)

- `BEARER_TOKEN` — set in the .gs file before deploying; rotate in Apps Script editor
- `ANTHROPIC_API_KEY` — entered in the UI at runtime, never stored
