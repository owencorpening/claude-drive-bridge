import { useState, useRef } from "react";

const TOOLS = [
  {
    name: "upload_file",
    description: "Upload a file to the claude-uploads Google Drive folder.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Name of the file to save" },
        mimeType: { type: "string", description: "MIME type of the file" },
        dataBase64: { type: "string", description: "Base64-encoded file content" }
      },
      required: ["filename", "mimeType", "dataBase64"]
    }
  },
  {
    name: "save_claude_md",
    description: "Save or update claude.md in the claude-uploads Drive folder.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Markdown content for claude.md" },
        mode: { type: "string", enum: ["overwrite", "append"], description: "overwrite replaces the file; append adds to the end" }
      },
      required: ["content"]
    }
  },
  {
    name: "list_files",
    description: "List files currently in the claude-uploads Drive folder.",
    input_schema: { type: "object", properties: {} }
  }
];

export async function callEndpoint(endpointUrl, token, action, args = {}) {
  const body = { token, action, ...args };
  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function handleToolCall(toolName, toolInput, endpointUrl, token) {
  if (toolName === "upload_file")   return callEndpoint(endpointUrl, token, "uploadFile", toolInput);
  if (toolName === "save_claude_md") return callEndpoint(endpointUrl, token, "saveClaude", toolInput);
  if (toolName === "list_files")    return callEndpoint(endpointUrl, token, "list");
  return { ok: false, error: "Unknown tool: " + toolName };
}

export async function runAgentLoop(userMessage, endpointUrl, token, apiKey, onLog) {
  const messages = [{ role: "user", content: userMessage }];

  for (let turn = 0; turn < 6; turn++) {
    onLog("🤖 Calling Claude...");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        tools: TOOLS,
        messages
      })
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error.message);

    const textBlocks = data.content.filter(b => b.type === "text");
    const toolBlocks = data.content.filter(b => b.type === "tool_use");

    if (textBlocks.length) {
      onLog("💬 " + textBlocks.map(b => b.text).join(" "));
    }

    if (data.stop_reason === "end_turn" || toolBlocks.length === 0) {
      return textBlocks.map(b => b.text).join("\n");
    }

    messages.push({ role: "assistant", content: data.content });

    const toolResults = [];
    for (const block of toolBlocks) {
      onLog(`🔧 ${block.name} ${JSON.stringify(block.input)}`);
      const result = await handleToolCall(block.name, block.input, endpointUrl, token);
      onLog(`✅ ${JSON.stringify(result)}`);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result)
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "Max turns reached.";
}

export default function ClaudeDriveSender() {
  const [endpointUrl, setEndpointUrl] = useState("");
  const [token, setToken]             = useState("");
  const [apiKey, setApiKey]           = useState("");
  const [userMsg, setUserMsg]         = useState("");
  const [logs, setLogs]               = useState([]);
  const [running, setRunning]         = useState(false);
  const [files, setFiles]             = useState([]);
  const fileRef = useRef(null);

  const addLog = (msg) => setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg }]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(",")[1];
      setUserMsg(`Upload this file to Drive: filename="${file.name}", mimeType="${file.type || 'application/octet-stream'}", dataBase64="${b64}"`);
    };
    reader.readAsDataURL(file);
  };

  const run = async () => {
    if (!endpointUrl || !token || !apiKey || !userMsg) return;
    setRunning(true);
    setLogs([]);
    try {
      const result = await runAgentLoop(userMsg, endpointUrl, token, apiKey, addLog);
      addLog("🏁 Done: " + result);
    } catch (err) {
      addLog("❌ Error: " + err.message);
    }
    setRunning(false);
  };

  const listFiles = async () => {
    if (!endpointUrl || !token) return;
    try {
      const res = await callEndpoint(endpointUrl, token, "list");
      setFiles(res.files || []);
    } catch (err) {
      addLog("❌ " + err.message);
    }
  };

  const saveMd = async () => {
    if (!endpointUrl || !token || !apiKey || !userMsg) return;
    setRunning(true);
    setLogs([]);
    try {
      const result = await runAgentLoop(
        `Save the following as claude.md (overwrite): ${userMsg}`,
        endpointUrl, token, apiKey, addLog
      );
      addLog("🏁 " + result);
    } catch (err) {
      addLog("❌ " + err.message);
    }
    setRunning(false);
  };

  const ready = endpointUrl && token && apiKey;

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', monospace",
      background: "#0d0d0d",
      color: "#e8e8e0",
      minHeight: "100vh",
      padding: "2rem",
      maxWidth: 800,
      margin: "0 auto"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap');
        input, textarea { font-family: inherit; }
        ::placeholder { color: #555; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      <div style={{ borderLeft: "3px solid #f0c040", paddingLeft: "1rem", marginBottom: "2rem" }}>
        <div style={{ color: "#f0c040", fontSize: 11, letterSpacing: 3 }}>CLAUDE → DRIVE</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>Drive Endpoint Sender</div>
      </div>

      {/* Config */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={labelStyle}>ENDPOINT URL</label>
        <input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec" style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 12, display: "block" }}>DRIVE TOKEN</label>
        <input type="password" value={token} onChange={e => setToken(e.target.value)}
          placeholder="your-drive-secret-token" style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 12, display: "block" }}>ANTHROPIC API KEY</label>
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder="sk-ant-..." style={inputStyle} />
      </div>

      {/* Message */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>MESSAGE / CONTENT</label>
        <textarea value={userMsg} onChange={e => setUserMsg(e.target.value)} rows={5}
          placeholder="Tell Claude what to do — e.g. 'List my Drive files' or 'Save this as claude.md: # Notes...' or attach a file below"
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <button onClick={run} disabled={running || !ready || !userMsg} style={btnStyle("#f0c040", "#0d0d0d")}>
          {running ? "Running…" : "▶ Run with Claude"}
        </button>
        <button onClick={saveMd} disabled={running || !ready || !userMsg} style={btnStyle("#40c0a0", "#0d0d0d")}>
          Save as claude.md
        </button>
        <button onClick={listFiles} disabled={!endpointUrl || !token} style={btnStyle("#888", "#0d0d0d")}>
          List Drive Files
        </button>
        <button onClick={() => fileRef.current.click()} style={btnStyle("#6080f0", "#fff")}>
          📎 Attach File
        </button>
        <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginBottom: "1.5rem", background: "#1a1a1a", borderRadius: 6, padding: "1rem" }}>
          <div style={{ fontSize: 11, color: "#888", letterSpacing: 2, marginBottom: 8 }}>DRIVE FILES</div>
          {files.map(f => (
            <div key={f.fileId} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #222" }}>
              <span style={{ color: "#f0c040" }}>{f.name}</span>
              <a href={f.url} target="_blank" rel="noreferrer" style={{ color: "#40c0a0", fontSize: 11 }}>open ↗</a>
            </div>
          ))}
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div style={{ background: "#111", borderRadius: 6, padding: "1rem", maxHeight: 300, overflowY: "auto" }}>
          <div style={{ fontSize: 11, color: "#888", letterSpacing: 2, marginBottom: 8 }}>LOG</div>
          {logs.map((l, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.7, color: l.msg.startsWith("❌") ? "#f05050" : "#ccc" }}>
              <span style={{ color: "#444", marginRight: 8 }}>{l.time}</span>{l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle = { fontSize: 11, color: "#888", letterSpacing: 2 };

const inputStyle = {
  display: "block",
  width: "100%",
  background: "#1a1a1a",
  border: "1px solid #333",
  borderRadius: 4,
  color: "#e8e8e0",
  padding: "10px 12px",
  fontSize: 13,
  marginTop: 6,
  boxSizing: "border-box"
};

const btnStyle = (bg, fg) => ({
  background: bg,
  color: fg,
  border: "none",
  borderRadius: 4,
  padding: "10px 18px",
  fontSize: 12,
  fontFamily: "inherit",
  fontWeight: 600,
  letterSpacing: 1,
  cursor: "pointer"
});
