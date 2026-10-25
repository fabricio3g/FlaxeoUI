import { ref } from 'vue'
import { useConfigStore, type WorkspaceSurface } from '@/stores/config'
import { useLibraryStore } from '@/stores/library'
import { useSessionsStore } from '@/stores/sessions'
import { useJobQueue, type FormPart, type GenApiResult } from '@/composables/useJobQueue'
import { useGenerationProgress } from '@/composables/useGenerationProgress'
import { useLivePreview } from '@/composables/useLivePreview'
import { useBackendCapabilities } from '@/composables/useBackendCapabilities'
import { buildGenerationPayload, type GenerationPayload } from '../../../shared/generationPayload'
import { createLibraryId } from '../../../shared/library'
import { mainModel, pickSetup } from '../../../shared/modelSetup'
import { setupSummary } from '../../../shared/modelFamilies'
import type { CreateMode, RowInput, SessionRow } from '../../../shared/sessions'
import type { GenerationSurface } from '@/composables/useGeneration'

export interface CreateRequest {
  mode: CreateMode
  prompt: string
  negativePrompt: string
  /** Attached images (output-folder names) with what each is for */
  inputs: RowInput[]
  /** Painted mask for edits: white = change */
  mask?: Blob | null
  count: number
  /** -1 = random */
  seed: number
  width: number
  height: number
}

const SURFACE: Record<CreateMode, WorkspaceSurface> = {
  image: 'image',
  edit: 'edit',
  video: 'video'
}
const QUEUE_SURFACE: Record<CreateMode, GenerationSurface> = {
  image: 'text2image',
  edit: 'edit',
  video: 'video'
}

/** One live preview for whatever is generating now (the feed shows it on the running row). */
const preview = useLivePreview()
const runningRowId = ref('')

const files = (inputs: RowInput[], role: RowInput['role']): string[] =>
  inputs.filter((input) => input.role === role).map((input) => input.file)

/**
 * The one way Create generates: attached images → run fields by role, the shared payload
 * builder, the endpoint for the mode, the job queue, and a row in the session feed.
 */
export function useCreateJob() {
  const configStore = useConfigStore()
  const library = useLibraryStore()
  const sessions = useSessionsStore()
  const queue = useJobQueue()
  const progress = useGenerationProgress()
  const { supportsRefImageArgs, refImageCliFlag } = useBackendCapabilities()

  function buildPayload(request: CreateRequest): GenerationPayload {
    const base = configStore.configFor(SURFACE[request.mode])
    const { inputs } = request
    const start = files(inputs, 'start')[0] || ''
    const config = {
      ...base,
      seed: request.seed,
      batchCount: request.mode === 'video' ? 1 : request.count,
      initImagePath: start,
      kontextRefImage: '',
      controlImagePath: files(inputs, 'control')[0] || '',
      ipAdapterImage: files(inputs, 'style')[0] || '',
      photoMakerImages: files(inputs, 'identity'),
      videoMode: request.mode === 'video'
    }
    const extra: GenerationPayload = {
      refImages: files(inputs, 'reference'),
      endImagePath: files(inputs, 'end')[0] || undefined,
      strength: start ? base.img2imgStrength : undefined
    }
    const payload = buildGenerationPayload(config, {
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      styleKit: library.activeKit,
      width: request.width,
      height: request.height,
      extra
    })
    if (!supportsRefImageArgs.value) delete payload.refImageArgs
    else if (refImageCliFlag.value) payload.refImageCliFlag = refImageCliFlag.value
    return payload
  }

  /** The server decides whether a run uses the kept-loaded model (same for LAN devices). */
  function endpointFor(request: CreateRequest): string {
    if (request.mode === 'video') return '/api/generate-video'
    if (request.mode === 'edit' && request.mask) return '/api/inpaint'
    return '/api/generate-cli'
  }

  /** Validate, add a running row and queue the job. Returns an error message or ''. */
  function submit(request: CreateRequest): string {
    const config = configStore.configFor(SURFACE[request.mode])
    if (!mainModel(config)) return 'Choose a model first.'
    if (request.mode === 'edit' && !request.inputs.some((i) => i.role !== 'mask')) {
      return 'Attach the image you want to edit.'
    }

    const payload = buildPayload(request)
    const endpoint = endpointFor(request)
    const row: SessionRow = {
      id: createLibraryId('row'),
      mode: request.mode,
      status: 'running',
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      model: setupSummary(pickSetup(config)),
      width: request.width,
      height: request.height,
      seed: request.seed,
      count: request.count,
      inputs: request.inputs,
      outputs: [],
      error: '',
      startedAt: Date.now(),
      finishedAt: 0,
      by: library.memberName,
      setup: pickSetup(config)
    }
    void sessions.saveRow(row)

    const formParts: FormPart[] | undefined = request.mask
      ? [
          ...payloadParts(payload),
          { name: 'mask', type: 'file', file: new File([request.mask], 'mask.png') }
        ]
      : undefined

    const finish = (patch: Partial<SessionRow>): void => {
      void sessions.saveRow({ ...row, ...patch, finishedAt: Date.now() })
    }

    queue.enqueue({
      surface: QUEUE_SURFACE[request.mode],
      kind: formParts ? 'form' : 'json',
      endpoint,
      jsonBody: formParts ? undefined : payload,
      formParts,
      label: request.prompt || request.mode,
      prompt: request.prompt,
      seed: request.seed,
      width: request.width,
      height: request.height,
      onStart: () => {
        runningRowId.value = row.id
        progress.start()
        preview.startPreviewPolling(() => runningRowId.value === row.id)
      },
      onSuccess: (result: GenApiResult) => {
        if (result.message === 'Cancelled') return finish({ status: 'cancelled' })
        const outputs = result.filenames?.length
          ? result.filenames
          : result.filename
            ? [result.filename]
            : []
        finish({ status: 'done', outputs })
      },
      onError: (message: string) => finish({ status: 'failed', error: message }),
      onSettled: () => {
        if (runningRowId.value === row.id) runningRowId.value = ''
        progress.stop()
        preview.stopPreviewPolling({ clearFrame: true })
      }
    })
    return ''
  }

  /** Re-run a finished row with the same inputs (new random seed unless it had a fixed one). */
  function retry(row: SessionRow): string {
    if (row.setup) configStore.updateSetup(SURFACE[row.mode], row.setup)
    return submit({
      mode: row.mode,
      prompt: row.prompt,
      negativePrompt: row.negativePrompt,
      inputs: row.inputs.filter((input) => input.role !== 'mask'),
      count: row.count,
      seed: row.seed,
      width: row.width,
      height: row.height
    })
  }

  /** Upscale one result with the setup's upscaler; the result lands as a new row. */
  function upscale(file: string): string {
    const config = configStore.configFor('image')
    if (!config.upscaleModel) return 'Choose an upscaler under Options → Output first.'
    const row: SessionRow = {
      id: createLibraryId('row'),
      mode: 'image',
      status: 'running',
      prompt: `Upscale of ${file}`,
      negativePrompt: '',
      model: config.upscaleModel,
      width: 0,
      height: 0,
      seed: -1,
      count: 1,
      inputs: [{ file, role: 'start' }],
      outputs: [],
      error: '',
      startedAt: Date.now(),
      finishedAt: 0,
      by: library.memberName,
      setup: null
    }
    void sessions.saveRow(row)
    const finish = (patch: Partial<SessionRow>): void => {
      void sessions.saveRow({ ...row, ...patch, finishedAt: Date.now() })
    }
    queue.enqueue({
      surface: 'upscale',
      kind: 'json',
      endpoint: '/api/upscale',
      jsonBody: { filename: file, upscaleModel: config.upscaleModel },
      label: `Upscale ${file}`,
      onStart: () => progress.start(),
      onSuccess: (result) =>
        finish({
          status: result.message === 'Cancelled' ? 'cancelled' : 'done',
          outputs: result.filenames || (result.filename ? [result.filename] : [])
        }),
      onError: (message) => finish({ status: 'failed', error: message }),
      onSettled: () => progress.stop()
    })
    return ''
  }

  return {
    submit,
    retry,
    upscale,
    cancel: queue.cancelCurrent,
    runningRowId,
    previewImage: preview.previewImage,
    progress
  }
}

function payloadParts(payload: GenerationPayload): FormPart[] {
  const parts: FormPart[] = []
  for (const [name, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue
    if (value === '' && name !== 'prompt' && name !== 'negative_prompt') continue
    parts.push({
      name,
      type: 'text',
      value: typeof value === 'object' ? JSON.stringify(value) : String(value)
    })
  }
  return parts
}
