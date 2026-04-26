import { describe, it, expect, vi, beforeEach } from "vitest";
import { callEndpoint, handleToolCall, runAgentLoop } from "../artifact/ClaudeDriveSender.jsx";

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── callEndpoint ──────────────────────────────────────────────────────────────

describe("callEndpoint", () => {
  it("POSTs JSON with token, action, and extra args merged", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true })
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await callEndpoint("https://example.com/exec", "secret", "uploadFile", {
      filename: "foo.txt",
      dataBase64: "aGVsbG8="
    });

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/exec");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      token: "secret",
      action: "uploadFile",
      filename: "foo.txt",
      dataBase64: "aGVsbG8="
    });
  });

  it("uses empty args object by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) }));
    await callEndpoint("https://example.com/exec", "tok", "list");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body).toEqual({ token: "tok", action: "list" });
  });
});

// ── handleToolCall ────────────────────────────────────────────────────────────

describe("handleToolCall", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true })
    }));
  });

  it("maps upload_file → action uploadFile", async () => {
    await handleToolCall("upload_file", { filename: "f.txt", mimeType: "text/plain", dataBase64: "YQ==" }, "https://ep", "tok");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body.action).toBe("uploadFile");
    expect(body.filename).toBe("f.txt");
  });

  it("maps save_claude_md → action saveClaude", async () => {
    await handleToolCall("save_claude_md", { content: "# hi", mode: "overwrite" }, "https://ep", "tok");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body.action).toBe("saveClaude");
    expect(body.content).toBe("# hi");
  });

  it("maps list_files → action list", async () => {
    await handleToolCall("list_files", {}, "https://ep", "tok");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(body.action).toBe("list");
  });

  it("returns error object for unknown tool", async () => {
    const result = await handleToolCall("unknown_tool", {}, "https://ep", "tok");
    expect(result).toEqual({ ok: false, error: "Unknown tool: unknown_tool" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ── runAgentLoop ──────────────────────────────────────────────────────────────

describe("runAgentLoop", () => {
  it("returns text and stops on end_turn", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        content: [{ type: "text", text: "Done!" }],
        stop_reason: "end_turn"
      })
    }));

    const logs = [];
    const result = await runAgentLoop("do something", "https://ep", "tok", "sk-ant-key", (m) => logs.push(m));

    expect(result).toBe("Done!");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("calls tool then stops on end_turn", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          content: [
            { type: "tool_use", id: "tu_1", name: "list_files", input: {} }
          ],
          stop_reason: "tool_use"
        })
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, files: [] })  // endpoint response
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({
          content: [{ type: "text", text: "Listed." }],
          stop_reason: "end_turn"
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    const logs = [];
    const result = await runAgentLoop("list files", "https://ep", "tok", "sk-ant-key", (m) => logs.push(m));

    expect(result).toBe("Listed.");
    expect(fetchMock).toHaveBeenCalledTimes(3); // Claude, endpoint, Claude
    expect(logs.some(l => l.includes("list_files"))).toBe(true);
  });

  it("returns max turns message after 6 turns without end_turn", async () => {
    // Each turn: one Claude call (returns tool_use) + one endpoint call (returns file list)
    const claudeResponse = () => Promise.resolve({
      json: () => Promise.resolve({
        content: [{ type: "tool_use", id: "tu_x", name: "list_files", input: {} }],
        stop_reason: "tool_use"
      })
    });
    const endpointResponse = () => Promise.resolve({
      json: () => Promise.resolve({ ok: true, files: [] })
    });

    // 6 turns × (1 Claude call + 1 endpoint call) = 12 calls, alternating
    const fetchMock = vi.fn();
    for (let i = 0; i < 6; i++) {
      fetchMock.mockResolvedValueOnce(await claudeResponse());
      fetchMock.mockResolvedValueOnce(await endpointResponse());
    }
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentLoop("loop forever", "https://ep", "tok", "sk-ant-key", () => {});
    expect(result).toBe("Max turns reached.");
  });

  it("throws when Claude returns an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: { message: "Invalid API key" } })
    }));

    await expect(
      runAgentLoop("hi", "https://ep", "tok", "bad-key", () => {})
    ).rejects.toThrow("Invalid API key");
  });
});
