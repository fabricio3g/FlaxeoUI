/**
 * Every top-level destination, read by the sidebar, mobile nav and command palette so
 * names and icons never drift apart.
 */
import type { Component } from 'vue'
import { Box, CircleHelp, Images, Settings, Sparkles, Workflow } from '@/lib/icons'

export interface NavItem {
  /** Tab id (lower-cased route name) */
  id: string
  route: string
  label: string
  description: string
  icon: Component
  /** Needs the gallery LAN permission when used from a paired browser */
  needsGallery?: boolean
  /** Hidden for paired browsers */
  desktopOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'create',
    route: 'Create',
    label: 'Create',
    description: 'Images, edits and video in sessions',
    icon: Sparkles
  },
  {
    id: 'workflows',
    route: 'Workflows',
    label: 'Workflows',
    description: 'Chain models and steps in a node graph',
    icon: Workflow
  },
  {
    id: 'assets',
    route: 'Assets',
    label: 'Assets',
    description: 'Everything you have made',
    icon: Images,
    needsGallery: true
  },
  {
    id: 'models',
    route: 'Models',
    label: 'Models',
    description: 'Install and manage models',
    icon: Box,
    desktopOnly: true
  }
]

export const NAV_FOOTER: NavItem[] = [
  {
    id: 'settings',
    route: 'Settings',
    label: 'Settings',
    description: 'Engine, performance, sharing and storage',
    icon: Settings,
    desktopOnly: true
  },
  {
    id: 'help',
    route: 'Help',
    label: 'Help',
    description: 'Guides and tips',
    icon: CircleHelp
  }
]

/** Tab id → route name for router.push */
export const TOOL_ROUTES: Record<string, string> = Object.fromEntries(
  [...NAV_ITEMS, ...NAV_FOOTER, { id: 'quantization', route: 'Quantization' }].map((item) => [
    item.id,
    item.route
  ])
)
