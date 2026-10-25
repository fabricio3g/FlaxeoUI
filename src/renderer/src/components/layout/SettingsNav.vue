<script setup lang="ts">
/** Settings pages in the main sidebar (the Settings view follows ?category=). */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { availableSettingsCategories, settingsCategoryFrom } from '@/lib/settingsCategories'

const route = useRoute()
const router = useRouter()
const categories = availableSettingsCategories()
const active = computed(() => settingsCategoryFrom(route.query.category))
</script>

<template>
  <nav class="flex flex-col gap-0.5 px-2 pt-3" aria-label="Settings">
    <p class="px-2.5 pb-1 text-[13px] font-medium">Settings</p>
    <button
      v-for="category in categories"
      :key="category.id"
      type="button"
      class="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors"
      :class="
        active === category.id
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      "
      :aria-current="active === category.id ? 'page' : undefined"
      @click="router.replace({ name: 'Settings', query: { category: category.id } })"
    >
      <component :is="category.icon" class="size-4 shrink-0" aria-hidden="true" />
      {{ category.label }}
    </button>
  </nav>
</template>
