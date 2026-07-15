/** Shared resolution frames for Image + Ref Edit output size. */
export const resolutionPresets = [
  { label: '512²', width: 512, height: 512 },
  { label: '768²', width: 768, height: 768 },
  { label: '1024²', width: 1024, height: 1024 },
  { label: '1536²', width: 1536, height: 1536 },
  { label: '2048²', width: 2048, height: 2048 },
  { label: '1:1', width: 1024, height: 1024 },
  { label: '4:3', width: 1024, height: 768 },
  { label: '3:2', width: 1152, height: 768 },
  { label: '16:9', width: 1344, height: 768 },
  { label: '9:16', width: 768, height: 1344 },
  { label: '2:3', width: 832, height: 1216 },
  { label: '3:4', width: 896, height: 1152 }
] as const

export type ResolutionPreset = (typeof resolutionPresets)[number]
