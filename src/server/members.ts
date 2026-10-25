import type { Response } from 'express'
import type { AppContext } from './types'
import { cleanMemberName } from '../shared/library'

/** Who is making this request: a paired LAN device's name, or the desktop user's name. */
export function requestOwner(ctx: AppContext, res: Response): string {
  const session = res.locals.lanSession as { name?: string } | undefined
  if (session) return cleanMemberName(session.name, 'Guest device')
  return cleanMemberName(ctx.state.backendConfig.memberName, 'Desktop')
}
