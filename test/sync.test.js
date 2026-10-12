import { describe, it, expect, vi } from "vitest";
import { makeRemote, pushEntries } from "../src/sync.js";

const URL_BASE = "https://example.test";
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const bad = (status) => ({ ok: false, status, json: async () => ({}) });

describe("makeRemote", () => {
  it("GETs /api/data with the app key", async () => {
    const f = vi.fn().mockResolvedValue(ok({ entries: [] }));
    const { fetchData } = makeRemote(URL_BASE, "k", f);
    expect(await fetchData()).toEqual({ entries: [] });
    expect(f).toHaveBeenCalledWith(`${URL_BASE}/api/data`, { headers: { "X-App-Key": "k" } });
  });

  it("PUTs entries to /api/data with the app key", async () => {
    const f = vi.fn().mockResolvedValue(ok({ updated: "t" }));
    const { putData } = makeRemote(URL_BASE, "k", f);
    await putData([{ week: 1 }]);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${URL_BASE}/api/data`);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-App-Key": "k" });
    expect(JSON.parse(init.body)).toEqual({ entries: [{ week: 1 }] });
  });

  it("fetchData throws on a non-ok status", async () => {
    const { fetchData } = makeRemote(URL_BASE, "k", vi.fn().mockResolvedValue(bad(401)));
    await expect(fetchData()).rejects.toThrow("GET 401");
  });

  it("putData throws on a non-ok status", async () => {
    const { putData } = makeRemote(URL_BASE, "k", vi.fn().mockResolvedValue(bad(500)));
    await expect(putData([])).rejects.toThrow("PUT 500");
  });
});

describe("pushEntries", () => {
  const mkState = () => ({
    lastSyncedRef: { current: null },
    dirtyRef: { current: true },
    pendingWriteRef: { current: false },
    setSyncStatus: vi.fn(),
  });

  it("records a successful push", async () => {
    const state = mkState();
    await pushEntries(vi.fn().mockResolvedValue({ updated: "2026-01-01" }), [], state);
    expect(state.setSyncStatus).toHaveBeenLastCalledWith("synced");
    expect(state.lastSyncedRef.current).toBe("2026-01-01");
    expect(state.dirtyRef.current).toBe(false);
    expect(state.pendingWriteRef.current).toBe(false);
  });

  it("keeps dirty and reports offline on failure", async () => {
    const state = mkState();
    await pushEntries(vi.fn().mockRejectedValue(new Error("PUT 500")), [], state);
    expect(state.setSyncStatus).toHaveBeenLastCalledWith("offline");
    expect(state.dirtyRef.current).toBe(true);
    expect(state.pendingWriteRef.current).toBe(false);
  });
});
