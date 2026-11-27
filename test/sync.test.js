import { describe, it, expect, vi } from "vitest";
import { makeRemote, pushEntries, refreshFromRemote } from "../src/sync.js";

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

describe("refreshFromRemote", () => {
  const mkState = (overrides = {}) => ({
    lastSyncedRef: { current: null },
    dirtyRef: { current: false },
    pendingWriteRef: { current: false },
    setSyncStatus: vi.fn(),
    ...overrides,
  });

  it("does not fetch when a write is pending", async () => {
    const state = mkState({ pendingWriteRef: { current: true } });
    const fetchData = vi.fn();
    const putData = vi.fn();
    await refreshFromRemote(
      { fetchData, putData, getEntries: () => [], applyRemote: vi.fn() },
      state,
    );
    expect(fetchData).not.toHaveBeenCalled();
    expect(putData).not.toHaveBeenCalled();
    expect(state.setSyncStatus).not.toHaveBeenCalled();
  });

  it("pushes dirty entries without fetching", async () => {
    const state = mkState({ dirtyRef: { current: true } });
    const fetchData = vi.fn();
    const putData = vi.fn().mockResolvedValue({ updated: "2026-03-01" });
    const entries = [{ week: 1, luke: 5 }];
    await refreshFromRemote(
      { fetchData, putData, getEntries: () => entries, applyRemote: vi.fn() },
      state,
    );
    expect(fetchData).not.toHaveBeenCalled();
    expect(putData).toHaveBeenCalledWith(entries);
    expect(state.setSyncStatus).toHaveBeenCalledWith("syncing…");
    expect(state.setSyncStatus).toHaveBeenLastCalledWith("synced");
    expect(state.lastSyncedRef.current).toBe("2026-03-01");
    expect(state.dirtyRef.current).toBe(false);
  });

  it("applies remote entries and updates lastSynced when remote is newer", async () => {
    const state = mkState({ lastSyncedRef: { current: "2026-01-01" } });
    const remoteEntries = [{ week: 1, luke: 6 }];
    const fetchData = vi.fn().mockResolvedValue({ updated: "2026-01-02", entries: remoteEntries });
    const applyRemote = vi.fn();
    await refreshFromRemote(
      { fetchData, putData: vi.fn(), getEntries: () => [], applyRemote },
      state,
    );
    expect(applyRemote).toHaveBeenCalledWith(remoteEntries);
    expect(state.lastSyncedRef.current).toBe("2026-01-02");
    expect(state.setSyncStatus).toHaveBeenCalledWith("synced");
  });

  it("does not call applyRemote when updated matches lastSynced", async () => {
    const state = mkState({ lastSyncedRef: { current: "2026-01-01" } });
    const fetchData = vi.fn().mockResolvedValue({ updated: "2026-01-01", entries: [{ week: 1 }] });
    const applyRemote = vi.fn();
    await refreshFromRemote(
      { fetchData, putData: vi.fn(), getEntries: () => [], applyRemote },
      state,
    );
    expect(applyRemote).not.toHaveBeenCalled();
    expect(state.lastSyncedRef.current).toBe("2026-01-01");
    expect(state.setSyncStatus).toHaveBeenCalledWith("synced");
  });

  it("sets status to offline when fetch fails", async () => {
    const state = mkState();
    const fetchData = vi.fn().mockRejectedValue(new Error("network error"));
    const applyRemote = vi.fn();
    await refreshFromRemote(
      { fetchData, putData: vi.fn(), getEntries: () => [], applyRemote },
      state,
    );
    expect(applyRemote).not.toHaveBeenCalled();
    expect(state.setSyncStatus).toHaveBeenCalledWith("offline");
  });

  it("does not update state or call applyRemote when cancelled", async () => {
    let cancelled = false;
    const state = mkState({ lastSyncedRef: { current: "2026-01-01" } });
    const fetchData = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return { updated: "2026-01-02", entries: [{ week: 1 }] };
    });
    const applyRemote = vi.fn();
    await refreshFromRemote(
      {
        fetchData,
        putData: vi.fn(),
        getEntries: () => [],
        applyRemote,
        isCancelled: () => cancelled,
      },
      state,
    );
    expect(applyRemote).not.toHaveBeenCalled();
    expect(state.lastSyncedRef.current).toBe("2026-01-01");
    expect(state.setSyncStatus).not.toHaveBeenCalled();

    let rejectCancelled = false;
    const failingFetch = vi.fn().mockImplementation(async () => {
      rejectCancelled = true;
      throw new Error("network error");
    });
    await refreshFromRemote(
      {
        fetchData: failingFetch,
        putData: vi.fn(),
        getEntries: () => [],
        applyRemote,
        isCancelled: () => rejectCancelled,
      },
      state,
    );
    expect(state.setSyncStatus).not.toHaveBeenCalled();
  });

  it("does not call setSyncStatus when cancelled during dirty push", async () => {
    let cancelled = false;
    const state = mkState({ dirtyRef: { current: true } });
    const putData = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return { updated: "2026-03-01" };
    });
    await refreshFromRemote(
      {
        fetchData: vi.fn(),
        putData,
        getEntries: () => [{ week: 1 }],
        applyRemote: vi.fn(),
        isCancelled: () => cancelled,
      },
      state,
    );
    expect(state.setSyncStatus).toHaveBeenCalledWith("syncing…");
    expect(state.setSyncStatus).not.toHaveBeenCalledWith("synced");

    let rejectCancelled = false;
    const failingState = mkState({ dirtyRef: { current: true } });
    const failingPut = vi.fn().mockImplementation(async () => {
      rejectCancelled = true;
      throw new Error("network error");
    });
    await refreshFromRemote(
      {
        fetchData: vi.fn(),
        putData: failingPut,
        getEntries: () => [{ week: 1 }],
        applyRemote: vi.fn(),
        isCancelled: () => rejectCancelled,
      },
      failingState,
    );
    expect(failingState.setSyncStatus).toHaveBeenCalledWith("syncing…");
    expect(failingState.setSyncStatus).not.toHaveBeenCalledWith("offline");
  });
});
