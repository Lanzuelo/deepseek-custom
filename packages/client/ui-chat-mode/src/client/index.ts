/**
 * Agent/Chat mode plugin: the sidebar mode row, the full-window Chat surface,
 * and the API balance reading in the agent composer's status row.
 *
 * The Chat surface is Desktop-only: a native child view owned by the main
 * process shows the official site, while this browser half renders the
 * toolbar and the honest loading/error states. A plain Web client gets the
 * external-browser explanation instead of a broken embed.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ApiBalanceView } from '@deepseek-ai/dsh-deepseek-balance/types'
import { readChatBridge, type ChatSnapshot } from './chat-bridge.ts'
import { createChatModeStore } from './mode.ts'
import { BalancePill, type BalancePillInjected } from './BalancePill.tsx'
import { ChatSurface, type ChatSurfaceInjected } from './ChatSurface.tsx'
import { ModeSwitch, type ModeSwitchInjected } from './ModeSwitch.tsx'
import { en, zh } from './locales.ts'
export type { ChatModeKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'chatMode'

/** State before any Desktop bridge answer arrives. */
const EMPTY_VIEW: ChatSnapshot = {
  status: 'idle',
  canGoBack: false,
  canGoForward: false,
  activeProfileId: null,
  profiles: [],
  origin: 'https://chat.deepseek.com',
}

/** Services required by the mode surfaces. */
export const inject = ['slots', 'locale', 'remote', 'remote.deepSeekBalance']

/**
 * Client plugin body: mode preference, sidebar row, Chat overlay, and the
 * composer balance entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-chat-mode: dictionaries')
  const mode = createChatModeStore()
  const view = createSnapshotStore<ChatSnapshot>(EMPTY_VIEW)
  const bridge = readChatBridge()
  if (bridge !== undefined) {
    const unsubscribe = bridge.subscribe((next) => { view.set(next) })
    ctx.effect(() => () => { unsubscribe() }, 'ui-chat-mode: bridge state')
    void bridge.snapshot().then((next) => { view.set(next) }, () => undefined)
  }
  const locale = () => ctx.locale.getSnapshot().active
  const formatTime = (at: number): string => new Intl.DateTimeFormat(locale(), {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(at))
  const readBalance = async (force: boolean): Promise<ApiBalanceView> => {
    const result = force ? await ctx.remote.deepSeekBalance.refresh() : await ctx.remote.deepSeekBalance.read()
    if (!result.ok) throw result.error
    return result.value
  }

  ctx.slots.inject('sidebar.mode', () => ctx.slots.register({
    name: 'sidebar.mode', id: 'agent-chat', locale: NS,
    inject: (): ModeSwitchInjected => ({ hooks: { mode: mode.mode }, setMode: mode.set }),
  }, ModeSwitch))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'chat-mode', order: 100, locale: NS,
    inject: (): ChatSurfaceInjected => ({
      hooks: { mode: mode.mode, view },
      setMode: mode.set,
      commit: (next) => { view.set(next) },
      formatTime,
      ...bridge === undefined ? {} : { bridge },
    }),
  }, ChatSurface))

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'deepseek-balance', order: 2, locale: NS,
    inject: (): BalancePillInjected => ({ readBalance, formatTime }),
  }, BalancePill))
}
