<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, BookOpen, ChevronRight } from '@/lib/icons'
import {
  HELP_SECTIONS,
  findHelpTopic,
  helpTopics,
  searchHelpTopics,
  type HelpTopic
} from '@/help/catalog'
import { renderMarkdown } from '@/help/markdown'

const route = useRoute()
const router = useRouter()

const query = ref('')
const activeId = ref((route.query.topic as string) || 'getting-started')

const filtered = computed(() => searchHelpTopics(query.value))

const topicsBySection = computed(() => {
  const map = new Map<string, HelpTopic[]>()
  for (const section of HELP_SECTIONS) map.set(section, [])
  for (const t of filtered.value) {
    const list = map.get(t.section) || []
    list.push(t)
    map.set(t.section, list)
  }
  return HELP_SECTIONS.map((section) => ({
    section,
    topics: map.get(section) || []
  })).filter((g) => g.topics.length > 0)
})

const activeTopic = computed(() => findHelpTopic(activeId.value) || helpTopics[0])

const html = computed(() => renderMarkdown(activeTopic.value?.body || ''))

function selectTopic(id: string): void {
  activeId.value = id
  router.replace({ name: 'Help', query: { topic: id } })
}

watch(
  () => route.query.topic,
  (topic) => {
    if (typeof topic === 'string' && findHelpTopic(topic)) {
      activeId.value = topic
    }
  }
)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header
      class="aui-scroll-header flex flex-col gap-3 bg-background px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <BookOpen class="size-5" />
        </div>
        <div>
          <h1 class="text-lg font-semibold tracking-tight text-foreground">Help</h1>
          <p class="text-xs text-muted-foreground">Offline guide — search topics or browse sections</p>
        </div>
      </div>
      <div class="relative w-full max-w-sm">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="query"
          type="search"
          placeholder="Search help…"
          class="h-9 w-full rounded-lg border border-border/70 bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>
      <div class="aui-scroll-header__fade" aria-hidden="true" />
    </header>

    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside
        class="shrink-0 overflow-y-auto border-b border-border/60 md:w-64 md:border-b-0 md:border-r md:border-border/60"
      >
        <nav class="space-y-4 p-3 md:p-4" aria-label="Help topics">
          <div v-for="group in topicsBySection" :key="group.section">
            <p class="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {{ group.section }}
            </p>
            <ul class="space-y-0.5">
              <li v-for="topic in group.topics" :key="topic.id">
                <button
                  type="button"
                  class="aui-icon-button flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/80"
                  :class="
                    activeId === topic.id
                      ? 'bg-primary/10 font-medium text-foreground'
                      : 'text-muted-foreground'
                  "
                  :aria-current="activeId === topic.id ? 'page' : undefined"
                  @click="selectTopic(topic.id)"
                >
                  <span class="truncate">{{ topic.title }}</span>
                  <ChevronRight
                    v-if="activeId === topic.id"
                    class="size-3.5 shrink-0 text-primary"
                  />
                </button>
              </li>
            </ul>
          </div>
          <p v-if="!topicsBySection.length" class="px-2 text-xs text-muted-foreground">
            No topics match “{{ query }}”.
          </p>
        </nav>
      </aside>

      <article class="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <div class="mx-auto max-w-2xl help-prose" v-html="html" />
      </article>
    </div>
  </div>
</template>
