import type { Component } from 'vue'
import { Cpu, FolderOpen, Settings, Share2 } from '@/lib/icons'

/** Settings pages, listed in the main sidebar and on the Settings page itself. */
export type SettingsCategory = 'engine' | 'sharing' | 'storage' | 'general'

export interface SettingsCategoryInfo {
  id: SettingsCategory
  label: string
  description: string
  icon: Component
  /** Only the desktop app (not a paired browser) can change it */
  desktopOnly: boolean
}

export const SETTINGS_CATEGORIES: SettingsCategoryInfo[] = [
  {
    id: 'engine',
    label: 'Engine & performance',
    description: 'The stable-diffusion.cpp engine Flaxeo runs, and how this computer runs it.',
    icon: Cpu,
    desktopOnly: true
  },
  {
    id: 'sharing',
    label: 'Sharing',
    description: 'Let phones and other computers on your network use this one.',
    icon: Share2,
    desktopOnly: true
  },
  {
    id: 'storage',
    label: 'Storage',
    description: 'Where your images, temporary files and models live.',
    icon: FolderOpen,
    desktopOnly: true
  },
  {
    id: 'general',
    label: 'General',
    description: 'Your name, theme and version.',
    icon: Settings,
    desktopOnly: false
  }
]

const isDesktop = (): boolean => typeof window !== 'undefined' && Boolean(window.electronAPI)

export function availableSettingsCategories(): SettingsCategoryInfo[] {
  return SETTINGS_CATEGORIES.filter((c) => isDesktop() || !c.desktopOnly)
}

/** The category a `?category=` value means (falls back to the first available one). */
export function settingsCategoryFrom(value: unknown): SettingsCategory {
  const available = availableSettingsCategories()
  return available.find((c) => c.id === value)?.id || available[0].id
}
