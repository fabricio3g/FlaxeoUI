<script setup lang="ts">
/**
 * One sd.cpp option as a label/control row. Renders any control kind from the option
 * catalog or from a raw `--help` entry, so new options need no new markup.
 */
import { computed } from 'vue'
import Combobox, { type ComboboxOption } from '@/components/ui/Combobox.vue'
import Select from '@/components/ui/Select.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { modelLabel } from '../../../../shared/modelSetup'

export interface FieldSpec {
  key: string
  label: string
  control: 'file' | 'number' | 'slider' | 'select' | 'toggle' | 'text'
  min?: number
  max?: number
  step?: number
  choices?: Array<{ value: string; label: string }>
  /** Files for 'file' controls */
  files?: string[]
  hint?: string
  /** Long help text (sd-cli --help), shown on hover */
  description?: string
  /** Value meaning "let sd.cpp decide" */
  autoValue?: string | number
  /** Disabled with a reason (e.g. the installed sd.cpp lacks the flag) */
  disabledReason?: string
  /** Recommended value for the current model, shown when it differs */
  recommended?: unknown
}

const props = defineProps<{ spec: FieldSpec; value: unknown }>()
const emit = defineEmits<{ update: [value: unknown] }>()

const disabled = computed(() => !!props.spec.disabledReason)
const id = computed(() => `opt-${props.spec.key.replace(/[^\w-]/g, '')}`)

const fileOptions = computed<ComboboxOption[]>(() =>
  (props.spec.files || []).map((file) => ({ value: file, label: modelLabel(file), hint: file }))
)

const numberValue = computed(() => {
  const n = Number(props.value)
  return Number.isFinite(n) ? n : 0
})

const isAuto = computed(
  () => props.spec.autoValue !== undefined && props.value === props.spec.autoValue
)

const showRecommended = computed(
  () =>
    props.spec.recommended !== undefined &&
    JSON.stringify(props.spec.recommended) !== JSON.stringify(props.value)
)

function setNumber(raw: string): void {
  if (raw.trim() === '') {
    emit('update', props.spec.autoValue ?? 0)
    return
  }
  const n = Number(raw)
  if (Number.isFinite(n)) emit('update', n)
}
</script>

<template>
  <div
    class="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-1.5"
    :class="disabled && 'opacity-55'"
  >
    <div class="flex min-w-0 items-center gap-1.5">
      <Tooltip v-if="spec.description" :text="spec.description" position="left">
        <label :for="id" class="truncate text-[13px] text-muted-foreground">{{ spec.label }}</label>
      </Tooltip>
      <label v-else :for="id" class="truncate text-[13px] text-muted-foreground">{{
        spec.label
      }}</label>
    </div>

    <div class="flex min-w-0 items-center gap-2">
      <Combobox
        v-if="spec.control === 'file'"
        :model-value="String(value || '')"
        :options="fileOptions"
        size="sm"
        clearable
        clear-label="None"
        :placeholder="fileOptions.length ? 'None' : 'No files installed'"
        :disabled="disabled"
        :aria-label="spec.label"
        class="w-full"
        @update:model-value="emit('update', $event)"
      />

      <template v-else-if="spec.control === 'slider'">
        <input
          :id="id"
          type="range"
          class="h-1 min-w-0 flex-1 cursor-pointer accent-brand"
          :min="spec.min"
          :max="spec.max"
          :step="spec.step"
          :value="numberValue"
          :disabled="disabled"
          @input="setNumber(($event.target as HTMLInputElement).value)"
        />
        <input
          type="number"
          class="h-7 w-16 shrink-0 rounded-md border border-input bg-background px-1.5 text-right text-[13px] tabular-nums"
          :min="spec.min"
          :max="spec.max"
          :step="spec.step"
          :value="numberValue"
          :disabled="disabled"
          :aria-label="spec.label"
          @change="setNumber(($event.target as HTMLInputElement).value)"
        />
      </template>

      <input
        v-else-if="spec.control === 'number'"
        :id="id"
        type="number"
        class="h-7 w-full rounded-md border border-input bg-background px-2 text-[13px] tabular-nums placeholder:text-muted-foreground"
        :min="spec.min"
        :max="spec.max"
        :step="spec.step ?? 1"
        :value="isAuto ? '' : value"
        :placeholder="spec.autoValue !== undefined ? 'Auto' : ''"
        :disabled="disabled"
        @change="setNumber(($event.target as HTMLInputElement).value)"
      />

      <Select
        v-else-if="spec.control === 'select'"
        :model-value="String(value ?? '')"
        :options="spec.choices || []"
        size="sm"
        :disabled="disabled"
        placeholder="Default"
        class="w-full"
        @update:model-value="emit('update', $event)"
      />

      <button
        v-else-if="spec.control === 'toggle'"
        :id="id"
        type="button"
        role="switch"
        :aria-checked="!!value"
        :disabled="disabled"
        class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        :class="value ? 'bg-brand' : 'bg-input'"
        @click="emit('update', !value)"
      >
        <span
          class="inline-block size-4 rounded-full bg-background shadow-sm transition-transform"
          :class="value ? 'translate-x-[18px]' : 'translate-x-0.5'"
        />
      </button>

      <input
        v-else
        :id="id"
        type="text"
        class="h-7 w-full rounded-md border border-input bg-background px-2 text-[13px] placeholder:text-muted-foreground"
        :value="String(value ?? '')"
        :placeholder="spec.hint || ''"
        :disabled="disabled"
        spellcheck="false"
        @change="emit('update', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <p
      v-if="spec.disabledReason || (spec.hint && spec.control !== 'text') || showRecommended"
      class="col-start-2 text-xs text-muted-foreground"
    >
      <template v-if="spec.disabledReason">{{ spec.disabledReason }}</template>
      <template v-else-if="showRecommended">
        Recommended: {{ String(spec.recommended) }}
        <button
          type="button"
          class="ml-1 font-medium text-foreground underline underline-offset-2 hover:text-brand"
          @click="emit('update', spec.recommended)"
        >
          Use
        </button>
      </template>
      <template v-else>{{ spec.hint }}</template>
    </p>
  </div>
</template>
