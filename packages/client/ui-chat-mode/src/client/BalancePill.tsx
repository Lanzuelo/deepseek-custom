/**
 * Compact DeepSeek API balance reading for the agent composer's status row.
 *
 * The Host reads the documented endpoint with the configured key and returns
 * only the normalized view; this pill never sees a credential. Unknown states
 * never render as a zero balance.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, IconRefreshOutlineRegular, IconWarningOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ApiBalanceView } from '@deepseek-ai/dsh-deepseek-balance/types'
import { formatAmount } from './money.ts'
import css from './BalancePill.module.css'

/** Injected face of the balance pill. */
export interface BalancePillInjected {
  /** @param force - bypass the Host cache and read the endpoint again. @returns the normalized view. */
  readBalance(force: boolean): Promise<ApiBalanceView>
  /** @param at - epoch milliseconds. @returns a localized clock time. */
  formatTime(at: number): string
}

/** Full composed props of the composer status-row entry. */
export type BalancePillProps = InjectFace<BalancePillInjected> & PropsLocale<'chatMode'>

type Reading =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'loaded'; readonly view: ApiBalanceView }

/** One-line reading for a settled view, or null when the pill renders nothing. */
function shortReading(view: ApiBalanceView, t: BalancePillProps['t']): { readonly text: string; readonly warning: boolean } | null {
  switch (view.status) {
    case 'ready': {
      const first = view.balances[0]
      if (first === undefined || !view.isAvailable) {
        return { text: t('balance.unavailable'), warning: true }
      }
      const extra = view.balances.length > 1 ? ` +${String(view.balances.length - 1)}` : ''
      return { text: `${formatAmount(first.totalBalance, first.currency)}${extra}`, warning: false }
    }
    case 'missing-key':
    case 'unsupported':
      return null
    case 'error':
      return { text: t('balance.unavailable'), warning: true }
  }
}

/**
 * Status-row balance pill with a details popover.
 * @param props - composer runtime share, balance reader, time formatter, locale seat.
 * @returns the pill, or null while unknown.
 */
export function BalancePill({ readBalance, formatTime, t }: BalancePillProps) {
  const [reading, setReading] = useState<Reading>({ status: 'loading' })
  const [open, setOpen] = useState(false)

  const load = useCallback((force: boolean): void => {
    setReading({ status: 'loading' })
    void readBalance(force).then(
      (view) => { setReading({ status: 'loaded', view }) },
      () => { setReading({ status: 'failed' }) },
    )
  }, [readBalance])

  useEffect(() => {
    load(false)
    const timer = window.setInterval(() => { if (!document.hidden) load(false) }, 60_000)
    const onVisibility = (): void => { if (!document.hidden) load(false) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  if (reading.status === 'loading') return null
  if (reading.status === 'failed') {
    return (
      <span className={css.anchor} data-composer-stat="deepseek-balance">
        <Tooltip portal label={t('balance.unavailable')} side="top" delayMs={500}>
          <button type="button" className={css.pill} aria-label={t('balance.unavailable')} onClick={() => { load(true) }}>
            <IconWarningOutlineRegular size={13} />
            <span className={css.label}>{t('balance.unavailable')}</span>
          </button>
        </Tooltip>
      </span>
    )
  }
  const short = shortReading(reading.view, t)
  if (short === null) return null
  return (
    <span className={css.anchor} data-composer-stat="deepseek-balance">
      <button
        type="button"
        className={css.pill}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('balance.label')}
        onClick={() => { setOpen(value => !value) }}
      >
        {short.warning && <IconWarningOutlineRegular size={13} />}
        <span className={css.label}>{short.text}</span>
      </button>
      {open && <Details view={reading.view} formatTime={formatTime} t={t} onRefresh={() => { load(true) }} />}
    </span>
  )
}

/** Popover contents: every currency, its buckets, and the refresh time. */
function Details({ view, formatTime, t, onRefresh }: {
  readonly view: ApiBalanceView
  readonly formatTime: (at: number) => string
  readonly t: BalancePillProps['t']
  readonly onRefresh: () => void
}) {
  return (
    <div className={css.panel} role="dialog" aria-label={t('balance.label')}>
      <div className={css.panelHeader}>
        <span className={css.panelTitle}>{t('balance.label')}</span>
        <Button variant="ghost" size="sm" onClick={onRefresh} aria-label={t('balance.refresh')}>
          <IconRefreshOutlineRegular size={14} />
          {t('balance.refresh')}
        </Button>
      </div>
      {view.status === 'ready' ? (
        <>
          {!view.isAvailable && (
            <p className={css.warning}>{t('balance.unavailable')}</p>
          )}
          {view.balances.map(balance => (
            <dl key={balance.currency} className={css.details}>
              <dt>{balance.currency}</dt>
              <dd className={css.total}>{formatAmount(balance.totalBalance, balance.currency)}</dd>
              <dt>{t('balance.granted')}</dt>
              <dd>{formatAmount(balance.grantedBalance, balance.currency)}</dd>
              <dt>{t('balance.toppedUp')}</dt>
              <dd>{formatAmount(balance.toppedUpBalance, balance.currency)}</dd>
            </dl>
          ))}
          <p className={css.updated}>
            {t('balance.updated', { time: formatTime(view.fetchedAt) })}
          </p>
        </>
      ) : (
        <p className={css.updated}>{errorText(view, t)}</p>
      )}
    </div>
  )
}

/** Localized reason for a failed or unsupported reading. */
function errorText(view: ApiBalanceView, t: BalancePillProps['t']): string {
  switch (view.status) {
    case 'missing-key': return t('balance.missingKey')
    case 'unsupported': return t('balance.unsupported')
    case 'error':
      switch (view.reason) {
        case 'auth': return t('balance.error.auth')
        case 'timeout': return t('balance.error.timeout')
        case 'malformed': return t('balance.error.malformed')
        case 'storage': return t('balance.error.storage')
        default: return t('balance.error.network')
      }
    default: return t('balance.unavailable')
  }
}
