import { reactive } from 'vue'
import { apiGet } from '@/services/api'
import type { HubFile } from '@/lib/starterPacks'
import {
  parseHfUrl,
  pickForTier,
  quantBits,
  quantOf,
  quantSiblings,
  type HubFileEntry,
  type QuantTier
} from '../../../shared/modelHub'

export interface Variant {
  path: string
  url: string
  size: number
  quant: string
}

/** Repo file lists, fetched once per repo while the page is open. */
const repoFiles = new Map<string, Promise<HubFileEntry[]>>()
/** Variants per pack file (keyed by its original URL); empty = only the pack's own file */
const variants = reactive<Record<string, Variant[]>>({})
/** The variant URL picked per pack file */
const chosen = reactive<Record<string, string>>({})

function listRepo(repo: string): Promise<HubFileEntry[]> {
  if (!repoFiles.has(repo))
    repoFiles.set(
      repo,
      apiGet<{ files: HubFileEntry[] }>(`/api/hub/hf-files?repo=${encodeURIComponent(repo)}`)
        .then((data) => data.files)
        .catch(() => {
          repoFiles.delete(repo)
          return []
        })
    )
  return repoFiles.get(repo) as Promise<HubFileEntry[]>
}

/**
 * Other quantizations of the files in one-click packs, read live from their Hugging Face
 * repos, so a pack can be downloaded in the size that fits the GPU.
 */
export function usePackVariants() {
  async function load(files: HubFile[]): Promise<void> {
    await Promise.all(
      files.map(async (file) => {
        if (file.url in variants) return
        const hf = parseHfUrl(file.url)
        if (!hf || !quantOf(hf.path)) {
          variants[file.url] = []
          return
        }
        const entries = await listRepo(hf.repo)
        const siblings = quantSiblings(
          hf.path,
          entries.map((e) => e.name)
        )
        variants[file.url] =
          siblings.length > 1
            ? siblings.map((path) => {
                const entry = entries.find((e) => e.name === path) as HubFileEntry
                return { path, url: entry.url, size: entry.size, quant: quantOf(path) }
              })
            : []
      })
    )
  }

  function options(file: HubFile): Variant[] {
    return variants[file.url] || []
  }

  /** The file to download: the pack's own, or the picked quantization. */
  function effective(file: HubFile): HubFile {
    const pick = options(file).find((v) => v.url === chosen[file.url])
    if (!pick) return file
    return { ...file, url: pick.url, filename: pick.path.split('/').pop() || file.filename }
  }

  function choose(file: HubFile, url: string): void {
    chosen[file.url] = url
  }

  /** Pick one size class for every file of a pack that has quantizations. */
  function chooseTier(files: HubFile[], tier: QuantTier): void {
    for (const file of files) {
      const list = options(file)
      if (!list.length) continue
      const path = pickForTier(
        list.map((v) => v.path),
        tier
      )
      const pick = list.find((v) => v.path === path)
      if (pick) chosen[file.url] = pick.url
    }
  }

  /** Total download size of a pack with the current picks (0 when unknown). */
  function packSize(files: HubFile[]): number {
    return files.reduce((sum, file) => {
      const pick = options(file).find((v) => v.url === effective(file).url)
      return sum + (pick?.size || 0)
    }, 0)
  }

  return { load, options, effective, choose, chooseTier, packSize, quantBits }
}
