<script setup lang="ts">
/**
 * Every option of the selected model, grouped and searchable. Built from the option
 * catalog (named controls) plus whatever else the installed sd-cli lists, so options
 * added to sd.cpp appear here without code changes. Used by Create and by workflow nodes.
 */
import { computed, ref } from 'vue'
import { ChevronDown, Search, X } from '@/lib/icons'
import Combobox, { type ComboboxOption } from '@/components/ui/Combobox.vue'
import OptionField, { type FieldSpec } from './OptionField.vue'
import { useModels } from '@/composables/useModels'
import { useSdOptions } from '@/composables/useSdOptions'
import {
  OPTION_CATALOG,
  OPTION_GROUPS,
  optionChoices,
  type CatalogOption,
  type OptionGroup
} from '../../../../shared/sdOptionCatalog'
import type { SdOption } from '../../../../shared/sdHelp'
import {
  DEFAULT_SETUP,
  modelLabel,
  type InstalledModels,
  type ModelSetup
} from '../../../../shared/modelSetup'
import {
  applyRecommendations,
  familyRecommendations,
  setupFamily
} from '../../../../shared/modelFamilies'
import { HIRES_BUILTIN_UPSCALERS } from '../../../../shared/sdArgHelpers'

const props = withDefaults(
  defineProps<{
    setup: ModelSetup
    /** model: a workflow Load model node, only what sd.cpp loads (files, LoRAs, advanced) */
    mode?: 'image' | 'edit' | 'video' | 'node' | 'model'
  }>(),
  { mode: 'node' }
)
const emit = defineEmits<{ update: [patch: Partial<ModelSetup>] }>()

const { models } = useModels()
const { help, live, extraOptions, supports } = useSdOptions()
const installed = computed(() => models.value as unknown as InstalledModels)
const query = ref('')
const collapsed = ref<Set<string>>(new Set(['advanced', 'more']))

const family = computed(() => setupFamily(props.setup))
const recommendations = computed(() =>
  family.value ? familyRecommendations(props.setup, family.value) : []
)
const recommendedValue = (key: string): unknown =>
  family.value ? (family.value.defaults as Record<string, unknown>)[key] : undefined

const HIDDEN_GROUPS: Record<string, OptionGroup[]> = {
  image: ['video'],
  edit: ['video'],
  video: ['hires', 'facefix'],
  node: [],
  model: ['sampling', 'size', 'inputs', 'hires', 'facefix', 'video', 'output']
}

const slotKeys = computed(() => new Set(family.value?.slots.map((slot) => slot.key) || []))

function specFor(option: CatalogOption): FieldSpec {
  const helpOption = option.flag
    ? help.value?.options.find((o) => o.flag === option.flag)
    : undefined
  let choices = option.control === 'select' ? optionChoices(option, help.value) : undefined
  if (option.key === 'hiresUpscaler') {
    choices = [
      ...HIRES_BUILTIN_UPSCALERS.map((value) => ({ value, label: value })),
      ...(installed.value.hiresUpscalers || []).map((file) => ({
        value: file,
        label: modelLabel(file)
      }))
    ]
  }
  if (choices && DEFAULT_SETUP[option.key] === '' && !choices.some((c) => c.value === '')) {
    choices = [{ value: '', label: 'Default' }, ...choices]
  }
  const slot = family.value?.slots.find((s) => s.key === option.key)
  return {
    key: option.key,
    label: slot ? `${slot.label}${slot.required ? '' : ' (optional)'}` : option.label,
    control:
      option.control === 'loras' || option.control === 'embeddings' ? 'text' : option.control,
    min: option.min,
    max: option.max,
    step: option.step,
    choices,
    files: option.category ? installed.value[option.category] || [] : undefined,
    hint: option.hint,
    description: helpOption?.description,
    autoValue: option.autoValue,
    disabledReason:
      option.flag && !supports(option.flag) ? 'The installed sd.cpp does not have this option' : '',
    recommended: recommendedValue(option.key)
  }
}

function extraSpec(option: SdOption): FieldSpec {
  const control: FieldSpec['control'] =
    option.type === 'bool'
      ? 'toggle'
      : option.type === 'enum'
        ? 'select'
        : option.type === 'int' || option.type === 'float'
          ? 'number'
          : 'text'
  return {
    key: option.flag,
    label: option.flag.replace(/^--?/, '').replace(/-/g, ' '),
    control,
    step: option.type === 'float' ? 0.01 : 1,
    choices:
      option.type === 'enum'
        ? [
            { value: '', label: 'Default' },
            ...(option.choices || []).map((v) => ({ value: v, label: v }))
          ]
        : undefined,
    description: option.description,
    hint: option.defaultValue ? `Default: ${option.defaultValue}` : undefined
  }
}

function matches(spec: FieldSpec, flag = ''): boolean {
  const q = query.value.trim().toLowerCase()
  if (!q) return true
  return [spec.label, spec.key, flag, spec.description || ''].some((text) =>
    text.toLowerCase().includes(q)
  )
}

const sections = computed(() => {
  const hidden = HIDDEN_GROUPS[props.mode] || []
  return OPTION_GROUPS.filter((group) => !hidden.includes(group.id)).map((group) => {
    let options = OPTION_CATALOG.filter(
      (o) => o.group === group.id && o.control !== 'loras' && o.control !== 'embeddings'
    )
    if (group.id === 'files') {
      // The family's own companions first, then every other file slot.
      options = [
        ...options.filter((o) => slotKeys.value.has(o.key as never)),
        ...options.filter((o) => !slotKeys.value.has(o.key as never))
      ]
    }
    const fields = options
      .map((option) => ({ option, spec: specFor(option) }))
      .filter(({ option, spec }) => matches(spec, option.flag))
    const changed = options.filter(
      (o) => JSON.stringify(props.setup[o.key]) !== JSON.stringify(DEFAULT_SETUP[o.key])
    ).length
    return { ...group, fields, changed }
  })
})

const moreFields = computed(() =>
  extraOptions.value
    .map((option) => ({ option, spec: extraSpec(option) }))
    .filter(({ option, spec }) => matches(spec, option.flag))
)

const showLoras = computed(() => {
  const q = query.value.trim().toLowerCase()
  return !q || 'lora embedding'.includes(q) || q.includes('lora')
})

function toggle(id: string): void {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

const isOpen = (id: string): boolean => !!query.value.trim() || !collapsed.value.has(id)

function set(key: string, value: unknown): void {
  emit('update', { [key]: value } as Partial<ModelSetup>)
}

function setCliOption(flag: string, value: unknown): void {
  const next = { ...(props.setup.cliOptions || {}) }
  if (value === '' || value === false || value === null || value === undefined) delete next[flag]
  else next[flag] = value as string | number | boolean
  emit('update', { cliOptions: next })
}

function applyAllRecommended(): void {
  if (family.value) emit('update', applyRecommendations(props.setup, family.value))
}

const recommendationText = computed(() =>
  recommendations.value
    .slice(0, 4)
    .map(({ key, value }) => `${OPTION_CATALOG.find((o) => o.key === key)?.label || key} ${value}`)
    .join(' · ')
)

/* ------------------------------ LoRAs ------------------------------ */

const loraOptions = computed<ComboboxOption[]>(() =>
  (installed.value.loras || [])
    .filter((file) => !props.setup.loras.some((l) => l.path === file))
    .map((file) => ({ value: file, label: modelLabel(file), hint: file }))
)
const embeddingOptions = computed<ComboboxOption[]>(() =>
  (installed.value.embeddings || [])
    .filter((file) => !props.setup.embeddings.includes(file))
    .map((file) => ({ value: file, label: modelLabel(file) }))
)
const hasHighNoise = computed(() => !!props.setup.highNoiseDiffusionModel)

function addLora(path: string): void {
  if (path) emit('update', { loras: [...props.setup.loras, { path, strength: 1 }] })
}

function updateLora(index: number, patch: Partial<ModelSetup['loras'][number]>): void {
  emit('update', {
    loras: props.setup.loras.map((lora, i) => (i === index ? { ...lora, ...patch } : lora))
  })
}

function removeLora(index: number): void {
  emit('update', { loras: props.setup.loras.filter((_, i) => i !== index) })
}
</script>

<template>
  <div class="flex flex-col">
    <label class="mb-2 flex h-8 items-center gap-2 rounded-md bg-muted px-2.5">
      <Search class="size-3.5 shrink-0 text-muted-foreground" />
      <input
        v-model="query"
        type="search"
        placeholder="Search options"
        aria-label="Search options"
        class="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </label>

    <p v-if="!live" class="mb-2 text-xs text-muted-foreground">
      No sd.cpp engine is installed, so this list comes from the version Flaxeo was built with.
    </p>

    <div
      v-if="family && recommendations.length && !query"
      class="mb-1 flex items-start justify-between gap-3 py-2 text-[13px]"
    >
      <p class="min-w-0 text-muted-foreground">
        Recommended for <span class="text-foreground">{{ family.name }}</span
        >: {{ recommendationText }}
      </p>
      <button
        type="button"
        class="shrink-0 font-medium text-foreground underline underline-offset-2 hover:text-brand"
        @click="applyAllRecommended"
      >
        Apply
      </button>
    </div>

    <section v-if="showLoras" class="border-t border-border py-1">
      <button
        type="button"
        class="flex h-9 w-full items-center justify-between text-left text-[13px] font-medium"
        :aria-expanded="isOpen('loras')"
        @click="toggle('loras')"
      >
        <span
          >LoRAs & embeddings
          <span v-if="setup.loras.length" class="ml-1 text-muted-foreground tabular-nums">{{
            setup.loras.length
          }}</span></span
        >
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform"
          :class="!isOpen('loras') && '-rotate-90'"
        />
      </button>
      <div v-if="isOpen('loras')" class="pb-2">
        <div
          v-for="(lora, index) in setup.loras"
          :key="lora.path + index"
          class="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-2 py-1"
        >
          <span class="truncate text-[13px]" :title="lora.path">{{ modelLabel(lora.path) }}</span>
          <input
            type="number"
            step="0.05"
            class="h-7 w-full rounded-md border border-input bg-background px-1.5 text-right text-[13px] tabular-nums"
            :value="lora.strength"
            :aria-label="`${modelLabel(lora.path)} strength`"
            @change="
              updateLora(index, {
                strength: Number(($event.target as HTMLInputElement).value) || 0
              })
            "
          />
          <button
            type="button"
            class="aui-icon-button inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            :aria-label="`Remove ${modelLabel(lora.path)}`"
            v-tip="'Remove LoRA'"
            @click="removeLora(index)"
          >
            <X class="size-3.5" />
          </button>
          <label
            v-if="hasHighNoise"
            class="col-span-3 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <input
              type="checkbox"
              class="accent-brand"
              :checked="lora.target === 'high_noise'"
              @change="
                updateLora(index, {
                  target: ($event.target as HTMLInputElement).checked ? 'high_noise' : 'default'
                })
              "
            />
            Apply to the high-noise model
          </label>
        </div>
        <Combobox
          model-value=""
          :options="loraOptions"
          size="sm"
          placeholder="Add LoRA"
          search-placeholder="Search LoRAs"
          :empty-text="installed.loras?.length ? 'All LoRAs added' : 'No LoRAs in models/loras'"
          aria-label="Add LoRA"
          class="mt-1 w-full"
          @update:model-value="addLora"
        />

        <OptionField
          :spec="specFor(OPTION_CATALOG.find((o) => o.key === 'loraApplyMode')!)"
          :value="setup.loraApplyMode"
          @update="set('loraApplyMode', $event)"
        />
        <div class="flex flex-wrap items-center gap-1.5 py-1.5">
          <span class="mr-1 text-[13px] text-muted-foreground">Embeddings</span>
          <span
            v-for="file in setup.embeddings"
            :key="file"
            class="inline-flex h-6 items-center gap-1 rounded-full bg-muted pl-2 pr-1 text-xs"
          >
            {{ modelLabel(file) }}
            <button
              type="button"
              class="aui-icon-button rounded-full p-0.5 hover:bg-accent"
              :aria-label="`Remove ${modelLabel(file)}`"
              @click="emit('update', { embeddings: setup.embeddings.filter((e) => e !== file) })"
            >
              <X class="size-3" />
            </button>
          </span>
          <Combobox
            model-value=""
            :options="embeddingOptions"
            size="sm"
            placeholder="Add"
            :empty-text="installed.embeddings?.length ? 'All added' : 'None in models/embeddings'"
            aria-label="Add embedding"
            class="w-28"
            @update:model-value="
              (v: string) => v && emit('update', { embeddings: [...setup.embeddings, v] })
            "
          />
        </div>
      </div>
    </section>

    <section
      v-for="section in sections"
      v-show="section.fields.length"
      :key="section.id"
      class="border-t border-border py-1"
    >
      <button
        type="button"
        class="flex h-9 w-full items-center justify-between text-left text-[13px] font-medium"
        :aria-expanded="isOpen(section.id)"
        @click="toggle(section.id)"
      >
        <span
          >{{ section.label }}
          <span v-if="section.changed" class="ml-1 text-muted-foreground tabular-nums">{{
            section.changed
          }}</span></span
        >
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform"
          :class="!isOpen(section.id) && '-rotate-90'"
        />
      </button>
      <div v-if="isOpen(section.id)" class="pb-2">
        <OptionField
          v-for="field in section.fields"
          :key="field.option.key"
          :spec="field.spec"
          :value="setup[field.option.key]"
          @update="set(field.option.key, $event)"
        />
      </div>
    </section>

    <section v-show="moreFields.length" class="border-t border-border py-1">
      <button
        type="button"
        class="flex h-9 w-full items-center justify-between text-left text-[13px] font-medium"
        :aria-expanded="isOpen('more')"
        @click="toggle('more')"
      >
        <span
          >More sd.cpp options
          <span
            v-if="Object.keys(setup.cliOptions || {}).length"
            class="ml-1 text-muted-foreground tabular-nums"
            >{{ Object.keys(setup.cliOptions || {}).length }}</span
          ></span
        >
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform"
          :class="!isOpen('more') && '-rotate-90'"
        />
      </button>
      <div v-if="isOpen('more')" class="pb-2">
        <p class="pb-1 text-xs text-muted-foreground">
          Options the installed sd.cpp offers that have no dedicated control yet.
        </p>
        <OptionField
          v-for="field in moreFields"
          :key="field.option.flag"
          :spec="field.spec"
          :value="
            setup.cliOptions?.[field.option.flag] ?? (field.spec.control === 'toggle' ? false : '')
          "
          @update="setCliOption(field.option.flag, $event)"
        />
      </div>
    </section>

    <p
      v-if="query && !sections.some((s) => s.fields.length) && !moreFields.length"
      class="py-6 text-center text-[13px] text-muted-foreground"
    >
      No option matches "{{ query }}".
    </p>
  </div>
</template>
