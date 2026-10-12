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
