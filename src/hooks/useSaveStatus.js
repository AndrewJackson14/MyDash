import { useCallback, useRef, useState } from "react";

// One source of truth for save state across StoryEditor.
// status: "idle" | "saving" | "saved" | "error"
// error: { message, retry?: () => Promise<void> } | null
// lastSavedAt: Date | null
//
// Wrap any async write with `track(promise, { retry })`. The hook flips
// to "saving" immediately, then to "saved" or "error" when the promise
// settles. Retry callback (optional) is exposed on the error object so
// the UI can offer a one-click retry.
export function useSaveStatus() {
  const [status, setStatus]           = useState("idle");
  const [error, setError]             = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  // Token guards against an older save resolving after a newer one.
  const tokenRef = useRef(0);

  const track = useCallback(async (promise, opts = {}) => {
    const myToken = ++tokenRef.current;
    setStatus("saving");
    setError(null);
    try {
      const result = await promise;
      if (myToken !== tokenRef.current) return result; // superseded
      setStatus("saved");
      setLastSavedAt(new Date());
      return result;
    } catch (e) {
      if (myToken !== tokenRef.current) throw e;
      setStatus("error");
      setError({
        message: e?.message || String(e),
        retry: opts.retry || null,
      });
      throw e;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    if (status === "error") setStatus("idle");
  }, [status]);

  return { status, error, lastSavedAt, track, clearError };
}
