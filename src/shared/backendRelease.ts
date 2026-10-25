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

/**
 * The OS a release file is built for. macOS is checked first: "darwin" contains "win".
 * Windows needs "win" as its own token so names like "darwin" or "twin" do not count.
 */
export function assetOs(assetName: string): 'win32' | 'darwin' | 'linux' | null {
  const n = assetName.toLowerCase()
  if (/macos|darwin|osx|metal/.test(n)) return 'darwin'
  if (/linux|ubuntu|debian/.test(n)) return 'linux'
  if (/(^|[^a-z])win(dows)?([^a-z]|$)|win(32|64)/.test(n)) return 'win32'
  return null
}

/** CUDA runtime DLL packages (cudart-*) ship next to CUDA builds; they are not engines. */
export function isRuntimePackage(assetName: string): boolean {
  return /^cudart[-_]/i.test(assetName)
}

/** Keep zip assets that match the current OS (win / macos / linux). */
export function assetMatchesPlatform(assetName: string, platform: string): boolean {
  const os = assetOs(assetName)
  return os === null || os === platform
}

/**
 * The CUDA runtime package a Windows CUDA build needs (same CUDA major), so installing
 * the build also installs the DLLs it loads. Undefined for every other build.
 */
export function cudaRuntimeFor<T extends { name: string }>(
  assets: T[],
  buildName: string
): T | undefined {
  const n = buildName.toLowerCase()
  if (assetOs(buildName) !== 'win32' || !/cuda|cu1\d/.test(n) || isRuntimePackage(buildName))
    return undefined
  const major = n.match(/(?:cuda|cu)(\d{2})/)?.[1]
  const runtimes = assets.filter((a) => isRuntimePackage(a.name) && assetOs(a.name) === 'win32')
  return runtimes.find((a) => major && a.name.toLowerCase().includes(`cu${major}`)) || runtimes[0]
}

export function filterAssetsForPlatform<T extends { name: string }>(
  assets: T[],
  platform: string
): T[] {
  const builds = assets.filter((a) => !isRuntimePackage(a.name))
  const matched = builds.filter((a) => assetMatchesPlatform(a.name, platform))
  return matched.length > 0 ? matched : builds
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

  if (isRuntimePackage(assetName)) return 'CUDA runtime libraries'
  const os = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[assetOs(assetName) || ''] || ''

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
  // AMD without the ROCm runtime: Vulkan is the build that surely runs
  if (hintL.includes('amd')) {
    const hit = prefer((n) => n.includes('vulkan'))
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

/**
 * A second build worth offering next to the best one: for AMD GPUs, ROCm when Vulkan is
 * the pick (faster where ROCm is installed) and Vulkan when ROCm is (runs everywhere).
 */
export function alternativeBackendAsset(
  assets: { name: string }[],
  platform: string,
  hint?: string | null
): string | undefined {
  const h = (hint || '').toLowerCase()
  if (!h.includes('amd') && !h.includes('rocm')) return undefined
  const pool = filterAssetsForPlatform(assets, platform).map((a) => a.name)
  const want = h.includes('rocm') ? 'vulkan' : 'rocm'
  return pool.find((n) => n.toLowerCase().includes(want))
}
