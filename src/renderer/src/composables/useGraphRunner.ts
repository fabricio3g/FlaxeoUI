import { computed, ref } from 'vue'
import { apiGet } from '@/services/api'
import { useConfigStore } from '@/stores/config'
import { useJobQueue } from '@/composables/useJobQueue'
import { pickMachine } from '../../../shared/modelSetup'
import type { GraphRunState, NodeRunState, WorkflowGraph } from '../../../shared/workflowGraph'

/** Last known run (live while running), shared by the canvas and its nodes. */
const run = ref<GraphRunState | null>(null)
const lastError = ref('')
let polling: number | null = null

async function poll(): Promise<void> {
  try {
    const data = await apiGet<{ run: GraphRunState | null }>('/api/workflows/status')
    if (data.run) run.value = data.run
  } catch {
    /* keep the last state; the run request reports errors */
  }
}

function startPolling(): void {
  stopPolling()
  void poll()
  polling = window.setInterval(poll, 800)
}

function stopPolling(): void {
  if (polling !== null) window.clearInterval(polling)
  polling = null
}

/**
 * Runs workflows through the shared job queue (so they wait behind Create jobs and
 * other devices), polling per-node progress while one runs.
 */
export function useGraphRunner() {
  const configStore = useConfigStore()
  const queue = useJobQueue()

  const nodeRuns = computed<Record<string, NodeRunState>>(() => run.value?.nodes || {})
  const running = computed(() => run.value?.status === 'running')
  const queued = computed(
    () => queue.jobs.value.filter((j) => j.surface === 'workflow' && j.status === 'pending').length
  )

  /** Queue `times` runs of the graph as it is now. */
  function start(graph: WorkflowGraph, times = 1): void {
    const body = {
      graph: JSON.parse(JSON.stringify({ nodes: graph.nodes, edges: graph.edges })),
      machine: pickMachine(configStore.config),
      workflowId: graph.id,
      name: graph.name
    }
    for (let i = 0; i < Math.max(1, Math.min(32, times)); i++) {
      queue.enqueue({
        surface: 'workflow',
        kind: 'json',
        endpoint: '/api/workflows/run',
        jsonBody: body,
        label: graph.name,
        onStart: () => {
          lastError.value = ''
          startPolling()
        },
        onSuccess: () => void poll(),
        onError: (message: string) => {
          lastError.value = message
          void poll()
        },
        onSettled: () => {
          stopPolling()
          void poll()
        }
      })
    }
  }

  return {
    run,
    nodeRuns,
    running,
    queued,
    lastError,
    start,
    cancel: queue.cancelCurrent,
    refresh: poll
  }
}
