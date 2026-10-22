/**
 * Main-process ownership of the embedded official DeepSeek Chat surface and
 * its local web-account profiles.
 *
 * The remote document lives in its own persistent Electron partition per
 * profile, with sandbox, context isolation and no preload or Node integration.
 * Harness never reads the page: it only owns the native view, the local
 * profile registry, navigation policy and the honest loading/error state the
 * trusted renderer displays.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { EventEmitter } from 'node:events'
import { dirname } from 'node:path'
import { session, shell, WebContentsView, type Session, type View } from 'electron'
import {
  CHAT_IPC,
  type ChatBounds,
  type ChatFailure,
  type ChatViewSnapshot,
} from './chat-view-ipc.ts'

/** The only origin the embedded document may navigate to. */
export const CHAT_ORIGIN = 'https://chat.deepseek.com'

/** Persisted registry of non-secret profile metadata. */
interface ChatRegistry {
  version: 1
  activeProfileId: string | null
  profiles: ChatProfileRecord[]
  /** Partitions whose deletion was persisted but not yet confirmed cleared. */
  pendingCleanup: string[]
}

interface ChatProfileRecord {
  id: string
  label: string
  partition: string
  createdAt: number
  lastUsedAt: number
}

type ChatOwner = Pick<EventEmitter, 'on' | 'removeListener'> & {
  webContents: Pick<EventEmitter, 'on' | 'removeListener'> & {
    send(channel: string, ...args: unknown[]): void
  }
  contentView: Pick<View, 'addChildView' | 'removeChildView'>
  isDestroyed(): boolean
}

/** Maximum locally registered web-chat profiles. */
const MAX_PROFILES = 8

/** Longest accepted user-supplied profile label. */
const MAX_LABEL = 40

const STORAGE_KINDS = ['cookies', 'filesystem', 'indexdb', 'cachestorage', 'serviceworkers', 'shadercache'] as const

/**
 * Decode the renderer rectangle before applying it to a native view.
 * @param value - IPC payload.
 * @returns finite, nonnegative integer coordinates.
 */
export function chatBounds(value: unknown): ChatBounds {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid chat bounds')
  const row = value as Record<string, unknown>
  const result: ChatBounds = { x: 0, y: 0, width: 0, height: 0 }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const n = row[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100_000) throw new Error('Invalid chat bounds')
    result[key] = Math.round(n)
  }
  return result
}

/**
 * Normalize a user-supplied profile label.
 * @param value - IPC payload.
 * @returns the trimmed label, or undefined when it is unusable.
 */
export function chatLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const label = value.trim().replace(/\s+/gu, ' ')
  if (label.length === 0 || label.length > MAX_LABEL) return undefined
  return label
}

/**
 * Embedded Chat view and profile registry owner.
 *
 * `open` is idempotent for the same profile and replaces the previous document
 * for another one. All commands are synchronous bookkeeping except profile
 * deletion, which awaits confirmed storage removal.
 */
export class DesktopChatView {
  private registry: ChatRegistry | undefined
  private loading: Promise<ChatRegistry> | undefined
  private writing: Promise<void> = Promise.resolve()
  private readonly configured = new WeakSet<Session>()
  private readonly cleanups = new Map<Session, Promise<void>>()
  private view: WebContentsView | undefined
  private owner: ChatOwner | undefined
  private releaseOwner: (() => void) | undefined
  private generation = 0
  private status: ChatViewSnapshot['status'] = 'idle'
  private failure: ChatFailure | undefined
  private disposed = false

  /**
   * @param registryPath - absolute path of the non-secret profile registry JSON.
   * @param options - injectable devtools policy, clock and id source for tests.
   */
  constructor(
    private readonly registryPath: string,
    private readonly options: {
      readonly devTools?: boolean
      readonly now?: () => number
      readonly nextId?: () => string
    } = {},
  ) {}

  /**
   * Read the current profile registry and embedded-document state.
   * @returns the safe renderer projection; no credential is included.
   */
  async state(): Promise<ChatViewSnapshot> {
    await this.ensureRegistry()
    return this.snapshot()
  }

  /**
   * Load the official chat document for one local profile.
   * @param owner - primary application window containing the view.
   * @param profileId - profile to mount, or the active/default profile when null.
   * @param bounds - owned renderer rectangle.
   */
  async open(owner: ChatOwner, profileId: string | null, bounds: ChatBounds): Promise<ChatViewSnapshot> {
    if (this.disposed) throw new Error('Chat view disposed')
    if (owner.isDestroyed()) return this.snapshot()
    const registry = await this.ensureRegistry()
    const profile = profileId === null ? await this.ensureProfile() : this.profile(profileId)
    if (profile === undefined) throw new Error('Unknown chat profile')
    registry.activeProfileId = profile.id
    profile.lastUsedAt = this.now()
    await this.persist()
    if (this.view !== undefined && this.owner === owner && this.profileId() === profile.id) {
      this.view.setBounds(bounds)
      this.view.setVisible(true)
      return this.snapshot()
    }
    this.close()
    if (owner.isDestroyed()) return this.snapshot()
    const generation = this.generation
    this.owner = owner
    const closeOwnedView = (): void => { if (generation === this.generation) this.close() }
    const navigateOwner = (_event: Electron.Event, _url: string, isInPlace: boolean, isMainFrame: boolean): void => {
      if (isMainFrame && !isInPlace) closeOwnedView()
    }
    owner.webContents.on('did-start-navigation', navigateOwner)
    owner.webContents.on('render-process-gone', closeOwnedView)
    owner.webContents.on('destroyed', closeOwnedView)
    owner.on('closed', closeOwnedView)
    this.releaseOwner = () => {
      owner.webContents.removeListener('did-start-navigation', navigateOwner)
      owner.webContents.removeListener('render-process-gone', closeOwnedView)
      owner.webContents.removeListener('destroyed', closeOwnedView)
      owner.removeListener('closed', closeOwnedView)
    }
    const browserSession = session.fromPartition(profile.partition)
    this.configure(browserSession)
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        devTools: this.options.devTools ?? false,
      },
    })
    this.view = view
    this.status = 'loading'
    this.failure = undefined
    this.bindDocument(view)
    view.setVisible(false)
    owner.contentView.addChildView(view)
    view.setBounds(bounds)
    this.publish()
    try {
      await view.webContents.loadURL(CHAT_ORIGIN)
    } catch (error) {
      // A document may replace its own URL during the first load (for example
      // while resolving a sign-in redirect), which aborts loadURL instead of
      // reporting a failed document.
      const aborted = error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED'
      if (!aborted) {
        if (generation === this.generation) {
          this.status = 'error'
          this.failure = 'network'
          this.publish()
        }
        return this.snapshot()
      }
    }
    if (generation === this.generation && this.view === view) {
      this.status = 'ready'
      this.failure = undefined
      view.setVisible(true)
      this.publish()
    }
    return this.snapshot()
  }

  /** @param bounds - current application viewport rectangle. */
  setBounds(bounds: ChatBounds): void { this.view?.setBounds(bounds) }

  /** Destroy the document while keeping its persistent profile storage. */
  close(): void {
    this.generation++
    const view = this.view
    this.view = undefined
    this.releaseOwner?.()
    this.releaseOwner = undefined
    const owner = this.owner
    this.owner = undefined
    this.status = 'idle'
    this.failure = undefined
    if (view === undefined) return
    if (owner !== undefined && !owner.isDestroyed()) owner.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
  }

  /** Notify the current owner of the current state. */
  publish(): void {
    const owner = this.owner
    if (owner === undefined || owner.isDestroyed()) return
    owner.webContents.send(CHAT_IPC.state, this.snapshot())
  }

  /** @returns the active profile, or null when the registry has none. */
  activeProfileId(): string | null { return this.registry?.activeProfileId ?? null }

  /** Refresh the projected state on the owner after registry-only changes. */
  refresh(): void { this.publish() }

  /** Reload the embedded document. */
  reload(): void {
    const view = this.view
    if (view === undefined) return
    this.status = 'loading'
    this.failure = undefined
    this.publish()
    view.webContents.reload()
  }

  /** Navigate the embedded document back when history allows it. */
  goBack(): void {
    const history = this.view?.webContents.navigationHistory
    if (history?.canGoBack() === true) history.goBack()
  }

  /** Navigate the embedded document forward when history allows it. */
  goForward(): void {
    const history = this.view?.webContents.navigationHistory
    if (history?.canGoForward() === true) history.goForward()
  }

  /** Open the official site in the operating system browser. */
  async openExternal(): Promise<void> { await shell.openExternal(CHAT_ORIGIN) }

  /**
   * Create a local web-chat profile.
   * @param label - user-supplied display label.
   * @returns the safe state after the new profile becomes active.
   */
  async createProfile(label: unknown): Promise<ChatViewSnapshot> {
    const registry = await this.ensureRegistry()
    const text = chatLabel(label) ?? 'DeepSeek'
    if (registry.profiles.length >= MAX_PROFILES) throw new Error('Too many chat profiles')
    const now = this.now()
    const profile: ChatProfileRecord = {
      id: this.nextId(), label: text, partition: `persist:dsh-chat-${this.nextId()}`,
      createdAt: now, lastUsedAt: now,
    }
    registry.profiles.push(profile)
    registry.activeProfileId = profile.id
    await this.persist()
    this.publish()
    return this.snapshot()
  }

  /**
   * Select one profile for the next document load.
   * @param id - profile to activate.
   */
  async selectProfile(id: unknown): Promise<ChatViewSnapshot> {
    const registry = await this.ensureRegistry()
    const profile = this.profile(id)
    if (profile === undefined) throw new Error('Unknown chat profile')
    if (registry.activeProfileId === profile.id) return this.snapshot()
    this.close()
    registry.activeProfileId = profile.id
    profile.lastUsedAt = this.now()
    await this.persist()
    this.publish()
    return this.snapshot()
  }

  /**
   * Rename one profile.
   * @param id - profile to rename.
   * @param label - new display label.
   */
  async renameProfile(id: unknown, label: unknown): Promise<ChatViewSnapshot> {
    await this.ensureRegistry()
    const profile = this.profile(id)
    const text = chatLabel(label)
    if (profile === undefined) throw new Error('Unknown chat profile')
    if (text === undefined) throw new Error('Invalid chat profile label')
    profile.label = text
    await this.persist()
    this.publish()
    return this.snapshot()
  }

  /**
   * Clear one partition's cookies and site storage, keeping the profile entry.
   * @param id - profile whose local sign-in is discarded.
   */
  async clearProfile(id: unknown): Promise<ChatViewSnapshot> {
    await this.ensureRegistry()
    const profile = this.profile(id)
    if (profile === undefined) throw new Error('Unknown chat profile')
    if (this.profileId() === profile.id) this.close()
    await this.clearPartition(profile.partition)
    this.publish()
    return this.snapshot()
  }

  /**
   * Remove a profile and destroy its partition.
   *
   * The partition is recorded as pending cleanup before removal so an
   * interrupted quit resumes the cleanup on the next launch.
   * @param id - profile to delete.
   */
  async deleteProfile(id: unknown): Promise<ChatViewSnapshot> {
    const registry = await this.ensureRegistry()
    const profile = this.profile(id)
    if (profile === undefined) return this.snapshot()
    if (this.profileId() === profile.id) this.close()
    registry.pendingCleanup = [...new Set([...registry.pendingCleanup, profile.partition])]
    await this.persist()
    try {
      await this.clearPartition(profile.partition)
    } catch (error) {
      // The pending entry stays persisted, so the next launch retries it.
      throw error
    }
    registry.pendingCleanup = registry.pendingCleanup.filter(partition => partition !== profile.partition)
    registry.profiles = registry.profiles.filter(candidate => candidate.id !== profile.id)
    if (registry.activeProfileId === profile.id) {
      registry.activeProfileId = registry.profiles[0]?.id ?? null
    }
    await this.persist()
    this.publish()
    return this.snapshot()
  }

  /** Destroy the document and stop accepting commands. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.close()
    await this.writing
  }

  /** @returns the current active profile id mounted in the native view. */
  private profileId(): string | null { return this.view === undefined ? null : this.activeProfileId() }

  private snapshot(): ChatViewSnapshot {
    const registry = this.registry
    return {
      status: this.status,
      ...this.failure === undefined ? {} : { failure: this.failure },
      canGoBack: this.view?.webContents.navigationHistory.canGoBack() ?? false,
      canGoForward: this.view?.webContents.navigationHistory.canGoForward() ?? false,
      activeProfileId: registry?.activeProfileId ?? null,
      profiles: (registry?.profiles ?? []).map(profile => ({
        id: profile.id, label: profile.label, createdAt: profile.createdAt, lastUsedAt: profile.lastUsedAt,
      })),
      origin: CHAT_ORIGIN,
    }
  }

  private profile(id: unknown): ChatProfileRecord | undefined {
    if (typeof id !== 'string') return undefined
    return this.registry?.profiles.find(profile => profile.id === id)
  }

  private now(): number { return (this.options.now ?? Date.now)() }

  private nextId(): string { return (this.options.nextId ?? randomUUID)() }

  private async ensureProfile(): Promise<ChatProfileRecord> {
    const registry = await this.ensureRegistry()
    const active = registry.profiles.find(profile => profile.id === registry.activeProfileId)
    if (active !== undefined) return active
    const existing = registry.profiles[0]
    if (existing !== undefined) {
      registry.activeProfileId = existing.id
      return existing
    }
    if (registry.profiles.length >= MAX_PROFILES) throw new Error('Too many chat profiles')
    const now = this.now()
    const profile: ChatProfileRecord = {
      id: this.nextId(), label: 'DeepSeek', partition: `persist:dsh-chat-${this.nextId()}`,
      createdAt: now, lastUsedAt: now,
    }
    registry.profiles.push(profile)
    registry.activeProfileId = profile.id
    await this.persist()
    return profile
  }

  private async ensureRegistry(): Promise<ChatRegistry> {
    if (this.registry !== undefined) return this.registry
    this.loading ??= this.readRegistry().then(async (registry) => {
      this.registry = registry
      await this.retryCleanup(registry)
      return registry
    })
    return this.loading
  }

  private async readRegistry(): Promise<ChatRegistry> {
    const empty = (): ChatRegistry => ({ version: 1, activeProfileId: null, profiles: [], pendingCleanup: [] })
    let raw: string
    try {
      raw = await readFile(this.registryPath, 'utf8')
    } catch {
      return empty()
    }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return empty() }
    if (typeof parsed !== 'object' || parsed === null) return empty()
    const value = parsed as Record<string, unknown>
    if (value.version !== 1) return empty()
    const profiles: ChatProfileRecord[] = []
    for (const entry of Array.isArray(value.profiles) ? value.profiles : []) {
      if (typeof entry !== 'object' || entry === null) continue
      const row = entry as Record<string, unknown>
      if (typeof row.id !== 'string' || row.id.length === 0 || row.id.length > 200) continue
      if (typeof row.partition !== 'string' || !row.partition.startsWith('persist:')) continue
      const label = chatLabel(row.label)
      if (label === undefined) continue
      if (typeof row.createdAt !== 'number' || typeof row.lastUsedAt !== 'number') continue
      profiles.push({ id: row.id, label, partition: row.partition, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt })
    }
    const ids = new Set(profiles.map(profile => profile.id))
    const activeProfileId = typeof value.activeProfileId === 'string' && ids.has(value.activeProfileId)
      ? value.activeProfileId : null
    const pendingCleanup = Array.isArray(value.pendingCleanup)
      ? value.pendingCleanup.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('persist:'))
      : []
    return { version: 1, activeProfileId, profiles: profiles.slice(0, MAX_PROFILES), pendingCleanup }
  }

  private async retryCleanup(registry: ChatRegistry): Promise<void> {
    if (registry.pendingCleanup.length === 0) return
    const remaining: string[] = []
    for (const partition of registry.pendingCleanup) {
      try { await this.clearPartition(partition) }
      catch { remaining.push(partition) }
    }
    if (remaining.length === registry.pendingCleanup.length) return
    registry.pendingCleanup = remaining
    await this.persist()
  }

  private persist(): Promise<void> {
    const registry = this.registry
    if (registry === undefined) return Promise.resolve()
    const contents = JSON.stringify(registry, null, 2)
    const write = this.writing.then(async () => {
      await mkdir(dirname(this.registryPath), { recursive: true })
      const temporary = `${this.registryPath}.${randomUUID()}.tmp`
      await writeFile(temporary, contents, { mode: 0o600 })
      await rename(temporary, this.registryPath)
    })
    this.writing = write.catch(() => {
      // The next persist retries from a fresh temporary file; the registry in memory stays authoritative.
    })
    return write
  }

  private configure(browserSession: Session): void {
    if (this.configured.has(browserSession)) return
    this.configured.add(browserSession)
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
    browserSession.setPermissionCheckHandler(() => false)
    browserSession.setDevicePermissionHandler(() => false)
  }

  private async clearPartition(partition: string): Promise<void> {
    const browserSession = session.fromPartition(partition)
    const previous = this.cleanups.get(browserSession) ?? Promise.resolve()
    const cleanup = previous.catch(() => undefined).then(async () => {
      await browserSession.closeAllConnections()
      const results = await Promise.allSettled([
        browserSession.clearStorageData({ storages: [...STORAGE_KINDS] }),
        browserSession.clearCache(),
        browserSession.clearAuthCache(),
      ])
      const failures = results.filter(result => result.status === 'rejected')
      if (failures.length > 0) throw new AggregateError(failures.map(result => result.reason), 'Chat storage cleanup failed')
    })
    this.cleanups.set(browserSession, cleanup.catch(() => undefined))
    await cleanup
  }

  private bindDocument(view: WebContentsView): void {
    const contents = view.webContents
    const allowNavigation = (url: string): boolean => {
      try {
        const parsed = new URL(url)
        return parsed.origin === CHAT_ORIGIN && !parsed.username && !parsed.password
      } catch { return false }
    }
    const isCurrent = (): boolean => this.view === view
    contents.setWindowOpenHandler(({ url }) => {
      // Sign-in, help and payment pages open in the operating system browser;
      // the embedded document never creates another renderer.
      if (URL.canParse(url)) {
        const destination = new URL(url)
        if (destination.protocol === 'https:' && !destination.username && !destination.password) {
          void shell.openExternal(url).catch(() => {
            // A browser-launch failure leaves the embedded page available for retry.
          })
        }
      }
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      if (allowNavigation(url)) return
      event.preventDefault()
      if (URL.canParse(url) && new URL(url).protocol === 'https:') void shell.openExternal(url).catch(() => undefined)
    })
    contents.on('will-redirect', (event, url) => {
      if (allowNavigation(url)) return
      event.preventDefault()
      if (URL.canParse(url) && new URL(url).protocol === 'https:') void shell.openExternal(url).catch(() => undefined)
    })
    contents.on('will-attach-webview', (event) => { event.preventDefault() })
    contents.on('did-start-loading', () => {
      if (!isCurrent()) return
      this.status = 'loading'
      this.publish()
    })
    contents.on('did-stop-loading', () => {
      if (!isCurrent()) return
      this.status = 'ready'
      this.failure = undefined
      this.publish()
    })
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      // A replaced document aborts its own first load; that is not a failure.
      if (!isCurrent() || !isMainFrame || code === -3) return
      this.status = 'error'
      this.failure = 'network'
      this.publish()
    })
    contents.on('render-process-gone', () => {
      if (!isCurrent()) return
      this.status = 'error'
      this.failure = 'crashed'
      this.publish()
    })
    contents.on('did-navigate', () => { if (isCurrent()) this.publish() })
    contents.on('did-navigate-in-page', () => { if (isCurrent()) this.publish() })
  }
}
