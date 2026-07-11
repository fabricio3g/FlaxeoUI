/**
 * Safe caching recipes aligned with stable-diffusion.cpp docs/caching.md
 */

export interface CachePreset {
  id: string
  label: string
  description: string
  /** Empty mode = off */
  cacheMode: string
  cacheOption: string
  scmPolicy: string
  scmMask: string
}

export const cachePresets: CachePreset[] = [
  {
    id: 'off',
    label: 'Off',
    description: 'No cache acceleration',
    cacheMode: '',
    cacheOption: '',
    scmPolicy: '',
    scmMask: ''
  },
  {
    id: 'easycache-balanced',
    label: 'EasyCache balanced',
    description: 'DiT models (FLUX, Qwen, etc.). threshold 0.2, mid-range steps',
    cacheMode: 'easycache',
    cacheOption: 'threshold=0.2,start=0.15,end=0.95',
    scmPolicy: '',
    scmMask: ''
  },
  {
    id: 'easycache-quality',
    label: 'EasyCache quality',
    description: 'Lower threshold — less speedup, safer quality',
    cacheMode: 'easycache',
    cacheOption: 'threshold=0.12,start=0.2,end=0.9',
    scmPolicy: '',
    scmMask: ''
  },
  {
    id: 'ucache-unet',
    label: 'UCache (UNET)',
    description: 'SD1.x / SDXL style UNET models',
    cacheMode: 'ucache',
    cacheOption: 'threshold=1.5,start=0.15,end=0.95,decay=1.0,relative=1,reset=1',
    scmPolicy: '',
    scmMask: ''
  },
  {
    id: 'dbcache',
    label: 'DBCache',
    description: 'Block-level L1 residual cache for DiT',
    cacheMode: 'dbcache',
    cacheOption: 'threshold=0.25,warmup=4',
    scmPolicy: 'dynamic',
    scmMask: ''
  },
  {
    id: 'cache-dit',
    label: 'Cache-DIT',
    description: 'DBCache + TaylorSeer combined',
    cacheMode: 'cache-dit',
    cacheOption: 'threshold=0.08,warmup=8,Fn=8,Bn=0',
    scmPolicy: 'dynamic',
    scmMask: ''
  },
  {
    id: 'spectrum',
    label: 'Spectrum default',
    description: 'Chebyshev + Taylor forecasting; works on UNET and DiT',
    cacheMode: 'spectrum',
    cacheOption: 'w=0.40,m=3,lam=1.0,window=2,flex=0.50,warmup=4,stop=0.9',
    scmPolicy: '',
    scmMask: ''
  },
  {
    id: 'taylorseer',
    label: 'TaylorSeer',
    description: 'Taylor series block prediction for DiT',
    cacheMode: 'taylorseer',
    cacheOption: '',
    scmPolicy: '',
    scmMask: ''
  }
]

export function findCachePresetId(config: {
  cacheMode?: string
  cacheOption?: string
  scmPolicy?: string
  scmMask?: string
}): string {
  const match = cachePresets.find(
    (preset) =>
      preset.cacheMode === (config.cacheMode || '') &&
      preset.cacheOption === (config.cacheOption || '') &&
      preset.scmPolicy === (config.scmPolicy || '') &&
      preset.scmMask === (config.scmMask || '')
  )
  return match?.id || 'custom'
}
