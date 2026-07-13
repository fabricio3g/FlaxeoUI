import { computed, readonly, ref } from 'vue'
import type { LanAccessLevel } from '../../../shared/lan'
import { lanAccessIncludes } from '../../../shared/lanPolicy'
import { isRemoteBrowser } from '@/services/api'

const accessLevel = ref<LanAccessLevel | null>(null)

export function setRemoteAccessLevel(value: LanAccessLevel | null): void {
  accessLevel.value = value
}

export function useRemoteSession() {
  const isRemote = isRemoteBrowser()
  const canViewGallery = computed(
    () => !isRemote || lanAccessIncludes(accessLevel.value, 'gallery')
  )
  const canControl = computed(() => !isRemote || lanAccessIncludes(accessLevel.value, 'control'))

  return {
    isRemote,
    accessLevel: readonly(accessLevel),
    canViewGallery,
    canControl
  }
}
