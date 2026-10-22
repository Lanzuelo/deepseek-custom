// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAT_MODE_STORAGE_KEY, createChatModeStore, decodeChatMode, readStoredChatMode } from '../src/client/mode.ts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('chat mode preference', () => {
  it('accepts only the two supported values', () => {
    expect(decodeChatMode('agent')).toBe('agent')
    expect(decodeChatMode('chat')).toBe('chat')
    expect(decodeChatMode('other')).toBeUndefined()
    expect(decodeChatMode(1)).toBeUndefined()
  })

  it('falls back to the agent mode for absent, corrupt, or unknown storage', () => {
    expect(readStoredChatMode()).toBe('agent')
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, '{')
    expect(readStoredChatMode()).toBe('agent')
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, '"other"')
    expect(readStoredChatMode()).toBe('agent')
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, '"chat"')
    expect(readStoredChatMode()).toBe('chat')
  })

  it('publishes and persists a selection', () => {
    const handle = createChatModeStore()
    expect(handle.mode.getSnapshot()).toBe('agent')
    handle.set('chat')
    expect(handle.mode.getSnapshot()).toBe('chat')
    expect(localStorage.getItem(CHAT_MODE_STORAGE_KEY)).toBe('"chat"')
  })

  it('keeps the in-memory choice when device storage refuses the write', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const handle = createChatModeStore()
    handle.set('chat')
    expect(handle.mode.getSnapshot()).toBe('chat')
    expect(write).toHaveBeenCalled()
  })
})
