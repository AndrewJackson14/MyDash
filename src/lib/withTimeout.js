// ============================================================
// withTimeout — race a promise against a timeout so slow RPCs
// can't stall the UI indefinitely. Audit finding P-9.
//
//   const { data, error } = await withTimeout(
//     supabase.rpc('recalculate_all_commissions'),
//     60_000,
//     'recalculate_all_commissions',
//   );
//
// On timeout resolves with { data: null, error: { message } } so
// callers that already destructure Supabase-shaped responses don't
// need a try/catch rewrite. Logs to console.warn for diagnostics.
// ============================================================

export async function withTimeout(promise, ms = 60_000, label = "operation") {
  let timer;
  const timeoutP = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[withTimeout] ${label} exceeded ${ms}ms`);
      resolve({ data: null, error: { message: `${label} timed out after ${ms / 1000}s` } });
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutP]);
  } finally {
    clearTimeout(timer);
  }
}
