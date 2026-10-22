// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ChatSurface, type ChatSurfaceProps } from '../src/client/ChatSurface.tsx'
import { readChatBridge, type ChatBridge, type ChatSnapshot } from '../src/client/chat-bridge.ts'
import { zh } from '../src/client/locales.ts'
import type { ChatMode } from '../src/client/mode.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t: ChatSurfaceProps['t'] = makeTranslate(zh)
const emptyView: ChatSnapshot = {
  status: 'idle', canGoBack: false, canGoForward: false, activeProfileId: null, profiles: [], origin: 'https://chat.deepseek.com',
}

function readyView(): ChatSnapshot {
  return {
    ...emptyView,
    status: 'ready',
    activeProfileId: 'p1',
    profiles: [{ id: 'p1', label: 'Work', createdAt: 1, lastUsedAt: 2 }],
  }
}

function bridge(overrides: Partial<ChatBridge> = {}): ChatBridge {
  return {
    snapshot: vi.fn(async () => emptyView),
    open: vi.fn(async () => readyView()),
    close: vi.fn(async () => {}),
    setBounds: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    back: vi.fn(async () => {}),
    forward: vi.fn(async () => {}),
    openExternal: vi.fn(async () => {}),
    createProfile: vi.fn(async () => readyView()),
    selectProfile: vi.fn(async () => readyView()),
    renameProfile: vi.fn(async () => readyView()),
    deleteProfile: vi.fn(async () => readyView()),
    clearProfile: vi.fn(async () => readyView()),
    subscribe: vi.fn(() => () => {}),
    ...overrides,
  }
}

function renderSurface({ mode, view = emptyView, bridge: chatBridge }: {
  mode: ChatMode
  view?: ChatSnapshot
  bridge?: ChatBridge
}) {
  return render(
    <ChatSurface
      useMode={selector => selector(mode)}
      useView={selector => selector(view)}
      setMode={vi.fn()}
      commit={vi.fn()}
      formatTime={() => '10:00'}
      {...(chatBridge === undefined ? {} : { bridge: chatBridge })}
      t={t}
    />,
  )
}

describe('ChatSurface', () => {
  it('renders nothing in Agent mode', () => {
    const { container } = renderSurface({ mode: 'agent' })
    expect(container.firstChild).toBeNull()
  })

  it('explains the Web limitation and opens the official site externally', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderSurface({ mode: 'chat' })
    expect(screen.getByText('聊天模式需要桌面应用')).toBeTruthy()
    screen.getByRole('button', { name: '在浏览器中打开 DeepSeek' }).click()
    expect(open).toHaveBeenCalledWith('https://chat.deepseek.com', '_blank', 'noopener,noreferrer')
  })

  it('mounts the native view over the measured viewport for the active profile', async () => {
    const chatBridge = bridge()
    renderSurface({ mode: 'chat', view: readyView(), bridge: chatBridge })
    await waitFor(() => { expect(chatBridge.open).toHaveBeenCalledOnce() })
    const [profile, bounds] = vi.mocked(chatBridge.open).mock.calls[0]!
    expect(profile).toBe('p1')
    expect(bounds).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '在浏览器中打开' })).toBeTruthy()
  })

  it('shows a loading status while the document has not settled', () => {
    const chatBridge = bridge()
    renderSurface({ mode: 'chat', view: { ...emptyView, status: 'loading' }, bridge: chatBridge })
    expect(screen.getByText('正在加载 DeepSeek 聊天…')).toBeTruthy()
  })

  it('reports a network failure and retries on request', async () => {
    const chatBridge = bridge()
    renderSurface({ mode: 'chat', view: { ...readyView(), status: 'error', failure: 'network' }, bridge: chatBridge })
    expect(screen.getByRole('alert').textContent).toContain('无法加载 DeepSeek 聊天')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(vi.mocked(chatBridge.open).mock.calls.length).toBe(2) })
  })

  it('creates a local account from the account panel', async () => {
    const chatBridge = bridge()
    renderSurface({ mode: 'chat', view: readyView(), bridge: chatBridge })
    fireEvent.click(screen.getByRole('button', { name: /Work/u }))
    fireEvent.click(screen.getByRole('button', { name: '新建账户' }))
    await waitFor(() => { expect(vi.mocked(chatBridge.createProfile)).toHaveBeenCalledWith('DeepSeek') })
  })

  it('confirms before deleting a profile', async () => {
    const chatBridge = bridge()
    renderSurface({ mode: 'chat', view: readyView(), bridge: chatBridge })
    fireEvent.click(screen.getByRole('button', { name: /Work/u }))
    fireEvent.click(screen.getByRole('button', { name: '删除账户' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('删除“Work”')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => { expect(vi.mocked(chatBridge.deleteProfile)).toHaveBeenCalledWith('p1') })
  })
})

describe('readChatBridge', () => {
  it('returns undefined in a plain browser build', () => {
    expect(readChatBridge()).toBeUndefined()
  })
})
