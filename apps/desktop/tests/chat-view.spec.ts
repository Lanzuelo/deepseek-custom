import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopChatView, CHAT_ORIGIN, chatBounds, chatLabel } from '../src/chat-view.ts'

const state = vi.hoisted(() => ({
  views: [] as unknown[],
  partitions: [] as string[],
  sessions: [] as unknown[],
  openExternal: vi.fn(async () => {}),
  clearFailure: undefined as Error | undefined,
}))

vi.mock('electron', () => ({
  shell: { openExternal: state.openExternal },
  session: {
    fromPartition: vi.fn((partition: string) => {
      if (!state.partitions.includes(partition)) state.partitions.push(partition)
      const browserSession = {
        partition,
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        setDevicePermissionHandler: vi.fn(),
        clearStorageData: vi.fn(async () => {
          if (state.clearFailure !== undefined) throw state.clearFailure
        }),
        clearCache: vi.fn(async () => {}),
        clearAuthCache: vi.fn(async () => {}),
        closeAllConnections: vi.fn(async () => {}),
        flushStorageData: vi.fn(),
        isPersistent: () => partition.startsWith('persist:'),
      }
      state.sessions.push(browserSession)
      return browserSession
    }),
  },
  WebContentsView: class {
    webContents = Object.assign(new EventEmitter(), {
      navigationHistory: {
        canGoBack: () => false,
        canGoForward: () => false,
        goBack: vi.fn(),
        goForward: vi.fn(),
      },
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(async () => {}),
      reload: vi.fn(),
      isDestroyed: () => false,
      close: vi.fn(() => { this.webContents.emit('destroyed') }),
    })
    setVisible = vi.fn()
    setBounds = vi.fn()
    constructor() { state.views.push(this) }
  },
}))

let directory: string
let registryPath: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dsh-chat-view-'))
  registryPath = join(directory, 'chat-profiles.json')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
  state.views.length = 0
  state.partitions.length = 0
  state.sessions.length = 0
  state.clearFailure = undefined
  vi.clearAllMocks()
})

function owner() {
  const removeChildView = vi.fn()
  return Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), { send: vi.fn() }),
    contentView: { addChildView: vi.fn(), removeChildView },
    isDestroyed: () => false,
  })
}

function view() {
  return state.views.at(-1) as {
    setVisible: ReturnType<typeof vi.fn>
    setBounds: ReturnType<typeof vi.fn>
    webContents: EventEmitter & {
      loadURL: ReturnType<typeof vi.fn>
      setWindowOpenHandler: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      reload: ReturnType<typeof vi.fn>
      navigationHistory: { canGoBack: () => boolean; goBack: ReturnType<typeof vi.fn> }
    }
  }
}

const bounds = { x: 10, y: 20, width: 800, height: 600 }

function stored() {
  return JSON.parse(readFileSync(registryPath, 'utf8')) as {
    activeProfileId: string | null
    profiles: { id: string; label: string; partition: string }[]
    pendingCleanup: string[]
  }
}

describe('bounds and label validation', () => {
  it('accepts finite nonnegative rectangles and rounds them', () => {
    expect(chatBounds({ x: 1.4, y: 2.6, width: 10, height: 20 })).toEqual({ x: 1, y: 3, width: 10, height: 20 })
  })

  it('rejects malformed rectangles', () => {
    for (const value of [null, {}, { x: -1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: Number.NaN, height: 1 }]) {
      expect(() => chatBounds(value)).toThrow('Invalid chat bounds')
    }
  })

  it('trims labels and rejects empty or overlong ones', () => {
    expect(chatLabel('  Work   account ')).toBe('Work account')
    expect(chatLabel('   ')).toBeUndefined()
    expect(chatLabel('x'.repeat(41))).toBeUndefined()
    expect(chatLabel(7)).toBeUndefined()
  })
})

describe('profiles', () => {
  it('creates a default profile on first open and persists only non-secret metadata', async () => {
    const chat = new DesktopChatView(registryPath)
    const window = owner()
    await chat.open(window, null, bounds)
    const registry = stored()
    expect(registry.profiles).toHaveLength(1)
    expect(registry.activeProfileId).toBe(registry.profiles[0]!.id)
    expect(registry.profiles[0]!.partition).toMatch(/^persist:dsh-chat-/u)
    expect(JSON.stringify(registry)).not.toContain('cookie')
    expect(window.contentView.addChildView).toHaveBeenCalledOnce()
    expect(view().webContents.loadURL).toHaveBeenCalledWith(CHAT_ORIGIN)
    expect(view().setBounds).toHaveBeenCalledWith(bounds)
    expect(view().setVisible).toHaveBeenLastCalledWith(true)
  })

  it('creates, renames, selects, and deletes profiles', async () => {
    const chat = new DesktopChatView(registryPath)
    const first = await chat.createProfile('Personal')
    expect(first.profiles).toHaveLength(1)
    const second = await chat.createProfile('Work')
    expect(second.profiles).toHaveLength(2)
    const active = second.activeProfileId!
    const renamed = await chat.renameProfile(active, 'Office')
    expect(renamed.profiles.find(profile => profile.id === active)?.label).toBe('Office')
    const selected = await chat.selectProfile(second.profiles[0]!.id)
    expect(selected.activeProfileId).toBe(second.profiles[0]!.id)
    const deleted = await chat.deleteProfile(second.profiles[0]!.id)
    expect(deleted.profiles.map(profile => profile.label)).toEqual(['Office'])
    expect(state.partitions.some(partition => partition.startsWith('persist:dsh-chat-'))).toBe(true)
    await expect(chat.renameProfile(active, '  ')).rejects.toThrow('Invalid chat profile label')
    await expect(chat.selectProfile('missing')).rejects.toThrow('Unknown chat profile')
  })

  it('keeps a failed deletion recoverable and retries it on the next launch', async () => {
    const chat = new DesktopChatView(registryPath)
    const created = await chat.createProfile('Doomed')
    const profile = created.profiles[0]!
    const partition = stored().profiles[0]!.partition
    state.clearFailure = new Error('locked storage')
    await expect(chat.deleteProfile(profile.id)).rejects.toThrow('Chat storage cleanup failed')
    expect(stored().profiles).toHaveLength(1)
    expect(stored().pendingCleanup).toEqual([partition])

    state.clearFailure = undefined
    const relaunched = new DesktopChatView(registryPath)
    const snapshot = await relaunched.state()
    expect(snapshot.profiles).toHaveLength(1)
    expect(stored().pendingCleanup).toEqual([])
  })

  it('keeps the explicit partition when a profile is cleared', async () => {
    const chat = new DesktopChatView(registryPath)
    const created = await chat.createProfile('Account')
    const partition = stored().profiles[0]!.partition
    const cleared = await chat.clearProfile(created.profiles[0]!.id)
    expect(cleared.profiles).toHaveLength(1)
    expect(stored().profiles[0]!.partition).toBe(partition)
  })
})

describe('embedded document policy', () => {
  it('denies every permission and records the document state', async () => {
    const chat = new DesktopChatView(registryPath)
    const window = owner()
    await chat.open(window, null, bounds)
    const browserSession = state.sessions.at(-1) as {
      setPermissionRequestHandler: ReturnType<typeof vi.fn>
    }
    const request = browserSession.setPermissionRequestHandler.mock.calls[0]![0] as (
      contents: unknown, permission: string, callback: (granted: boolean) => void) => void
    const callback = vi.fn()
    request({}, 'media', callback)
    expect(callback).toHaveBeenCalledWith(false)
    expect(chat.activeProfileId()).not.toBeNull()
    await chat.reload()
    expect(view().webContents.reload).toHaveBeenCalledOnce()
  })

  it('blocks unknown origins and opens https destinations externally', async () => {
    const chat = new DesktopChatView(registryPath)
    const window = owner()
    await chat.open(window, null, bounds)
    const contents = view().webContents
    const blocked = { preventDefault: vi.fn() }
    contents.emit('will-navigate', blocked, 'https://evil.example/phish')
    expect(blocked.preventDefault).toHaveBeenCalledOnce()
    expect(state.openExternal).toHaveBeenCalledWith('https://evil.example/phish')
    const allowed = { preventDefault: vi.fn() }
    contents.emit('will-navigate', allowed, `${CHAT_ORIGIN}/sign_in`)
    expect(allowed.preventDefault).not.toHaveBeenCalled()
    const handler = contents.setWindowOpenHandler.mock.calls[0]![0] as (input: { url: string }) => { action: string }
    expect(handler({ url: 'https://platform.deepseek.com/usage' })).toEqual({ action: 'deny' })
    expect(state.openExternal).toHaveBeenCalledWith('https://platform.deepseek.com/usage')
  })

  it('reports a crashed document and keeps the view available for retry', async () => {
    const chat = new DesktopChatView(registryPath)
    const window = owner()
    await chat.open(window, null, bounds)
    view().webContents.emit('render-process-gone')
    const snapshot = await chat.state()
    expect(snapshot.status).toBe('error')
    expect(snapshot.failure).toBe('crashed')
  })

  it('destroys the view when the owning document navigates away', async () => {
    const chat = new DesktopChatView(registryPath)
    const window = owner()
    await chat.open(window, null, bounds)
    const contents = view().webContents
    window.webContents.emit('did-start-navigation', {}, 'dsh-app://app/other', false, true)
    expect(contents.close).toHaveBeenCalledOnce()
    expect(window.webContents.listenerCount('did-start-navigation')).toBe(0)
    expect((await chat.state()).status).toBe('idle')
  })

  it('rejects commands after disposal', async () => {
    const chat = new DesktopChatView(registryPath)
    await chat.dispose()
    await expect(chat.open(owner(), null, bounds)).rejects.toThrow('Chat view disposed')
  })

  it('ignores an unavailable profile id', async () => {
    const chat = new DesktopChatView(registryPath)
    await expect(chat.open(owner(), 'absent', bounds)).rejects.toThrow('Unknown chat profile')
  })
})
