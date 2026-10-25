/** Main process → window notice about the local service (the Express server child process). */
export type ServerStatusEvent =
  | { state: 'reconnecting' }
  | { state: 'connected'; port: number; token: string }
  | { state: 'down'; error: string }
