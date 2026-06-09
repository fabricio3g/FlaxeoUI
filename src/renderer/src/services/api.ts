/**
 * API service for FlaxeoUI backend communication
 * The backend server port is dynamically determined from IPC or defaults to 3000
 */

// Dynamic port - will be set from Electron IPC on app init
let serverPort = 3000

/**
 * Initialize the API with the actual server port
 * Called from App.vue after getting port from Electron IPC
 */
export function initializeApi(port: number): void {
  serverPort = port
  console.log('[API] Initialized with port:', port)
}

/**
 * Get the current API base URL
 */
export function getApiBase(): string {
  // In Electron, window.location.hostname is file:// or empty, use localhost
  const hostname = window.location.hostname || 'localhost'
  return `http://${hostname}:${serverPort}`
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
export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getApiBase()}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || `Request failed: ${response.status}`)
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
  const response = await fetch(`${getApiBase()}${endpoint}`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || `Request failed: ${response.status}`)
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
  BACKEND_RELEASES: '/api/backend/releases',
  BACKEND_DOWNLOAD: '/api/backend/download',
  BACKEND_SET_ACTIVE: '/api/backend/set-active',

  // Network
  NETWORK_STATUS: '/api/network/status',
  NETWORK_NGROK: '/api/network/ngrok',
  NETWORK_CLOUDFLARE: '/api/network/cloudflare'
} as const
