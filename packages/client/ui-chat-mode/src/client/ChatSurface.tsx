/**
 * Full-window Chat mode surface.
 *
 * With the Desktop bridge, the overlay owns the toolbar and the viewport
 * rectangle; the main process mounts the official site as a native child view
 * over that rectangle, so the Harness page never receives or styles remote
 * content. Without the bridge (plain Web build), it explains the limitation
 * and offers the external browser.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconEditOutlineRegular,
  IconLinkOutlineRegular, IconRefreshOutlineRegular, IconTrashOutlineRegular, IconUserOutlineRegular, Input, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatBridge, ChatFailure, ChatSnapshot } from './chat-bridge.ts'
import type { ChatMode } from './mode.ts'
import { ModeSelector } from './ModeSwitch.tsx'
import css from './ChatSurface.module.css'

/** The official chat site opened by the Web fallback. */
const CHAT_URL = 'https://chat.deepseek.com'

/** Injected face of the Chat mode overlay. */
export interface ChatSurfaceInjected {
  /** Desktop commands; absent in the plain Web build. */
  readonly bridge?: ChatBridge
  readonly hooks: {
    readonly mode: HostObservable<ChatMode>
    readonly view: HostObservable<ChatSnapshot>
  }
  /** @param next - mode chosen by the user. */
  setMode(next: ChatMode): void
  /** @param next - snapshot returned by a bridge command; republishes the shared view source. */
  commit(next: ChatSnapshot): void
  /** @param at - epoch milliseconds. @returns a localized clock time. */
  formatTime(at: number): string
}

/** Full composed props of the Chat overlay. */
export type ChatSurfaceProps = InjectFace<ChatSurfaceInjected> & PropsLocale<'chatMode'>

type Translate = ChatSurfaceProps['t']

/** Renderer-bound selector hook over the shared view source. */
type UseView = <T>(selector: (value: ChatSnapshot) => T) => T

/**
 * One compact toolbar button with a required accessible name.
 * @param props - localized label and the click handler.
 * @returns the icon button.
 */
function ToolbarButton({ label, disabled = false, onClick, children }: {
  readonly label: string
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}) {
  return (
    <Tooltip portal label={label} side="bottom" delayMs={500}>
      <button type="button" className={css.iconButton} aria-label={label} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    </Tooltip>
  )
}

/** Localized copy for one failed embedded document. */
function failureText(failure: ChatFailure | undefined, t: Translate): string {
  switch (failure) {
    case 'network': return t('chat.error.network')
    case 'crashed': return t('chat.error.crashed')
    default: return t('chat.error.unavailable')
  }
}

/** The Web build cannot own another origin's cookies; it offers the external site. */
function WebOnly({ setMode, t }: { readonly setMode: (next: ChatMode) => void; readonly t: Translate }) {
  return (
    <div className={css.overlay} role="region" aria-label={t('chat.web.title')}>
      <header className={css.header} data-window-drag>
        <div className={css.mode}>
          <ModeSelector
            mode="chat"
            setMode={setMode}
            ariaLabel={t('mode.label')}
            agentLabel={t('mode.agent')}
            chatLabel={t('mode.chat')}
          />
        </div>
      </header>
      <div className={css.webCard}>
        <h2 className={css.webTitle}>{t('chat.web.title')}</h2>
        <p className={css.webBody}>{t('chat.web.body')}</p>
        <div className={css.webActions}>
          <Button
            variant="primary"
            onClick={() => { window.open(CHAT_URL, '_blank', 'noopener,noreferrer') }}
          >{t('chat.web.action')}</Button>
          <Button variant="ghost" onClick={() => { setMode('agent') }}>{t('mode.agent')}</Button>
        </div>
      </div>
    </div>
  )
}

/** Account actions over the local profile registry. */
function ChatAccounts({ bridge, view, setMode, commit, t }: {
  readonly bridge: ChatBridge
  readonly view: ChatSnapshot
  readonly setMode: (next: ChatMode) => void
  readonly commit: (next: ChatSnapshot) => void
  readonly t: Translate
}) {
  const active = view.profiles.find(profile => profile.id === view.activeProfileId)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(active?.label ?? '')
  const [confirm, setConfirm] = useState<'clear' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const run = (action: () => Promise<ChatSnapshot>): void => {
    if (busy) return
    setBusy(true)
    void action().then(commit).catch(() => undefined).finally(() => { setBusy(false) })
  }
  return (
    <div className={css.accounts} role="dialog" aria-label={t('chat.profiles')}>
      <span className={css.accountsTitle}>{t('chat.profiles')}</span>
      <div className={css.profileList} role="menu" aria-label={t('chat.profiles')}>
        {view.profiles.map(profile => (
          <button
            key={profile.id}
            type="button"
            role="menuitemradio"
            aria-checked={profile.id === view.activeProfileId}
            className={css.profileRow}
            disabled={busy}
            onClick={() => { run(() => bridge.selectProfile(profile.id)) }}
          >
            <IconUserOutlineRegular size={14} />
            <span className={css.profileName}>{profile.label}</span>
          </button>
        ))}
      </div>
      {renaming && active !== undefined ? (
        <div className={css.renameRow}>
          <Input
            value={draft}
            aria-label={t('chat.profile.name')}
            autoFocus
            onChange={(event) => { setDraft(event.target.value) }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy || draft.trim().length === 0}
            onClick={() => { run(() => bridge.renameProfile(active.id, draft)); setRenaming(false) }}
          >{t('chat.profile.save')}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setRenaming(false) }}>{t('chat.profile.cancel')}</Button>
        </div>
      ) : (
        <div className={css.accountActions}>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => { run(() => bridge.createProfile(t('chat.profile.defaultLabel'))) }}
          >{t('chat.profile.new')}</Button>
          {active !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => { setDraft(active.label); setRenaming(true) }}
            ><IconEditOutlineRegular size={14} />{t('chat.profile.rename')}</Button>
          )}
        </div>
      )}
      {active !== undefined && confirm === null && (
        <div className={css.destructiveActions}>
          <button type="button" className={css.textAction} disabled={busy} onClick={() => { setConfirm('clear') }}>
            {t('chat.profile.clear')}
          </button>
          <button type="button" className={css.textAction} disabled={busy} onClick={() => { setConfirm('delete') }}>
            <IconTrashOutlineRegular size={13} />{t('chat.profile.delete')}
          </button>
        </div>
      )}
      {active !== undefined && confirm !== null && (
        <div className={css.confirm} role="alertdialog" aria-label={confirm === 'delete' ? t('chat.profile.confirm') : t('chat.profile.clear')}>
          <p className={css.confirmText}>
            {confirm === 'delete'
              ? t('chat.profile.deleteConfirm', { name: active.label })
              : t('chat.profile.clearConfirm', { name: active.label })}
          </p>
          <div className={css.confirmActions}>
            <Button variant="ghost" size="sm" onClick={() => { setConfirm(null) }}>{t('chat.profile.cancel')}</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => {
                run(() => confirm === 'delete' ? bridge.deleteProfile(active.id) : bridge.clearProfile(active.id))
                setConfirm(null)
              }}
            >{confirm === 'delete' ? t('chat.profile.confirm') : t('chat.profile.clear')}</Button>
          </div>
        </div>
      )}
      <button type="button" className={css.agentAction} onClick={() => { setMode('agent') }}>
        {t('mode.agent')}
      </button>
    </div>
  )
}

/** Desktop surface: toolbar plus the rectangle the native view occupies. */
function Embedded({ bridge, setMode, useView, commit, t }: {
  readonly bridge: ChatBridge
  readonly setMode: (next: ChatMode) => void
  readonly useView: UseView
  readonly commit: (next: ChatSnapshot) => void
  readonly t: Translate
}) {
  const view = useView(value => value)
  const viewport = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [openFailure, setOpenFailure] = useState(false)
  const [accounts, setAccounts] = useState(false)
  const active = view.profiles.find(profile => profile.id === view.activeProfileId)

  useEffect(() => {
    const element = viewport.current
    // The viewport ref is attached before this effect runs.
    /* v8 ignore next */
    if (element === null) return
    let closed = false
    setOpenFailure(false)
    const bounds = () => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    void bridge.open(view.activeProfileId, bounds()).then(commit, () => { if (!closed) setOpenFailure(true) })
    const observer = new ResizeObserver(() => { void bridge.setBounds(bounds()).catch(() => undefined) })
    observer.observe(element)
    return () => {
      closed = true
      observer.disconnect()
      void bridge.close().catch(() => undefined)
    }
  }, [bridge, view.activeProfileId, attempt, commit])

  const retry = (): void => { setAttempt(value => value + 1) }
  const failed = openFailure || view.status === 'error'
  return (
    <div className={css.overlay} role="region" aria-label={t('mode.chat')}>
      <header className={css.header} data-window-drag>
        <div className={css.mode}>
          <ModeSelector
            mode="chat"
            setMode={setMode}
            ariaLabel={t('mode.label')}
            agentLabel={t('mode.agent')}
            chatLabel={t('mode.chat')}
          />
        </div>
        <div className={css.navigation}>
          <ToolbarButton label={t('chat.back')} disabled={!view.canGoBack} onClick={() => { void bridge.back() }}>
            <IconChevronLeftOutlineRegular size={16} />
          </ToolbarButton>
          <ToolbarButton label={t('chat.forward')} disabled={!view.canGoForward} onClick={() => { void bridge.forward() }}>
            <IconChevronRightOutlineRegular size={16} />
          </ToolbarButton>
          <ToolbarButton label={t('chat.reload')} onClick={() => { void bridge.reload() }}>
            <IconRefreshOutlineRegular size={15} />
          </ToolbarButton>
        </div>
        <div className={css.trailing}>
          <button
            type="button"
            className={css.accountButton}
            aria-expanded={accounts}
            onClick={() => { setAccounts(value => !value) }}
          >
            <IconUserOutlineRegular size={14} />
            <span className={css.accountLabel}>{active?.label ?? t('chat.account')}</span>
          </button>
          <ToolbarButton label={t('chat.openExternal')} onClick={() => { void bridge.openExternal() }}>
            <IconLinkOutlineRegular size={15} />
          </ToolbarButton>
          {accounts && <ChatAccounts bridge={bridge} view={view} setMode={setMode} commit={commit} t={t} />}
        </div>
      </header>
      <div ref={viewport} className={css.viewport}>
        {failed ? (
          <div className={css.state} role="alert">
            <span>{failureText(openFailure ? 'unavailable' : view.failure, t)}</span>
            <Button variant="outline" size="sm" onClick={retry}>{t('chat.retry')}</Button>
          </div>
        ) : view.status === 'ready' ? null : (
          <div className={css.state} role="status">
            <span className={css.spinner} aria-hidden="true" />
            <span>{t('chat.loading')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Chat mode overlay: nothing in Agent mode, the embedded surface in Desktop,
 * and the external-site explanation in a plain browser.
 * @param props - composed slot props (bridge, mode/view hooks, locale seat).
 * @returns the overlay or null.
 */
export function ChatSurface(props: ChatSurfaceProps) {
  const mode = props.useMode(value => value)
  if (mode === 'agent') return null
  if (props.bridge === undefined) return <WebOnly setMode={props.setMode} t={props.t} />
  return <Embedded bridge={props.bridge} setMode={props.setMode} useView={props.useView} commit={props.commit} t={props.t} />
}
