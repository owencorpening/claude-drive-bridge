/**
 * Claude Drive Endpoint
 * Google Apps Script Web App
 *
 * Endpoints:
 *   POST /exec  { action: "uploadFile", filename, mimeType, dataBase64 }
 *   POST /exec  { action: "saveClaude", content, mode? }   mode = "overwrite"|"append" (default: overwrite)
 *   GET  /exec  { action: "list" }   — list files in claude-uploads
 *
 * Deploy as:
 *   Execute as: Me
 *   Who has access: Anyone  (or Anyone with Google account if you prefer)
 *
 * Set BEARER_TOKEN below to a secret string.
 * Pass it from the caller as header:  Authorization: Bearer <token>
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
const BEARER_TOKEN   = PropertiesService.getScriptProperties().getProperty('DRIVE_BEARER_TOKEN');
const FOLDER_NAME    = "claude-uploads";
const CLAUDE_MD_NAME = "claude.md";
// ─────────────────────────────────────────────────────────────────────────────


// ── ENTRY POINTS ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!checkAuth(e)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const body   = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === "uploadFile") return handleUploadFile(body);
    if (action === "saveClaude") return handleSaveClaude(body);

    return jsonResponse({ ok: false, error: "Unknown action: " + action }, 400);

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

function doGet(e) {
  try {
    if (!checkAuth(e)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const action = (e.parameter && e.parameter.action) || "list";
    if (action === "list") return handleList();

    return jsonResponse({ ok: false, error: "Unknown action: " + action }, 400);

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}


// ── HANDLERS ──────────────────────────────────────────────────────────────────

/**
 * Upload any file (base64-encoded) into the claude-uploads folder.
 * Body: { action, filename, mimeType, dataBase64 }
 */
function handleUploadFile(body) {
  const { filename, mimeType, dataBase64 } = body;
  if (!filename || !dataBase64) {
    return jsonResponse({ ok: false, error: "filename and dataBase64 are required" }, 400);
  }

  const folder = getOrCreateFolder(FOLDER_NAME);
  const blob   = Utilities.newBlob(
    Utilities.base64Decode(dataBase64),
    mimeType || "application/octet-stream",
    filename
  );

  // Overwrite if same name exists
  const existing = folder.getFilesByName(filename);
  if (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  const file = folder.createFile(blob);
  return jsonResponse({
    ok: true,
    action: "uploadFile",
    filename: filename,
    fileId: file.getId(),
    url: file.getUrl()
  });
}

/**
 * Save or update claude.md in the claude-uploads folder.
 * Body: { action, content, mode? }  mode = "overwrite" | "append"
 */
function handleSaveClaude(body) {
  const content = body.content || "";
  const mode    = body.mode || "overwrite";

  const folder   = getOrCreateFolder(FOLDER_NAME);
  const existing = folder.getFilesByName(CLAUDE_MD_NAME);

  let file;

  if (existing.hasNext()) {
    file = existing.next();
    if (mode === "append") {
      const current = file.getBlob().getDataAsString();
      file.setContent(current + "\n\n" + content);
    } else {
      // overwrite
      file.setContent(content);
    }
  } else {
    file = folder.createFile(CLAUDE_MD_NAME, content, "text/plain");
  }

  return jsonResponse({
    ok: true,
    action: "saveClaude",
    mode: mode,
    fileId: file.getId(),
    url: file.getUrl()
  });
}

/**
 * List files in the claude-uploads folder.
 */
function handleList() {
  const folder = getOrCreateFolder(FOLDER_NAME);
  const iter   = folder.getFiles();
  const files  = [];

  while (iter.hasNext()) {
    const f = iter.next();
    files.push({
      name:    f.getName(),
      fileId:  f.getId(),
      url:     f.getUrl(),
      updated: f.getLastUpdated().toISOString()
    });
  }

  return jsonResponse({ ok: true, folder: FOLDER_NAME, count: files.length, files: files });
}


// ── HELPERS ───────────────────────────────────────────────────────────────────

function getOrCreateFolder(name) {
  const root   = DriveApp.getRootFolder();
  const iter   = root.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return root.createFolder(name);
}

function checkAuth(e) {
  // Check Authorization header first (POST requests)
  const authHeader = (e.parameter && e.parameter.token) ||
                     (e.postData && getAuthHeader(e));
  return authHeader === BEARER_TOKEN;
}

/**
 * Apps Script doesn't expose request headers directly.
 * Pass the token as a query param:  ?token=<BEARER_TOKEN>
 * OR include it in the POST body:   { ..., token: "<BEARER_TOKEN>" }
 */
function getAuthHeader(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return body.token || null;
  } catch (_) {
    return null;
  }
}

function jsonResponse(data, statusCode) {
  // Apps Script doPost/doGet must return ContentService output
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
