// Tiny safe-query helpers. Returns [] (sq) or null (sq1) on error/timeout
// instead of throwing. Inlined into the package so the hooks are
// self-contained.

export async function sq(fn) {
  try {
    const r = await Promise.race([
      fn(),
      new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 8000)),
    ])
    if (r.error) return []
    return r.data || []
  } catch {
    return []
  }
}

export async function sq1(fn) {
  try {
    const r = await Promise.race([
      fn(),
      new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 8000)),
    ])
    if (r.error) return null
    return r.data || null
  } catch {
    return null
  }
}
