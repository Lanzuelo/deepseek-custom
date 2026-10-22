/** Origin-scoped boot, native directory selection, host paths of picked files, and update presentation with native confirmation actions. */

import type { DesktopShortcutInput, ShortcutConfigSnapshot, ShortcutSaveResult } from '@deepseek-ai/dsh-client-shortcuts/protocol'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DESKTOP_IPC, SCHEME, type DshDesktopProductApi, type DesktopUpdatePresentation } from './ipc.ts'
import { PLATFORM_IPC } from './platform-ipc.ts'
import { CHAT_IPC, type ChatBounds, type ChatViewSnapshot } from './chat-view-ipc.ts'
import { markDocumentPlatform, syncWindowFullscreen } from './preload-platform.ts'
import { syncNativeTheme } from './preload-theme.ts'
import { syncWindowsAppearance } from './preload-windows.ts'
import { installMandatoryUpdateOverlay } from './preload-mandatory-overlay.ts'
import { createDesktopBrowserBridge } from './preload-browser.ts'

function createChatBridge() {
  const command = (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args)
  return {
    snapshot: () => command(CHAT_IPC.snapshot) as Promise<ChatViewSnapshot>,
    open: (profileId: string | null, bounds: ChatBounds) => command(CHAT_IPC.open, profileId, bounds) as Promise<ChatViewSnapshot>,
    close: () => command(CHAT_IPC.close) as Promise<void>,
    setBounds: (bounds: ChatBounds) => command(CHAT_IPC.bounds, bounds) as Promise<void>,
    reload: () => command(CHAT_IPC.reload) as Promise<void>,
    back: () => command(CHAT_IPC.back) as Promise<void>,
    forward: () => command(CHAT_IPC.forward) as Promise<void>,
    openExternal: () => command(CHAT_IPC.openExternal) as Promise<void>,
    createProfile: (label: string) => command(CHAT_IPC.createProfile, label) as Promise<ChatViewSnapshot>,
    selectProfile: (id: string) => command(CHAT_IPC.selectProfile, id) as Promise<ChatViewSnapshot>,
    renameProfile: (id: string, label: string) => command(CHAT_IPC.renameProfile, id, label) as Promise<ChatViewSnapshot>,
    deleteProfile: (id: string) => command(CHAT_IPC.deleteProfile, id) as Promise<ChatViewSnapshot>,
    clearProfile: (id: string) => command(CHAT_IPC.clearProfile, id) as Promise<ChatViewSnapshot>,
    subscribe(listener: (state: ChatViewSnapshot) => void): () => void {
      const handle = (_event: Electron.IpcRendererEvent, state: ChatViewSnapshot): void => { listener(state) }
      ipcRenderer.on(CHAT_IPC.state, handle)
      return () => { ipcRenderer.off(CHAT_IPC.state, handle) }
    },
  }
}

function createProductApi(): DshDesktopProductApi {
  return {
    protocolVersion: 1,
    browser: createDesktopBrowserBridge(),
    deviceInfo: () => ipcRenderer.invoke(DESKTOP_IPC.deviceInfo) as Promise<string>,
    keyboard: {
      closeWindow: revision => ipcRenderer.invoke(DESKTOP_IPC.shortcutsCloseWindow, revision) as Promise<void>,
      subscribe: (listener) => {
        const handle = (_event: Electron.IpcRendererEvent, input: DesktopShortcutInput): void => {
          if (input.kind === 'iframe') {
            const element = document.activeElement
            if (!(element instanceof HTMLIFrameElement) || !element.isConnected
              || !element.matches('iframe[data-sidebar-browser-frame], iframe[data-html-preview]')) return
            if (input.frameName === '' || element.name !== input.frameName) return
          }
          if (input.kind === 'webview') {
            const element = document.activeElement
            if (element?.matches('webview[data-sidebar-browser-frame]') !== true || !element.isConnected
              || input.frameName === '' || element.getAttribute('name') !== input.frameName) return
          }
          listener(input)
        }
        ipcRenderer.on(DESKTOP_IPC.shortcutsInput, handle)
        return () => { ipcRenderer.off(DESKTOP_IPC.shortcutsInput, handle) }
      },
    },
    shortcuts: {
      get: definitions => ipcRenderer.invoke(DESKTOP_IPC.shortcutsGet, definitions) as Promise<ShortcutConfigSnapshot>,
      edit: (edit, revision) => ipcRenderer.invoke(DESKTOP_IPC.shortcutsEdit, edit, revision) as Promise<ShortcutSaveResult>,
      recording: active => ipcRenderer.invoke(DESKTOP_IPC.shortcutsRecording, active) as Promise<void>,
      subscribe(listener) {
        const handle = (_event: Electron.IpcRendererEvent, snapshot: ShortcutConfigSnapshot): void => { listener(snapshot) }
        ipcRenderer.on(DESKTOP_IPC.shortcutsChanged, handle)
        return () => { ipcRenderer.off(DESKTOP_IPC.shortcutsChanged, handle) }
      },
    },
    updates: {
      status: () => ipcRenderer.invoke(DESKTOP_IPC.updatesStatus) as Promise<DesktopUpdatePresentation>,
      open: () => ipcRenderer.invoke(DESKTOP_IPC.updatesOpen) as Promise<void>,
      subscribe(listener) {
        const handle = (_event: Electron.IpcRendererEvent, state: DesktopUpdatePresentation): void => { listener(state) }
        ipcRenderer.on(DESKTOP_IPC.updatesPresentation, handle)
        return () => { ipcRenderer.off(DESKTOP_IPC.updatesPresentation, handle) }
      },
    },
  }
}

if (location.protocol === `${SCHEME}:` && location.hostname === 'app') {
  contextBridge.exposeInMainWorld('dshOnboarding', {
    hasApiKey: () => ipcRenderer.invoke(DESKTOP_IPC.onboardingApiKey) as Promise<boolean>,
    setActive: (active: boolean) => { ipcRenderer.send(DESKTOP_IPC.onboardingActive, active) },
  })
  ipcRenderer.on(DESKTOP_IPC.enterWorkspace, () => {
    const body = document.body
    const previous = body.getAttribute('tabindex')
    body.tabIndex = -1
    body.focus({ preventScroll: true })
    if (previous === null) body.removeAttribute('tabindex')
    else body.setAttribute('tabindex', previous)
  })
  syncWindowsAppearance()
  if (process.platform === 'win32') installMandatoryUpdateOverlay()
  contextBridge.exposeInMainWorld('__DSH_DIRECTORY_PICKER__', {
    pick: () => ipcRenderer.invoke(DESKTOP_IPC.directoryPick) as Promise<string | null>,
  })
  // The composer cites dropped, picked, and pasted files and folders that
  // have a real path as `@path` references instead of uploading them; a
  // File without one (pasted bytes) answers '' and uploads as before.
  contextBridge.exposeInMainWorld('__DSH_HOST_PATHS__', {
    pathFor: (file: File) => webUtils.getPathForFile(file),
  })
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: () => ipcRenderer.invoke(DESKTOP_IPC.boot) as Promise<unknown>,
    failed: (message: string) => ipcRenderer.invoke(DESKTOP_IPC.bootFailed, message) as Promise<void>,
  })
  contextBridge.exposeInMainWorld('dshPlatform', {
    open: (page: 'usage' | 'top-up', bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke(PLATFORM_IPC.open, page, bounds),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke(PLATFORM_IPC.bounds, bounds),
    close: () => ipcRenderer.invoke(PLATFORM_IPC.close),
  })
  if (process.isMainFrame) contextBridge.exposeInMainWorld('dshChat', createChatBridge())
}

markDocumentPlatform()
syncWindowFullscreen()
syncNativeTheme()
// Main-process IPC also verifies the owning window and top frame.
contextBridge.exposeInMainWorld('dshDesktop', location.protocol === `${SCHEME}:` && location.hostname === 'app' && process.isMainFrame ? createProductApi() : { protocolVersion: 1 })

if (location.protocol === `${SCHEME}:` && location.hostname === 'app') {
  contextBridge.exposeInMainWorld('__DSH_LOCALE__', {
    read: () => ipcRenderer.invoke(DESKTOP_IPC.localeBootstrap),
    onChange: (locale: string) => { ipcRenderer.send(DESKTOP_IPC.localeChanged, locale) },
  })
}
