// Remote sync helpers: Worker requests and the shared "push local edits" routine.

export const makeRemote = (workerUrl, appKey, fetchImpl = (...a) => fetch(...a)) => {
  const url = `${workerUrl}/api/data`;
  const fetchData = async () => {
    const res = await fetchImpl(url, { headers: { "X-App-Key": appKey } });
    if (!res.ok) throw new Error(`GET ${res.status}`);
    return res.json();
  };
  const putData = async (entries) => {
    const res = await fetchImpl(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-App-Key": appKey },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) throw new Error(`PUT ${res.status}`);
    return res.json();
  };
  return { fetchData, putData };
};

// Pushes entries to the Worker and records the outcome on the shared refs.
// state: { lastSyncedRef, dirtyRef, pendingWriteRef, setSyncStatus }
export const pushEntries = async (putData, entries, state) => {
  const { lastSyncedRef, dirtyRef, pendingWriteRef, setSyncStatus } = state;
  pendingWriteRef.current = true;
  try {
    const res = await putData(entries);
    lastSyncedRef.current = res.updated || null;
    dirtyRef.current = false;
    setSyncStatus("synced");
  } catch {
    setSyncStatus("offline");
  } finally {
    pendingWriteRef.current = false;
  }
};

// Handles focus / visibility refresh: pushes unflushed local edits if dirty,
// otherwise fetches the latest remote data and applies it if newer.
// Skips UI state updates if isCancelled returns true after an await.
export const refreshFromRemote = async (
  { fetchData, putData, getEntries, applyRemote, isCancelled },
  state,
) => {
  if (state.pendingWriteRef.current) return;
  if (state.dirtyRef.current) {
    state.setSyncStatus("syncing…");
    await pushEntries(putData, getEntries(), state);
    return;
  }
  try {
    const remote = await fetchData();
    if (isCancelled?.()) return;
    if (
      remote?.updated &&
      remote.updated !== state.lastSyncedRef.current &&
      Array.isArray(remote.entries)
    ) {
      applyRemote(remote.entries);
      state.lastSyncedRef.current = remote.updated;
    }
    state.setSyncStatus("synced");
  } catch {
    if (!isCancelled?.()) {
      state.setSyncStatus("offline");
    }
  }
};
