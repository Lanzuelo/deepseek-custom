/** Compact Agent/Chat selector shared by the sidebar row and the chat header. */
import { SegmentedControl, type SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatMode } from './mode.ts'
import css from './ModeSwitch.module.css'

/** Injected face of the optional sidebar mode row. */
export interface ModeSwitchInjected {
  readonly hooks: { readonly mode: HostObservable<ChatMode> }
  /** @param next - mode chosen by the user. */
  setMode(next: ChatMode): void
}

/** Full composed props of the sidebar mode row. */
export type ModeSwitchProps = InjectFace<ModeSwitchInjected> & PropsLocale<'chatMode'>

/** Presentational two-segment selector; the owner holds the selection. */
export function ModeSelector({ mode, setMode, ariaLabel, agentLabel, chatLabel, className }: {
  readonly mode: ChatMode
  readonly setMode: (next: ChatMode) => void
  readonly ariaLabel: string
  readonly agentLabel: string
  readonly chatLabel: string
  readonly className?: string | undefined
}) {
  const options: readonly SegmentedControlOption<ChatMode>[] = [
    { value: 'agent', label: agentLabel },
    { value: 'chat', label: chatLabel },
  ]
  return (
    <SegmentedControl
      id="dsh-chat-mode"
      value={mode}
      options={options}
      label={ariaLabel}
      onChange={setMode}
      className={className}
    />
  )
}

/**
 * Sidebar mode row: the remembered Agent/Chat choice.
 * @param props - composed slot props (mode hook, setter, locale seat).
 * @returns the selector filling the sidebar row.
 */
export function ModeSwitch({ useMode, setMode, t }: ModeSwitchProps) {
  const mode = useMode(value => value)
  return (
    <ModeSelector
      mode={mode}
      setMode={setMode}
      ariaLabel={t('mode.label')}
      agentLabel={t('mode.agent')}
      chatLabel={t('mode.chat')}
      className={css.root}
    />
  )
}
