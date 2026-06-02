// Small formatting helpers shared across the UI and the report builder.

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** ms → "1m 27s" / "27.4s" / "320ms" (simulated agent time). */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

/** ms → "01:27" clock for the timeline axis. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return `${n}`
}

export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}
