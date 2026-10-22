/** Official DeepSeek API balance request, response validation, and failure mapping. */
import type { ApiBalanceEntry, ApiBalanceView } from './types.ts'

/** The documented balance endpoint origin. */
export const OFFICIAL_ORIGIN = 'https://api.deepseek.com'

/** Decimal string the provider uses for every money field. */
const DECIMAL = /^-?\d+(?:\.\d+)?$/u

/**
 * Normalize a configured endpoint to its origin.
 * @param value - configured base URL.
 * @returns the origin, or undefined when the value is not an HTTP(S) origin.
 */
export function endpointOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : undefined
  } catch { return undefined }
}

/**
 * Validate the documented balance payload.
 * @param value - decoded JSON response.
 * @returns the provider facts, or undefined for a malformed payload.
 */
export function parseBalance(value: unknown): { isAvailable: boolean; balances: ApiBalanceEntry[] } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  if (typeof row.is_available !== 'boolean') return undefined
  if (!Array.isArray(row.balance_infos)) return undefined
  const balances: ApiBalanceEntry[] = []
  for (const entry of row.balance_infos) {
    if (typeof entry !== 'object' || entry === null) return undefined
    const item = entry as Record<string, unknown>
    const currency = item.currency
    const total = item.total_balance
    const granted = item.granted_balance
    const toppedUp = item.topped_up_balance
    if (typeof currency !== 'string' || currency.length === 0 || currency.length > 10) return undefined
    if (typeof total !== 'string' || !DECIMAL.test(total)) return undefined
    if (typeof granted !== 'string' || !DECIMAL.test(granted)) return undefined
    if (typeof toppedUp !== 'string' || !DECIMAL.test(toppedUp)) return undefined
    balances.push({ currency, totalBalance: total, grantedBalance: granted, toppedUpBalance: toppedUp })
  }
  return { isAvailable: row.is_available, balances }
}

/**
 * Read the API account balance from the documented endpoint.
 * @param options - resolved origin, credential, deadline, clock and fetch implementation.
 * @returns a settled view; the credential never appears in the result.
 */
export async function fetchApiBalance(options: {
  readonly origin: string
  readonly apiKey: string
  readonly timeoutMs: number
  readonly now: () => number
  readonly fetchImpl?: typeof fetch
}): Promise<ApiBalanceView> {
  const request = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await request(`${options.origin}/user/balance`, {
      method: 'GET',
      headers: { authorization: `Bearer ${options.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs),
    })
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { status: 'error', reason: timeout ? 'timeout' : 'network' }
  }
  if (response.status === 401 || response.status === 403) return { status: 'error', reason: 'auth' }
  if (!response.ok) return { status: 'error', reason: 'network' }
  let payload: unknown
  try { payload = await response.json() } catch { return { status: 'error', reason: 'malformed' } }
  const parsed = parseBalance(payload)
  if (parsed === undefined) return { status: 'error', reason: 'malformed' }
  return { status: 'ready', fetchedAt: options.now(), isAvailable: parsed.isAvailable, balances: parsed.balances }
}
