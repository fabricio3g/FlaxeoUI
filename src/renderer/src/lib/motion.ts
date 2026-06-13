export const springTransition = {
  type: 'spring',
  stiffness: 320,
  damping: 30,
  mass: 0.7
}

export const softSpringTransition = {
  type: 'spring',
  stiffness: 220,
  damping: 26,
  mass: 0.8
}

export const routeMotion = {
  initial: { opacity: 0, y: 12, scale: 0.992 },
  enter: { opacity: 1, y: 0, scale: 1, transition: softSpringTransition },
  leave: { opacity: 0, y: -8, scale: 0.995, transition: { duration: 140 } }
}

export const panelMotion = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: softSpringTransition }
}

export const buttonMotion = {
  hovered: { y: -1, scale: 1.04, transition: springTransition },
  tapped: { y: 0, scale: 0.94, transition: { duration: 80 } }
}

export const subtleButtonMotion = {
  hovered: { y: -1, scale: 1.015, transition: springTransition },
  tapped: { y: 0, scale: 0.98, transition: { duration: 80 } }
}

export const toastMotion = {
  initial: { opacity: 0, x: 28, scale: 0.96 },
  enter: { opacity: 1, x: 0, scale: 1, transition: springTransition },
  leave: { opacity: 0, x: 24, scale: 0.96, transition: { duration: 160 } }
}

export function staggeredCardMotion(index: number) {
  return {
    initial: { opacity: 0, y: 14, scale: 0.97 },
    enter: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { ...softSpringTransition, delay: Math.min(index, 16) * 25 }
    },
    hovered: { y: -3, scale: 1.015, transition: springTransition },
    tapped: { y: 0, scale: 0.985, transition: { duration: 80 } }
  }
}
