/**
 * Host-only DeepSeek API wallet reading over Typert Remote.
 *
 * The Client receives only the normalized outcome: a status tag, an optional
 * fetch time, and string-money balances. The API key and the request headers
 * never leave this process.
 */
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { OFFICIAL_ORIGIN, endpointOrigin, fetchApiBalance } from './balance.ts'
import type { ApiBalanceView } from './types.ts'

export type { ApiBalanceEntry, ApiBalanceFailure, ApiBalanceView } from './types.ts'
export { OFFICIAL_ORIGIN, endpointOrigin, fetchApiBalance, parseBalance } from './balance.ts'

/** Deployment choices for the balance reader. */
export interface Config {
  /** Endpoint origin; an origin other than the documented one reports `unsupported`. */
  baseUrl?: string
  /** Credential reference resolved per read; a provider base URL setting overrides it. */
  apiKeyEnv?: string
  /** Deadline for one balance request. */
  requestTimeoutMs?: number
  /** How long a ready reading is reused before it is refreshed. */
  cacheTtlMs?: number
}

/** Validated deployment choices. */
export const Config = Schema.object({
  baseUrl: Schema.string().default(OFFICIAL_ORIGIN),
  apiKeyEnv: Schema.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
  requestTimeoutMs: Schema.number().min(1).max(120_000).default(10_000),
  cacheTtlMs: Schema.number().min(0).max(600_000).default(60_000),
})

/** Resolved configuration with schema defaults applied. */
type ResolvedConfig = Required<Config>

/** A settled, reusable reading. */
type ReadyReading = Extract<ApiBalanceView, { status: 'ready' }>

/** Provider route whose configuration names the endpoint and credential reference. */
const PROVIDER = 'deepseek-official'

/** DeepSeek API balance reader and its Remote projection. */
export class DeepSeekBalance extends TypertRemoteService {
  static Config = Config
  private readonly config: ResolvedConfig
  private readonly fetchImpl: typeof fetch | undefined
  private readonly clock: () => number
  private cached: ReadyReading | undefined
  private pending: Promise<ApiBalanceView> | undefined

  /**
   * @param ctx - Host context; credentials, settings and llm are optional.
   * @param config - endpoint, credential reference, deadline and cache lifetime.
   * @param options - test-only fetch and clock injection.
   */
  constructor(ctx: Context, config: Config = {}, options: {
    readonly fetch?: typeof fetch
    readonly now?: () => number
  } = {}) {
    super(ctx, 'deepSeekBalance', { namespace: 'deepSeekBalance' })
    this.config = Config(config) as ResolvedConfig
    this.fetchImpl = options.fetch
    this.clock = options.now ?? Date.now
  }

  /**
   * Read the account balance, reusing a recent ready reading.
   * @returns the normalized wallet view; failures are reported by status.
   */
  @Remote
  async read(): Promise<ApiBalanceView> {
    const cached = this.cached
    if (cached !== undefined && this.clock() - cached.fetchedAt < this.config.cacheTtlMs) return cached
    return this.load()
  }

  /**
   * Read the account balance without reusing the cache.
   * @returns the normalized wallet view; failures are reported by status.
   */
  @Remote
  async refresh(): Promise<ApiBalanceView> {
    return this.load()
  }

  private load(): Promise<ApiBalanceView> {
    if (this.pending !== undefined) return this.pending
    const pending = this.measure().then((view) => {
      if (view.status === 'ready') this.cached = view
      return view
    }).finally(() => { if (this.pending === pending) this.pending = undefined })
    this.pending = pending
    return pending
  }

  private async measure(): Promise<ApiBalanceView> {
    const connection = this.connection()
    if (connection.origin !== OFFICIAL_ORIGIN) return { status: 'unsupported' }
    let key: string | undefined
    try { key = await this.apiKey(connection.apiKeyEnv) }
    catch { return { status: 'error', reason: 'storage' } }
    if (key === undefined) return { status: 'missing-key' }
    return fetchApiBalance({
      origin: OFFICIAL_ORIGIN,
      apiKey: key,
      timeoutMs: this.config.requestTimeoutMs,
      now: this.clock,
      ...this.fetchImpl === undefined ? {} : { fetchImpl: this.fetchImpl },
    })
  }

  /** Resolve the endpoint and credential reference from the provider's configured settings. */
  private connection(): { origin: string; apiKeyEnv: string } {
    let origin = endpointOrigin(this.config.baseUrl) ?? OFFICIAL_ORIGIN
    let apiKeyEnv = this.config.apiKeyEnv
    try {
      const provider = this.ctx.get('llm')?.listConfigurableProviders()
        .find(entry => entry.provider === PROVIDER)
      const value = provider === undefined ? undefined
        : this.ctx.get('settings')?.describe().find(entry => entry.ns === provider.settingsNs)?.value
      if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>
        if (typeof record.baseURL === 'string') origin = endpointOrigin(record.baseURL) ?? origin
        if (typeof record.apiKeyEnv === 'string' && record.apiKeyEnv.length > 0) apiKeyEnv = record.apiKeyEnv
      }
    } catch {
      // An unreadable settings mirror keeps the deployment configuration.
    }
    return { origin, apiKeyEnv }
  }

  private async apiKey(ref: string): Promise<string | undefined> {
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(credentialRef(ref))
      if (hit !== undefined && hit.value.length > 0) return hit.value
    }
    const ambient = process.env[ref]
    return ambient !== undefined && ambient.length > 0 ? ambient : undefined
  }
}

export default DeepSeekBalance
