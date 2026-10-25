import { computed, ref } from 'vue'
import { apiGet } from '@/services/api'
import type { SdHelp, SdOption } from '../../../shared/sdHelp'
import { extraHelpOptions } from '../../../shared/sdOptionCatalog'

/**
 * Every option the installed sd-cli offers (from `--help`), shared app-wide.
 * `live` is false when no engine is installed and the list comes from the help captured
 * with the app — controls stay visible so a setup can be prepared before installing.
 */
const help = ref<SdHelp | null>(null)
const live = ref(false)
const loading = ref(false)
let pending: Promise<void> | null = null

async function load(force = false): Promise<void> {
  if (pending && !force) return pending
  loading.value = true
  pending = (async () => {
    try {
      const data = await apiGet<{ live: boolean; versionLine?: string; options: SdOption[] }>(
        '/api/backend/options'
      )
      help.value = { versionLine: data.versionLine, options: data.options }
      live.value = data.live
    } catch {
      /* keep the last list; controls fall back to the catalog's own choices */
    } finally {
      loading.value = false
    }
  })()
  return pending
}

export function useSdOptions() {
  if (!help.value && !pending) void load()

  /** True when the installed engine lists the flag (always true before an engine is known). */
  function supports(flag: string): boolean {
    if (!flag || !help.value || !live.value) return true
    return help.value.options.some((o) => o.flag === flag || o.aliases.includes(flag))
  }

  const extraOptions = computed(() => (help.value ? extraHelpOptions(help.value) : []))

  return { help, live, loading, extraOptions, supports, reload: () => load(true) }
}
