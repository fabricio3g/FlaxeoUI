/**
 * API service for Flaxeo Image backend communication
 * The backend server port is dynamically determined from IPC or defaults to 3000
 */

// Dynamic port - will be set from Electron IPC on app init
let serverPort = 3000
let desktopApiToken = ''

/**
 * Initialize the API with the actual server port
 * Called from App.vue after getting port from Electron IPC
 */
export function initializeApi(port: number, token = ''): void {
  serverPort = port
  desktopApiToken = token
  console.log('[API] Initialized with port:', port)
}

/**
 * Get the current API base URL
 */
export function getApiBase(): string {
  if (!window.electronAPI && /^https?:$/.test(window.location.protocol))
    return window.location.origin
  return `http://localhost:${serverPort}`
}

export function getDesktopApiToken(): string {
  return desktopApiToken
}

export function isRemoteBrowser(): boolean {
  if (window.electronAPI) return false
  if (window.location.protocol === 'file:') return false
  const hostname = window.location.hostname.toLowerCase()
  return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1'
}

// Legacy export for compatibility (uses getter)
export const API_BASE = new Proxy({} as { toString: () => string }, {
  get: () => getApiBase()
}) as unknown as string

/**
 * Get full URL for output images
 */
export function getOutputUrl(filename: string): string {
  return `${getApiBase()}/output/${filename}`
}

/**
 * Get full URL for local absolute paths (served via /api/file endpoint)
 * Critical for serving images from arbitrary paths (PhotoMaker, ControlNet) to remote devices
 */
export function getFileUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('blob:')) return path
  return `${getApiBase()}/api/file?path=${encodeURIComponent(path)}`
}

/**
 * Generic API request function
 * @param endpoint - API endpoint path
 * @param options - Fetch options
 * @returns Parsed JSON response
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function errorFromResponseBody(text: string, status: number): ApiError {
  if (!text) return new ApiError(`Request failed: ${status}`, status)
  try {
    const parsed = JSON.parse(text) as {
      message?: string
      error?: string
      title?: string
      detail?: string
      hint?: string
    }
    if (parsed.message) return new ApiError(parsed.message, status)
    if (parsed.title && parsed.detail) {
      const hint = parsed.hint ? ` ${parsed.hint}` : ''
      return new ApiError(`${parsed.title}: ${parsed.detail}${hint}`, status)
    }
    if (parsed.error) return new ApiError(String(parsed.error), status)
  } catch {
    // plain text body
  }
  return new ApiError(text, status)
}

function notifyAuthenticationRequired(status: number): void {
  if (status === 401 && !window.electronAPI) window.dispatchEvent(new Event('flaxeo-auth-required'))
}

export async function authenticatedFetch(
  input: string | URL,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers)
  const target = new URL(String(input), window.location.href)
  const backendOrigin = new URL(getApiBase()).origin
  if (desktopApiToken && target.origin === backendOrigin)
    headers.set('X-Flaxeo-Desktop-Token', desktopApiToken)
  const response = await fetch(input, { credentials: 'include', ...options, headers })
  notifyAuthenticationRequired(response.status)
  return response
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(`${getApiBase()}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(desktopApiToken ? { 'X-Flaxeo-Desktop-Token': desktopApiToken } : {}),
      ...options.headers
    },
    ...options
  })

  if (!response.ok) {
    const error = await response.text()
    throw errorFromResponseBody(error, response.status)
  }

  return response.json()
}

/**
 * POST request helper
 * @param endpoint - API endpoint path
 * @param data - Request body data
 * @returns Parsed JSON response
 */
export async function apiPost<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * GET request helper
 * @param endpoint - API endpoint path
 * @returns Parsed JSON response
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' })
}

/**
 * FormData POST request helper (for file uploads)
 * @param endpoint - API endpoint path
 * @param formData - FormData object
 * @returns Parsed JSON response
 */
export async function apiPostForm<T>(endpoint: string, formData: FormData): Promise<T> {
  const response = await authenticatedFetch(`${getApiBase()}${endpoint}`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw errorFromResponseBody(error, response.status)
  }

  return response.json()
}

/**
 * DELETE request helper
 * @param endpoint - API endpoint path
 * @returns Parsed JSON response
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' })
}

/**
 * API endpoints as constants for type safety
 */
export const API_ENDPOINTS = {
  // Status
  STATUS: '/api/status',

  // Models
  MODELS: '/api/models',

  // Generation
  GENERATE_CLI: '/api/generate-cli',
  GENERATE_REGIONAL: '/api/generate-regional',
  GENERATE_SERVER: '/api/generate',
  CANCEL_CLI: '/api/cancel-cli',
  CANCEL: '/api/cancel',
  GENERATION_PROGRESS: '/api/generation/progress',

  // Inpainting
  INPAINT: '/api/inpaint',

  // Video
  GENERATE_VIDEO: '/api/generate-video',

  // Gallery
  GALLERY: '/api/gallery',
  DELETE: '/api/delete',

  // Server control
  START: '/api/start',
  STOP: '/api/stop',

  // Backend management
  BACKEND_CONFIG: '/api/backend/config',
  BACKEND_CAPABILITIES: '/api/backend/capabilities',
  BACKEND_RELEASES: '/api/backend/releases',
  BACKEND_DOWNLOAD: '/api/backend/download',
  BACKEND_SET_ACTIVE: '/api/backend/set-active',

  // Upscale
  UPSCALE: '/api/upscale',

  // Network
  NETWORK_STATUS: '/api/network/status'
} as const
