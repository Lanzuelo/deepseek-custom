/** Private channels and payloads for the embedded DeepSeek Chat surface. */

/** Desktop-only channels; the trusted application renderer owns every command. */
export const CHAT_IPC = {
  snapshot: 'dsh-chat:snapshot',
  state: 'dsh-chat:state',
  open: 'dsh-chat:open',
  close: 'dsh-chat:close',
  bounds: 'dsh-chat:bounds',
  reload: 'dsh-chat:reload',
  back: 'dsh-chat:back',
  forward: 'dsh-chat:forward',
  openExternal: 'dsh-chat:open-external',
  createProfile: 'dsh-chat:create-profile',
  selectProfile: 'dsh-chat:select-profile',
  renameProfile: 'dsh-chat:rename-profile',
  deleteProfile: 'dsh-chat:delete-profile',
  clearProfile: 'dsh-chat:clear-profile',
} as const

/** Bounds in desktop content coordinates, supplied by the owned application renderer. */
export interface ChatBounds { x: number; y: number; width: number; height: number }

/** Local web-chat profile metadata; it never contains a credential. */
export interface ChatProfileView {
  readonly id: string
  readonly label: string
  readonly createdAt: number
  readonly lastUsedAt: number
}

/** Why the embedded document cannot be shown. */
export type ChatFailure = 'network' | 'crashed' | 'unavailable'

/** Process-local state of the embedded document. */
export interface ChatViewSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly failure?: ChatFailure
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly activeProfileId: string | null
  readonly profiles: readonly ChatProfileView[]
  /** Official chat origin; the renderer offers it as an external-browser link. */
  readonly origin: string
}
