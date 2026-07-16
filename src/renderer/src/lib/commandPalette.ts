/**
 * Command palette catalog — jump to screens, settings, and folder actions.
 */
import type { Component } from 'vue'
import {
  BookOpen,
  Brush,
  Database,
  FolderOpen,
  ImageIcon,
  Images,
  Scale,
  Settings,
  Video
} from '@/lib/icons'

export type CommandGroup = 'Navigate' | 'Settings' | 'Actions'

export type CommandAction =
  | { type: 'tab'; tab: string }
  | { type: 'settings'; category?: string }
  | { type: 'folder'; which: 'models' | 'gallery' }

export interface CommandItem {
  id: string
  label: string
  subtitle?: string
  keywords: string[]
  group: CommandGroup
  icon: Component
  action: CommandAction
}

export const COMMAND_PALETTE_ITEMS: CommandItem[] = [
  {
    id: 'nav-image',
    label: 'Image',
    subtitle: 'Text to image',
    keywords: ['text2image', 't2i', 'generate', 'picture'],
    group: 'Navigate',
    icon: ImageIcon,
    action: { type: 'tab', tab: 'text2image' }
  },
  {
    id: 'nav-edit',
    label: 'Edit',
    subtitle: 'Inpaint, Img2Img, Ref Edit',
    keywords: ['inpaint', 'img2img', 'ref', 'mask'],
    group: 'Navigate',
    icon: Brush,
    action: { type: 'tab', tab: 'edit' }
  },
  {
    id: 'nav-video',
    label: 'Video',
    subtitle: 'T2V, I2V, FLF2V',
    keywords: ['t2v', 'i2v', 'movie', 'clip'],
    group: 'Navigate',
    icon: Video,
    action: { type: 'tab', tab: 'video' }
  },
  {
    id: 'nav-gallery',
    label: 'Gallery',
    subtitle: 'Browse outputs',
    keywords: ['outputs', 'images', 'history', 'library'],
    group: 'Navigate',
    icon: Images,
    action: { type: 'tab', tab: 'gallery' }
  },
  {
    id: 'nav-quantize',
    label: 'Quantize',
    subtitle: 'Convert models',
    keywords: ['gguf', 'quantize', 'convert'],
    group: 'Navigate',
    icon: Scale,
    action: { type: 'tab', tab: 'quantization' }
  },
  {
    id: 'nav-help',
    label: 'Help',
    subtitle: 'Guides and tips',
    keywords: ['docs', 'guide', 'manual', 'how'],
    group: 'Navigate',
    icon: BookOpen,
    action: { type: 'tab', tab: 'help' }
  },
  {
    id: 'settings-root',
    label: 'Settings',
    subtitle: 'Open settings',
    keywords: ['preferences', 'options', 'config'],
    group: 'Settings',
    icon: Settings,
    action: { type: 'settings' }
  },
  {
    id: 'settings-backend',
    label: 'Backend',
    subtitle: 'Settings · Runtime',
    keywords: ['sd-cli', 'binary', 'runtime', 'api'],
    group: 'Settings',
    icon: Database,
    action: { type: 'settings', category: 'backend' }
  },
  {
    id: 'settings-installation',
    label: 'Installation',
    subtitle: 'Settings · Install releases',
    keywords: ['download', 'install', 'release', 'update'],
    group: 'Settings',
    icon: Settings,
    action: { type: 'settings', category: 'installation' }
  },
  {
    id: 'settings-network',
    label: 'Network',
    subtitle: 'Settings · LAN sharing',
    keywords: ['lan', 'remote', 'pair', 'share'],
    group: 'Settings',
    icon: Settings,
    action: { type: 'settings', category: 'network' }
  },
  {
    id: 'settings-storage',
    label: 'Storage',
    subtitle: 'Settings · Paths',
    keywords: ['folder', 'disk', 'models root', 'output', 'path'],
    group: 'Settings',
    icon: FolderOpen,
    action: { type: 'settings', category: 'storage' }
  },
  {
    id: 'settings-appearance',
    label: 'Appearance',
    subtitle: 'Settings · Theme',
    keywords: ['theme', 'dark', 'light', 'ui'],
    group: 'Settings',
    icon: Settings,
    action: { type: 'settings', category: 'appearance' }
  },
  {
    id: 'action-models-folder',
    label: 'Open Models folder',
    subtitle: 'Show models on disk',
    keywords: ['models', 'directory', 'explorer', 'finder'],
    group: 'Actions',
    icon: Database,
    action: { type: 'folder', which: 'models' }
  },
  {
    id: 'action-gallery-folder',
    label: 'Open Gallery folder',
    subtitle: 'Show outputs on disk',
    keywords: ['outputs', 'directory', 'explorer', 'finder'],
    group: 'Actions',
    icon: FolderOpen,
    action: { type: 'folder', which: 'gallery' }
  }
]

export function filterCommandItems(query: string): CommandItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return COMMAND_PALETTE_ITEMS
  return COMMAND_PALETTE_ITEMS.filter((item) => {
    const hay = [item.label, item.subtitle || '', ...item.keywords, item.group]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function groupCommandItems(items: CommandItem[]): { group: CommandGroup; items: CommandItem[] }[] {
  const order: CommandGroup[] = ['Navigate', 'Settings', 'Actions']
  return order
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0)
}
