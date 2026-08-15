/**
 * Which OS a backend folder holds binaries for, from a plain file listing.
 *
 * The picker deliberately offers every published asset, so a Windows zip can end up
 * installed on Linux — where sd-cli.exe still satisfies "binaries present" but can
 * never run. Pure over the listing so custom folders are covered too.
 */
export function detectBackendDirPlatform(fileNames: readonly string[]): 'win32' | 'posix' | null {
  let sawWindows = false
  let sawPosix = false

  for (const name of fileNames) {
    const n = name.toLowerCase()
    if (n === 'sd-cli.exe' || n === 'sd-server.exe' || n.endsWith('.dll')) sawWindows = true
    if (n === 'sd-cli' || n === 'sd-server' || n === 'sd') sawPosix = true
  }

  if (sawPosix) return 'posix'
  if (sawWindows) return 'win32'
  return null
}

/** True when the folder's binaries cannot run on `platform` (process.platform). */
export function backendPlatformMismatch(fileNames: readonly string[], platform: string): boolean {
  const dirPlatform = detectBackendDirPlatform(fileNames)
  if (!dirPlatform) return false
  return dirPlatform === 'win32' ? platform !== 'win32' : platform === 'win32'
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
      prefer((n) => n.includes('cuda12') || n.includes('cu12')) || prefer((n) => n.includes('cuda'))
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
