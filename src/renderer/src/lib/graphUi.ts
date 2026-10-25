import type { Component } from 'vue'
import {
  Box,
  FileText,
  Film,
  Hash,
  ImageIcon,
  Images,
  Layers,
  Palette,
  Maximize2,
  ScanFace,
  Scissors,
  Spline,
  User,
  Workflow
} from '@/lib/icons'
import type { NodeType, SocketType } from '../../../shared/workflowGraph'

export const NODE_ICONS: Record<NodeType, Component> = {
  loadModel: Box,
  lora: Layers,
  controlNet: Spline,
  photoMaker: User,
  ipAdapter: Palette,
  pulid: ScanFace,
  prompt: FileText,
  number: Hash,
  loadImages: Images,
  generate: ImageIcon,
  video: Film,
  upscale: Maximize2,
  faceFix: ScanFace,
  removeBg: Scissors,
  output: Workflow
}

/** Socket and wire colors by type (functional color: you match sockets by it). */
export const SOCKET_COLORS: Record<SocketType, string> = {
  model: '#a78bfa',
  guide: '#e879b9',
  text: '#f0a93b',
  image: '#4ea8de',
  video: '#e5735f',
  number: '#5cc58a'
}

export const SOCKET_LABELS: Record<SocketType, string> = {
  model: 'Model',
  guide: 'Guide',
  text: 'Text',
  image: 'Image',
  video: 'Video',
  number: 'Number'
}

/** Output files that render as images in result grids. */
export function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|webp|avif|gif)$/i.test(name)
}

export function isVideoFile(name: string): boolean {
  return /\.(mp4|webm|avi)$/i.test(name)
}
