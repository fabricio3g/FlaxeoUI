/**
 * stable-diffusion.cpp release tag Flaxeo is developed and tested against.
 * GitHub: leejet/stable-diffusion.cpp
 *
 * Bump this when CI / manual QA moves to a newer sd.cpp master build.
 */
export const RECOMMENDED_BACKEND_TAG = 'master-782-b290693'

/** Prefix match so minor hash renames under the same master build still count. */
export const RECOMMENDED_BACKEND_PREFIX = 'master-782'

export function isRecommendedBackendTag(tag: string): boolean {
  if (!tag) return false
  if (tag === RECOMMENDED_BACKEND_TAG) return true
  return tag.startsWith(`${RECOMMENDED_BACKEND_PREFIX}-`) || tag === RECOMMENDED_BACKEND_PREFIX
}

export function sortReleasesRecommendedFirst<T extends { tag: string }>(releases: T[]): T[] {
  return [...releases].sort((a, b) => {
    const ar = isRecommendedBackendTag(a.tag) ? 0 : 1
    const br = isRecommendedBackendTag(b.tag) ? 0 : 1
    return ar - br
  })
}

export function pickRecommendedRelease<T extends { tag: string }>(releases: T[]): T | undefined {
  return releases.find((r) => isRecommendedBackendTag(r.tag)) ?? undefined
}

/** Keep zip assets that match the current OS (win / macos / linux). */
export function assetMatchesPlatform(assetName: string, platform: string): boolean {
  const n = assetName.toLowerCase()
  if (platform === 'win32') return n.includes('win') || n.includes('windows')
  if (platform === 'darwin')
    return n.includes('macos') || n.includes('darwin') || n.includes('osx') || n.includes('metal')
  if (platform === 'linux')
    return n.includes('linux') || n.includes('ubuntu') || n.includes('debian')
  return true
}

export function filterAssetsForPlatform<T extends { name: string }>(
  assets: T[],
  platform: string
): T[] {
  const matched = assets.filter((a) => assetMatchesPlatform(a.name, platform))
  return matched.length > 0 ? matched : assets
}

/**
 * Human label for a GitHub asset — OS + accelerator.
 * Full filename remains the select `value` for download.
 */
export function backendVariantLabel(assetName: string): string {
  const n = assetName.toLowerCase()

  let accel = 'Other'
  if (n.includes('cuda')) {
    if (n.includes('cuda12') || n.includes('cu12')) accel = 'CUDA 12'
    else if (n.includes('cuda11') || n.includes('cu11')) accel = 'CUDA 11'
    else accel = 'CUDA'
  } else if (n.includes('vulkan')) accel = 'Vulkan'
  else if (n.includes('opencl')) accel = 'OpenCL'
  else if (n.includes('rocm') || n.includes('hip')) accel = 'ROCm'
  else if (n.includes('sycl')) accel = 'SYCL'
  else if (n.includes('metal')) accel = 'Metal'
  else if (n.includes('noavx')) accel = 'CPU (no AVX)'
  else if (n.includes('avx512')) accel = 'CPU (AVX-512)'
  else if (n.includes('avx2')) accel = 'CPU (AVX2)'
  else if (n.includes('avx')) accel = 'CPU (AVX)'
  else if (n.includes('cpu')) accel = 'CPU'

  const os =
    n.includes('win') || n.includes('windows')
      ? 'Windows'
      : n.includes('linux') || n.includes('ubuntu') || n.includes('debian')
        ? 'Linux'
        : n.includes('macos') || n.includes('darwin') || n.includes('osx')
          ? 'macOS'
          : ''

  let label = os ? `${os} · ${accel}` : accel
  if (n.includes('arm64') || n.includes('aarch64')) {
    label += ' · ARM64'
  }

  return label
}

/**
 * Pick best asset for platform + optional detect hint (e.g. "win-cuda12-x64").
 */
export function pickBestBackendAsset(
  assets: { name: string }[],
  platform: string,
  hint?: string | null
): string | undefined {
  const pool = filterAssetsForPlatform(assets, platform)
  if (pool.length === 0) return undefined

  const hintL = (hint || '').toLowerCase()
  const names = pool.map((a) => a.name)

  const prefer = (pred: (n: string) => boolean): string | undefined =>
    names.find((n) => pred(n.toLowerCase()))

  if (hintL.includes('cuda')) {
    const hit =
      prefer((n) => n.includes('cuda12') || n.includes('cu12')) ||
      prefer((n) => n.includes('cuda'))
    if (hit) return hit
  }
  if (hintL.includes('rocm') || hintL.includes('hip')) {
    const hit = prefer((n) => n.includes('rocm') || n.includes('hip'))
    if (hit) return hit
  }
  if (hintL.includes('vulkan')) {
    const hit = prefer((n) => n.includes('vulkan'))
    if (hit) return hit
  }
  if (hintL.includes('metal') || platform === 'darwin') {
    const hit =
      prefer((n) => n.includes('metal')) ||
      prefer((n) => n.includes('macos') || n.includes('darwin'))
    if (hit) return hit
  }

  if (platform === 'win32') {
    return (
      prefer((n) => n.includes('cuda')) ||
      prefer((n) => n.includes('vulkan')) ||
      prefer((n) => n.includes('avx2')) ||
      pool[0].name
    )
  }
  if (platform === 'darwin') {
    return (
      prefer((n) => n.includes('macos') || n.includes('darwin') || n.includes('metal')) ||
      pool[0].name
    )
  }
  if (platform === 'linux') {
    return prefer((n) => n.includes('ubuntu') || n.includes('linux')) || pool[0].name
  }

  return pool[0].name
}
