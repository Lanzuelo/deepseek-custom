/** Device-local Agent/Chat mode preference; only the enum is stored. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The two product modes. */
export type ChatMode = 'agent' | 'chat'

/** Device-local storage key; a value of any other shape falls back to `agent`. */
export const CHAT_MODE_STORAGE_KEY = 'dsh.chat-mode.v1'

/**
 * Validate a stored or user-supplied mode.
 * @param value - decoded storage value or command payload.
 * @returns the mode when it names one of the two supported values.
 */
export function decodeChatMode(value: unknown): ChatMode | undefined {
  return value === 'agent' || value === 'chat' ? value : undefined
}

/**
 * Read the remembered mode, defaulting to the agent mode on any doubt.
 * @returns the stored mode, or `agent` when storage is absent, corrupt, or unknown.
 */
export function readStoredChatMode(): ChatMode {
  try {
    if (typeof localStorage === 'undefined') return 'agent'
    const raw = localStorage.getItem(CHAT_MODE_STORAGE_KEY)
    if (raw === null) return 'agent'
    const parsed: unknown = JSON.parse(raw)
    return decodeChatMode(parsed) ?? 'agent'
  } catch {
    return 'agent'
  }
}

/** Shared mode source and its only mutation. */
export interface ChatModeHandle {
  readonly mode: SnapshotStore<ChatMode>
  /** @param next - mode to publish and remember on this device. */
  set(next: ChatMode): void
}

/**
 * Create the process-local mode preference.
 * @returns the observable mode plus its setter.
 */
export function createChatModeStore(): ChatModeHandle {
  const mode = createSnapshotStore<ChatMode>(readStoredChatMode())
  return {
    mode,
    set(next) {
      mode.set(next)
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(CHAT_MODE_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Device storage can be unavailable; the in-memory choice stays usable.
      }
    },
  }
}
