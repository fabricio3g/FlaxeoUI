/**
 * Lightweight app-wide events (avoid prop-drilling for chrome actions).
 */

export const FLAXEO_OPEN_LOGS = 'flaxeo-open-logs'
export const FLAXEO_STARTER_PROMPT = 'flaxeo-starter-prompt'
export const FLAXEO_OPEN_HISTORY = 'flaxeo-open-history'
/** Composer popovers: recipes | prompt-presets — only one open at a time */
export const FLAXEO_COMPOSER_POPOVER = 'flaxeo-composer-popover'

export type ComposerPopoverId = 'recipes' | 'prompt-presets'

export function notifyComposerPopoverOpen(id: ComposerPopoverId): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FLAXEO_COMPOSER_POPOVER, { detail: { id } }))
}

export function onComposerPopoverOpen(
  handler: (id: ComposerPopoverId) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const listener = (event: Event): void => {
    const ce = event as CustomEvent<{ id?: ComposerPopoverId }>
    if (ce.detail?.id) handler(ce.detail.id)
  }
  window.addEventListener(FLAXEO_COMPOSER_POPOVER, listener)
  return () => window.removeEventListener(FLAXEO_COMPOSER_POPOVER, listener)
}

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

export interface StarterPromptDetail {
  prompt: string
  fromOnboarding?: boolean
}

/** Apply a starter / sample prompt on Text2Image even when the view is keep-alive cached. */
export function requestStarterPrompt(detail: StarterPromptDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FLAXEO_STARTER_PROMPT, { detail }))
}

export function onStarterPrompt(handler: (detail: StarterPromptDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const listener = (event: Event): void => {
    const ce = event as CustomEvent<StarterPromptDetail>
    if (ce.detail?.prompt != null) handler(ce.detail)
  }
  window.addEventListener(FLAXEO_STARTER_PROMPT, listener)
  return () => window.removeEventListener(FLAXEO_STARTER_PROMPT, listener)
}

export interface HistoryPanelAnchor {
  top: number
  left: number
  right: number
  bottom: number
  width: number
}

export interface OpenHistoryDetail {
  /** Position panel below this rect (e.g. Gallery toolbar button). */
  anchor?: HistoryPanelAnchor | null
}

export function requestOpenHistory(detail?: OpenHistoryDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FLAXEO_OPEN_HISTORY, { detail: detail ?? {} }))
}

export function onOpenHistory(handler: (detail: OpenHistoryDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const listener = (event: Event): void => {
    const ce = event as CustomEvent<OpenHistoryDetail>
    handler(ce.detail ?? {})
  }
  window.addEventListener(FLAXEO_OPEN_HISTORY, listener)
  return () => window.removeEventListener(FLAXEO_OPEN_HISTORY, listener)
}
