import { ref } from 'vue'
import { apiGet, apiPost } from '@/services/api'

export interface BackendConfig {
    activeVersion: string
    customBinaryExists: boolean
    installedVersions: string[]
    activeBackendPath: string
    activeBackendValid: boolean
}

export interface Release {
    tag: string
    name: string
    published: string
    assets: Array<{
        name: string
        size: number
        url: string
    }>
}

/**
 * useBackend() - Composable for backend binary management
 * 
 * Handles sd-cli binary version management:
 * - Fetching available GitHub releases
 * - Downloading and installing releases
 * - Switching between installed versions
 * 
 * @returns {Object} Backend state and methods
 */
export function useBackend() {
    const config = ref<BackendConfig>({
        activeVersion: 'custom',
        customBinaryExists: false,
        installedVersions: [],
        activeBackendPath: '',
        activeBackendValid: false
    })

    const releases = ref<Release[]>([])
    const isDownloading = ref(false)

    /**
     * fetchConfig() - Fetches current backend configuration
     */
    async function fetchConfig(): Promise<void> {
        try {
            const data = await apiGet<BackendConfig>('/api/backend/config')
            config.value = data
        } catch (e) {
            console.error('Failed to fetch backend config:', e)
        }
    }

    /**
     * fetchReleases() - Fetches available releases from GitHub API
     */
    async function fetchReleases(): Promise<void> {
        try {
            const data = await apiGet<Release[]>('/api/backend/releases')
            releases.value = data
        } catch (e) {
            console.error('Failed to fetch releases:', e)
        }
    }

    /**
     * downloadRelease() - Downloads and installs a specific release
     * @param release - The release object to install
     */
    async function downloadRelease(release: Release): Promise<void> {
        if (release.assets.length === 0) return

        isDownloading.value = true
        try {
            // Find the appropriate asset for the current platform
            const asset = release.assets[0] // TODO: Platform detection
            await apiPost('/api/backend/download', {
                url: asset.url,
                variant: asset.name,
                version: release.tag
            })
            await fetchConfig()
        } catch (e) {
            console.error('Download failed:', e)
        } finally {
            isDownloading.value = false
        }
    }

    /**
     * setActiveVersion() - Sets the active backend version
     * @param version - Version tag or 'custom'
     */
    async function setActiveVersion(version: string): Promise<void> {
        try {
            await apiPost('/api/backend/set-active', { version })
            config.value.activeVersion = version
        } catch (e) {
            console.error('Failed to set version:', e)
        }
    }

    return {
        config,
        releases,
        isDownloading,
        fetchConfig,
        fetchReleases,
        downloadRelease,
        setActiveVersion
    }
}
