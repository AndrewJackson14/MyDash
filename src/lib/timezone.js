// ═══════════════════════════════════════════════════════
// IANA timezone helpers for the publish scheduler
//
// All scheduled_at values are stored as UTC ISO strings. The picker
// needs to round-trip through an arbitrary IANA zone (the publication's
// home zone — see publications.timezone, mig 208) so an editor in
// New York scheduling for a California paper sees and picks Pacific
// time directly. Browser-local Date math can't do this; we use Intl.
// ═══════════════════════════════════════════════════════

const FALLBACK_TZ = 'America/Los_Angeles'

const dtfCache = new Map()
const dtf = (timeZone) => {
  if (!dtfCache.has(timeZone)) {
    dtfCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }))
  }
  return dtfCache.get(timeZone)
}

// Format a UTC instant as a "datetime-local" string (YYYY-MM-DDTHH:mm)
// in the given IANA zone. Returns "" for null/invalid input.
export const formatInTimezone = (iso, timeZone = FALLBACK_TZ) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = dtf(timeZone).formatToParts(d)
  const get = (t) => parts.find(p => p.type === t)?.value
  // Intl returns "24" for midnight in some runtimes; normalize.
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

// Parse a "datetime-local" string ("YYYY-MM-DDTHH:mm") interpreted in
// the given IANA zone → UTC ISO. Returns null for empty/invalid input.
//
// Approach: pretend the wall-clock string is UTC to get a baseline
// instant, format that baseline back in the target zone to discover
// the zone's offset at that wall-clock, then shift by the offset.
// Handles DST automatically because the offset is computed at the
// target moment, not from a fixed table.
export const parseFromTimezone = (local, timeZone = FALLBACK_TZ) => {
  if (!local) return null
  const asIfUtc = new Date(local + ':00Z').getTime()
  if (isNaN(asIfUtc)) return null
  const wallInZone = formatInTimezone(new Date(asIfUtc).toISOString(), timeZone)
  if (!wallInZone) return null
  const wallAsIfUtc = new Date(wallInZone + ':00Z').getTime()
  const offsetMs = wallAsIfUtc - asIfUtc
  return new Date(asIfUtc - offsetMs).toISOString()
}

// Return the user's browser timezone (e.g. "America/New_York"), or
// the publication-default fallback if the runtime won't tell us.
export const getBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ
  } catch {
    return FALLBACK_TZ
  }
}

// Short, friendly zone label for an IANA name at a given moment.
// Uses Intl's "long" name (e.g. "Pacific Daylight Time") and shortens
// it to the family ("Pacific Time"). DST-aware because we pass the
// instant to format. Falls back to the raw IANA string on error.
export const tzShortLabel = (timeZone, atIso = new Date().toISOString()) => {
  if (!timeZone) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'long',
    }).formatToParts(new Date(atIso))
    const long = parts.find(p => p.type === 'timeZoneName')?.value || ''
    // "Pacific Daylight Time" / "Pacific Standard Time" → "Pacific Time"
    const m = long.match(/^(.+?) (Standard|Daylight|Summer) Time$/)
    return m ? `${m[1]} Time` : long || timeZone
  } catch {
    return timeZone
  }
}

// Format a UTC instant as a human-readable wall-clock string in the
// given zone (e.g. "May 4, 2026, 6:30 AM"). Used for helper text and
// confirmation lines next to the picker.
export const fmtInTimezone = (iso, timeZone = FALLBACK_TZ) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    timeZone,
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// Curated list of common publication timezones for the settings picker.
// Covers all US zones (incl. DST-free Arizona/Hawaii) and a handful of
// internationals likely to show up. Pick more from the IANA list as
// the portfolio expands — full ~600-entry list is overkill for a UI.
export const COMMON_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
  { value: 'America/Denver',      label: 'Mountain Time (Denver)' },
  { value: 'America/Phoenix',     label: 'Mountain Time — Arizona, no DST (Phoenix)' },
  { value: 'America/Chicago',     label: 'Central Time (Chicago)' },
  { value: 'America/New_York',    label: 'Eastern Time (New York)' },
  { value: 'America/Anchorage',   label: 'Alaska Time (Anchorage)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (Honolulu)' },
  { value: 'Europe/London',       label: 'UK Time (London)' },
  { value: 'Europe/Paris',        label: 'Central European Time (Paris)' },
]
