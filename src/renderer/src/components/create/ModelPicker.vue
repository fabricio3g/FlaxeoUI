<script setup lang="ts">
/**
 * The model chip in the composer: installed models grouped by family, with readiness.
 * Picking one auto-matches its companion files and takes the family's recommended settings
 * only where the user has not changed them.
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Box, Check, ChevronDown, Search } from '@/lib/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useModels } from '@/composables/useModels'
import {
  applyFamily,
  inferFamily,
  setupStatus,
  type FamilyKind,
  setupFamily
} from '../../../../shared/modelFamilies'
import {
  mainModel,
  mainModelKey,
  modelLabel,
  pickSetup,
  type InstalledModels,
  type ModelSetup
} from '../../../../shared/modelSetup'

const props = defineProps<{ setup: ModelSetup; kind: FamilyKind }>()
const emit = defineEmits<{ update: [setup: ModelSetup] }>()

const router = useRouter()
const { models, fetchModels } = useModels()
const open = ref(false)
const query = ref('')
const search = ref<HTMLInputElement | null>(null)

const installed = computed(() => models.value as unknown as InstalledModels)
const current = computed(() => mainModel(props.setup))
const status = computed(() => setupStatus(props.setup, installed.value))
const family = computed(() => setupFamily(props.setup))

const label = computed(() => (current.value ? modelLabel(current.value) : 'Choose a model'))

interface Row {
  file: string
  name: string
  familyName: string
  kind: FamilyKind | null
  missing: number
}

const rows = computed<Row[]>(() =>
  (installed.value.diffusion || []).map((file) => {
    const fam = inferFamily(file)
    const trial = fam
      ? applyFamily(pickSetup(props.setup), fam, installed.value, { mainFile: file })
      : null
    return {
      file,
      name: modelLabel(file),
      familyName: fam?.name || 'Unknown family',
      kind: fam?.kind || null,
      missing: trial ? setupStatus(trial, installed.value).missing.length : 0
    }
  })
)

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const visible = rows.value.filter(
    (row) => !q || row.name.toLowerCase().includes(q) || row.familyName.toLowerCase().includes(q)
  )
  // Models made for this mode first; the rest stay pickable.
  const order = (row: Row): number => (row.kind === props.kind ? 0 : row.kind ? 1 : 2)
  const map = new Map<string, Row[]>()
  for (const row of [...visible].sort((a, b) => order(a) - order(b))) {
    const list = map.get(row.familyName) || []
    list.push(row)
    map.set(row.familyName, list)
  }
  return [...map.entries()].map(([name, list]) => ({ name, rows: list }))
})

function onOpen(value: boolean): void {
  open.value = value
  if (value) {
    query.value = ''
    void fetchModels?.()
    void nextTick(() => search.value?.focus())
  }
}

function pick(row: Row): void {
  const fam = inferFamily(row.file)
  const base = pickSetup(props.setup)
  if (fam) {
    emit('update', applyFamily(base, fam, installed.value, { mainFile: row.file }))
  } else {
    // Unknown file: keep everything, just point the main model at it.
    emit('update', { ...base, modelFamily: '', [mainModelKey(base)]: row.file })
  }
  open.value = false
}

function getModels(): void {
  open.value = false
  void router.push({ name: 'Models' })
}
</script>

<template>
  <Popover :open="open" @update:open="onOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-md px-2 text-[13px] font-medium hover:bg-accent"
        :aria-label="`Model: ${label}`"
      >
        <AlertTriangle
          v-if="current && !status.ready"
          class="size-3.5 shrink-0 text-warning"
          aria-hidden="true"
        />
        <Box v-else class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="truncate">{{ label }}</span>
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" side="top" class="w-[min(24rem,calc(100vw-2rem))] p-0">
      <label class="flex items-center gap-2 border-b border-border px-3">
        <Search class="size-4 text-muted-foreground" />
        <input
          ref="search"
          v-model="query"
          placeholder="Search models"
          aria-label="Search models"
          class="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div class="max-h-[22rem] overflow-y-auto py-1">
        <template v-for="group in groups" :key="group.name">
          <p class="px-3 pb-1 pt-2.5 text-xs text-muted-foreground">{{ group.name }}</p>
          <button
            v-for="row in group.rows"
            :key="row.file"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-accent"
            @click="pick(row)"
          >
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            <span v-if="row.missing" class="shrink-0 text-xs text-warning"
              >{{ row.missing }} file{{ row.missing === 1 ? '' : 's' }} missing</span
            >
            <Check v-if="row.file === current" class="size-3.5 shrink-0 text-brand" />
          </button>
        </template>
        <p v-if="!groups.length" class="px-3 py-6 text-center text-[13px] text-muted-foreground">
          {{ rows.length ? 'No model matches.' : 'No models installed yet.' }}
        </p>
      </div>
      <div class="flex items-center justify-between border-t border-border px-3 py-2 text-[13px]">
        <span v-if="family && current" class="truncate text-muted-foreground">
          {{ family.name
          }}<template v-if="!status.ready">
            · needs {{ status.missing.map((m) => m.label).join(', ') || 'files' }}</template
          >
        </span>
        <span v-else />
        <button type="button" class="font-medium hover:text-brand" @click="getModels">
          Get models
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
