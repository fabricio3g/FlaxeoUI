/**
 * API service for FlaxeoUI backend communication
 * The backend server runs on a dynamic port, defaulting to 3000
 */

export const API_BASE = 'http://localhost:3000'

/**
 * Get full URL for output images
 */
export function getOutputUrl(filename: string): string {
    return `${API_BASE}/output/${filename}`
}

/**
 * Generic API request function
 * @param endpoint - API endpoint path
 * @param options - Fetch options
 * @returns Parsed JSON response
 */
export async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
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
export async function apiPost<T>(endpoint: string, data: any): Promise<T> {
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
    const response = await fetch(`${API_BASE}${endpoint}`, {
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
