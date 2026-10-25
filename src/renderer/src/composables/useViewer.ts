import { ref } from 'vue'

/** One full-screen viewer per page: anything can ask it to show a list of output files. */
const files = ref<string[]>([])
const index = ref<number | null>(null)

export function useViewer() {
  function show(list: string[], at = 0): void {
    files.value = list
    index.value = list.length ? Math.max(0, Math.min(at, list.length - 1)) : null
  }
  return { files, index, show }
}
