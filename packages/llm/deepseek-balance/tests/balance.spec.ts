import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { DeepSeekBalance, endpointOrigin, parseBalance } from '../src/index.ts'

const payload = {
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '12.34', granted_balance: '2.00', topped_up_balance: '10.34' },
    { currency: 'USD', total_balance: '3.20', granted_balance: '0.00', topped_up_balance: '3.20' },
  ],
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function bench(options: {
  fetch?: typeof fetch
  config?: ConstructorParameters<typeof DeepSeekBalance>[1]
  now?: () => number
  services?: Record<string, unknown>
} = {}) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  for (const [name, value] of Object.entries(options.services ?? {})) {
    ctx.provide(name, value as never)
  }
  const service = new DeepSeekBalance(ctx, options.config ?? {}, {
    ...options.fetch === undefined ? {} : { fetch: options.fetch },
    ...options.now === undefined ? {} : { now: options.now },
  })
  return { ctx, service }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('parseBalance', () => {
  it('keeps provider decimal strings and currencies', () => {
    expect(parseBalance(payload)).toEqual({
      isAvailable: true,
      balances: [
        { currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.00', toppedUpBalance: '10.34' },
        { currency: 'USD', totalBalance: '3.20', grantedBalance: '0.00', toppedUpBalance: '3.20' },
      ],
    })
  })

  it('rejects a malformed payload instead of reporting zero', () => {
    expect(parseBalance(null)).toBeUndefined()
    expect(parseBalance({ is_available: 'yes', balance_infos: [] })).toBeUndefined()
    expect(parseBalance({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: 'abc' }] })).toBeUndefined()
    expect(parseBalance({ is_available: true, balance_infos: [{}] })).toBeUndefined()
  })

  it('normalizes a configured endpoint to its origin', () => {
    expect(endpointOrigin('https://api.deepseek.com/anthropic')).toBe('https://api.deepseek.com')
    expect(endpointOrigin('not a url')).toBeUndefined()
    expect(endpointOrigin('file:///tmp')).toBeUndefined()
  })
})

describe('DeepSeekBalance', () => {
  it('reads the documented endpoint with the configured key and reuses a ready reading', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test-secret')
    const fetchMock = vi.fn(async () => jsonResponse(payload)) as unknown as typeof fetch
    const { service } = bench({ fetch: fetchMock, now: () => 1_000 })
    const view = await service.read()
    expect(view).toMatchObject({ status: 'ready', isAvailable: true, fetchedAt: 1_000 })
    expect(String(view)).not.toContain('sk-test-secret')
    const request = vi.mocked(fetchMock).mock.calls[0]!
    expect(request[0]).toBe('https://api.deepseek.com/user/balance')
    expect((request[1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer sk-test-secret' })
    await service.read()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('refresh bypasses the cache and concurrent reads share one request', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test')
    const fetchMock = vi.fn(async () => jsonResponse(payload))
    const { service } = bench({ fetch: fetchMock as unknown as typeof fetch })
    const [first, joined] = await Promise.all([service.read(), service.read()])
    expect(first).toMatchObject({ status: 'ready' })
    expect(joined).toMatchObject({ status: 'ready' })
    expect(fetchMock).toHaveBeenCalledOnce()
    await service.refresh()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports a missing key without calling the endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(payload))
    const { service } = bench({ fetch: fetchMock as unknown as typeof fetch })
    expect(await service.read()).toEqual({ status: 'missing-key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses an origin that is not the documented official endpoint', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test')
    const fetchMock = vi.fn(async () => jsonResponse(payload))
    const { service } = bench({ fetch: fetchMock as unknown as typeof fetch, config: { baseUrl: 'https://proxy.example' } })
    expect(await service.read()).toEqual({ status: 'unsupported' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps provider failures to a status without leaking the key', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'sk-test')
    const unauthorized = bench({ fetch: (async () => jsonResponse({ error: 'denied' }, 401)) as unknown as typeof fetch })
    expect(await unauthorized.service.read()).toEqual({ status: 'error', reason: 'auth' })

    const server = bench({ fetch: (async () => jsonResponse({ error: 'down' }, 503)) as unknown as typeof fetch })
    expect(await server.service.read()).toEqual({ status: 'error', reason: 'network' })

    const malformed = bench({ fetch: (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch })
    expect(await malformed.service.read()).toEqual({ status: 'error', reason: 'malformed' })

    const timeout = bench({ fetch: (async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) }) as unknown as typeof fetch })
    expect(await timeout.service.read()).toEqual({ status: 'error', reason: 'timeout' })

    const offline = bench({ fetch: (async () => { throw new Error('dns') }) as unknown as typeof fetch })
    expect(await offline.service.read()).toEqual({ status: 'error', reason: 'network' })
  })

  it('resolves the provider route settings for the endpoint and credential reference', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(payload))
    const resolve = vi.fn(async () => ({ value: 'sk-from-credentials' }))
    const { service } = bench({
      fetch: fetchMock as unknown as typeof fetch,
      services: {
        llm: { listConfigurableProviders: () => [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek' }] },
        settings: {
          describe: () => [{
            ns: 'llm-deepseek',
            value: { baseURL: 'https://proxy.example', apiKeyEnv: 'CUSTOM_DEEPSEEK_KEY' },
          }],
        },
        credentials: { resolve },
      },
    })
    expect(await service.read()).toEqual({ status: 'unsupported' })
    expect(resolve).not.toHaveBeenCalled()

    const official = bench({
      fetch: fetchMock as unknown as typeof fetch,
      services: {
        llm: { listConfigurableProviders: () => [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek' }] },
        settings: {
          describe: () => [{ ns: 'llm-deepseek', value: { baseURL: 'https://api.deepseek.com', apiKeyEnv: 'CUSTOM_DEEPSEEK_KEY' } }],
        },
        credentials: { resolve },
      },
    })
    expect(await official.service.read()).toMatchObject({ status: 'ready' })
    expect(resolve).toHaveBeenCalledWith('CUSTOM_DEEPSEEK_KEY')
  })

  it('reports an unreadable credential store as an error state', async () => {
    const { service } = bench({
      fetch: (async () => jsonResponse(payload)) as unknown as typeof fetch,
      services: { credentials: { resolve: async () => { throw new Error('vault locked') } } },
    })
    expect(await service.read()).toEqual({ status: 'error', reason: 'storage' })
  })
})
