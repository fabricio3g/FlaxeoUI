/**
 * Lightweight app-wide events (avoid prop-drilling for chrome actions).
 */

export const FLAXEO_OPEN_LOGS = 'flaxeo-open-logs'

export function requestOpenLogs(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FLAXEO_OPEN_LOGS))
}

export function onOpenLogs(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const listener = (): void => handler()
  window.addEventListener(FLAXEO_OPEN_LOGS, listener)
  return () => window.removeEventListener(FLAXEO_OPEN_LOGS, listener)
}
