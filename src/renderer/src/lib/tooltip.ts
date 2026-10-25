/**
 * `v-tip` — a tooltip with an optional keyboard shortcut, for any element (including
 * popover triggers, where wrapping in <Tooltip> breaks as-child chains).
 *
 *   <button v-tip="'Attach images'">…</button>
 *   <button v-tip="{ text: 'Hide sidebar', keys: 'Mod+\\' }">…</button>
 *
 * `Mod` shows as ⌘ on macOS and Ctrl elsewhere. One shared element, shown after a short
 * delay on hover or keyboard focus, positioned below the element (above when no room).
 */
import type { Directive } from 'vue'

export type TipValue = string | { text: string; keys?: string } | null | undefined

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '')

/** "Mod+Shift+Z" → ["⌘", "⇧", "Z"] on macOS, ["Ctrl", "Shift", "Z"] elsewhere. */
export function shortcutKeys(keys: string): string[] {
  return keys.split('+').map((key) => {
    if (key === 'Mod') return IS_MAC ? '⌘' : 'Ctrl'
    if (key === 'Shift') return IS_MAC ? '⇧' : 'Shift'
    if (key === 'Alt') return IS_MAC ? '⌥' : 'Alt'
    return key
  })
}

let tip: HTMLDivElement | null = null
let showTimer = 0
let current: HTMLElement | null = null
const values = new WeakMap<HTMLElement, TipValue>()

function element(): HTMLDivElement {
  if (tip) return tip
  tip = document.createElement('div')
  tip.setAttribute('role', 'tooltip')
  tip.className =
    'pointer-events-none fixed z-[999] flex max-w-xs items-center gap-2 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-md'
  tip.style.display = 'none'
  document.body.appendChild(tip)
  return tip
}

function render(value: TipValue): boolean {
  const text = typeof value === 'string' ? value : value?.text
  if (!text) return false
  const box = element()
  box.replaceChildren(document.createTextNode(text))
  const keys = typeof value === 'object' && value?.keys ? shortcutKeys(value.keys) : []
  if (keys.length) {
    const group = document.createElement('span')
    group.className = 'flex items-center gap-0.5'
    for (const key of keys) {
      const kbd = document.createElement('kbd')
      kbd.className =
        'rounded bg-background/20 px-1 font-sans text-[11px] leading-4 text-background/90'
      kbd.textContent = key
      group.appendChild(kbd)
    }
    box.appendChild(group)
  }
  return true
}

function show(el: HTMLElement): void {
  window.clearTimeout(showTimer)
  showTimer = window.setTimeout(() => {
    if (!el.isConnected || !render(values.get(el))) return
    const box = element()
    box.style.display = 'flex'
    const rect = el.getBoundingClientRect()
    const width = box.offsetWidth
    const height = box.offsetHeight
    const below = rect.bottom + 6 + height <= window.innerHeight
    box.style.top = `${below ? rect.bottom + 6 : rect.top - 6 - height}px`
    box.style.left = `${Math.max(6, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 6))}px`
    current = el
  }, 350)
}

function hide(): void {
  window.clearTimeout(showTimer)
  if (tip) tip.style.display = 'none'
  current = null
}

const listeners = new WeakMap<HTMLElement, { enter: () => void; leave: () => void }>()

export const vTip: Directive<HTMLElement, TipValue> = {
  mounted(el, binding) {
    values.set(el, binding.value)
    const label = typeof binding.value === 'string' ? binding.value : binding.value?.text
    if (label && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label)
    const enter = (): void => show(el)
    const leave = (): void => hide()
    listeners.set(el, { enter, leave })
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('focusin', enter)
    el.addEventListener('focusout', leave)
    el.addEventListener('pointerdown', leave)
  },
  updated(el, binding) {
    values.set(el, binding.value)
    if (current === el) render(binding.value)
  },
  beforeUnmount(el) {
    const handlers = listeners.get(el)
    if (handlers) {
      el.removeEventListener('pointerenter', handlers.enter)
      el.removeEventListener('pointerleave', handlers.leave)
      el.removeEventListener('focusin', handlers.enter)
      el.removeEventListener('focusout', handlers.leave)
      el.removeEventListener('pointerdown', handlers.leave)
    }
    if (current === el) hide()
  }
}
