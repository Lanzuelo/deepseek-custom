/** Structural type of the Desktop Chat bridge; a plain Web client exposes none. */

/** Bounds in desktop content coordinates. */
export interface ChatBounds { x: number; y: number; width: number; height: number }

/** Why the embedded document cannot be shown. */
export type ChatFailure = 'network' | 'crashed' | 'unavailable'

/** Local web-chat profile metadata; it never contains a credential. */
export interface ChatProfileView {
  readonly id: string
  readonly label: string
  readonly createdAt: number
  readonly lastUsedAt: number
}

/** Process-local state of the embedded document. */
export interface ChatSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly failure?: ChatFailure
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly activeProfileId: string | null
  readonly profiles: readonly ChatProfileView[]
  readonly origin: string
}

/** Commands the trusted Desktop renderer may issue; the main process owns the view. */
export interface ChatBridge {
  snapshot(): Promise<ChatSnapshot>
  open(profileId: string | null, bounds: ChatBounds): Promise<ChatSnapshot>
  close(): Promise<void>
  setBounds(bounds: ChatBounds): Promise<void>
  reload(): Promise<void>
  back(): Promise<void>
  forward(): Promise<void>
  openExternal(): Promise<void>
  createProfile(label: string): Promise<ChatSnapshot>
  selectProfile(id: string): Promise<ChatSnapshot>
  renameProfile(id: string, label: string): Promise<ChatSnapshot>
  deleteProfile(id: string): Promise<ChatSnapshot>
  clearProfile(id: string): Promise<ChatSnapshot>
  subscribe(listener: (state: ChatSnapshot) => void): () => void
}

/**
 * Read the Desktop Chat bridge installed by the application preload.
 * @returns the bridge, or undefined in a plain browser build.
 */
export function readChatBridge(): ChatBridge | undefined {
  return (globalThis as typeof globalThis & { dshChat?: ChatBridge }).dshChat
}
