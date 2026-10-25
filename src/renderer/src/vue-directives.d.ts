import type { Directive } from 'vue'
import type { TipValue } from './lib/tooltip'

declare module 'vue' {
  interface ComponentCustomProperties {
    vTip: Directive<HTMLElement, TipValue>
  }
}

export {}
