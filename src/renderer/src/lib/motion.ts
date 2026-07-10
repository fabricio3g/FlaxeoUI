export const quickTransition = {
  type: 'tween',
  duration: 0.14,
  ease: 'easeOut'
} as const

export const panelTransition = {
  type: 'tween',
  duration: 0.2,
  ease: 'easeOut'
} as const

export const routeMotion = {
  initial: { opacity: 0, y: 12, scale: 0.992 },
  enter: { opacity: 1, y: 0, scale: 1, transition: panelTransition },
  leave: { opacity: 0, y: -8, scale: 0.995, transition: { ...quickTransition, duration: 0.14 } }
}

export const panelMotion = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: panelTransition }
}

export const buttonMotion = {
  hovered: { y: -1, scale: 1.03, transition: quickTransition },
  tapped: { y: 0, scale: 0.97, transition: { ...quickTransition, duration: 0.08 } }
}

export const subtleButtonMotion = {
  hovered: { y: -1, scale: 1.01, transition: quickTransition },
  tapped: { y: 0, scale: 0.98, transition: { ...quickTransition, duration: 0.08 } }
}

export const toastMotion = {
  initial: { opacity: 0, x: 28, scale: 0.96 },
  enter: { opacity: 1, x: 0, scale: 1, transition: panelTransition },
  leave: { opacity: 0, x: 24, scale: 0.96, transition: { ...quickTransition, duration: 0.16 } }
}

export function staggeredCardMotion(index: number) {
  return {
    initial: { opacity: 0, y: 14, scale: 0.97 },
    enter: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { ...panelTransition, delay: Math.min(index, 16) * 0.025 }
    },
    hovered: { y: -2, scale: 1.01, transition: quickTransition },
    tapped: { y: 0, scale: 0.985, transition: { ...quickTransition, duration: 0.08 } }
  }
}
