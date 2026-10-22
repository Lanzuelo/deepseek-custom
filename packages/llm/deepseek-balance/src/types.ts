/**
 * DeepSeek API wallet projection returned to the Client.
 *
 * Money values are decimal strings exactly as the provider reports them; the
 * Client formats them without converting through binary floating point.
 */

/** One provider-reported currency balance. */
export interface ApiBalanceEntry {
  readonly currency: string
  readonly totalBalance: string
  readonly grantedBalance: string
  readonly toppedUpBalance: string
}

/** Why a balance reading is unavailable. */
export type ApiBalanceFailure = 'auth' | 'network' | 'timeout' | 'malformed' | 'storage'

/** Settled outcome of one balance read. */
export type ApiBalanceView =
  | {
    readonly status: 'ready'
    readonly fetchedAt: number
    readonly isAvailable: boolean
    readonly balances: readonly ApiBalanceEntry[]
  }
  | { readonly status: 'missing-key' }
  | { readonly status: 'unsupported' }
  | { readonly status: 'error'; readonly reason: ApiBalanceFailure }
