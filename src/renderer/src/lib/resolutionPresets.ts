/** Shared resolution frames for Image + Ref Edit output size.
 * One entry per unique WxH (removed duplicate 1024² / 1:1).
 */
export const resolutionPresets = [
  // Squares
  { label: '512²', width: 512, height: 512 },
  { label: '768²', width: 768, height: 768 },
  { label: '1024²', width: 1024, height: 1024 },
  { label: '1536²', width: 1536, height: 1536 },
  { label: '2048²', width: 2048, height: 2048 },
  // Compact portrait / landscape (requested 512×768 family)
  { label: '512×768', width: 512, height: 768 },
  { label: '768×512', width: 768, height: 512 },
  // Standard frames
  { label: '4:3', width: 1024, height: 768 },
  { label: '3:2', width: 1152, height: 768 },
  { label: '16:9', width: 1344, height: 768 },
  { label: '9:16', width: 768, height: 1344 },
  { label: '2:3', width: 832, height: 1216 },
  { label: '3:4', width: 896, height: 1152 }
] as const

export type ResolutionPreset = (typeof resolutionPresets)[number]
