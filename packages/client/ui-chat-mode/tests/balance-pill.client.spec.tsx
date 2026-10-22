// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ApiBalanceView } from '@deepseek-ai/dsh-deepseek-balance/types'
import { BalancePill, type BalancePillProps } from '../src/client/BalancePill.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t: BalancePillProps['t'] = makeTranslate(zh)
const ready: ApiBalanceView = {
  status: 'ready',
  fetchedAt: 1_700_000_000_000,
  isAvailable: true,
  balances: [{
    currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.00', toppedUpBalance: '10.34',
  }],
}

function renderPill(view: ApiBalanceView | Error) {
  const readBalance = vi.fn(() => view instanceof Error ? Promise.reject(view) : Promise.resolve(view))
  render(<BalancePill readBalance={readBalance} formatTime={() => '10:00'} t={t} />)
  return readBalance
}

describe('BalancePill', () => {
  it('shows the provider total and the bucket details on demand', async () => {
    const readBalance = renderPill(ready)
    expect(await screen.findByText('¥12.34')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'API 余额' }))
    expect(screen.getByRole('dialog', { name: 'API 余额' })).toBeTruthy()
    expect(screen.getByText('赠送')).toBeTruthy()
    expect(screen.getByText('¥2.00')).toBeTruthy()
    expect(screen.getByText('¥10.34')).toBeTruthy()
    expect(screen.getByText('更新于 10:00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => { expect(readBalance).toHaveBeenCalledWith(true) })
  })

  it('summarizes additional currencies without dropping them', async () => {
    renderPill({ ...ready, balances: [ready.balances[0]!, { currency: 'USD', totalBalance: '3.20', grantedBalance: '0', toppedUpBalance: '3.20' }] })
    expect(await screen.findByText('¥12.34 +1')).toBeTruthy()
  })

  it('marks an unavailable account without showing a zero', async () => {
    renderPill({ ...ready, isAvailable: false })
    expect(await screen.findByText('余额不可用')).toBeTruthy()
    expect(screen.queryByText('¥12.34')).toBeNull()
  })

  it('renders nothing when no key or no official endpoint is configured', async () => {
    const missing = renderPill({ status: 'missing-key' })
    await waitFor(() => { expect(missing).toHaveBeenCalledOnce() })
    expect(screen.queryByRole('button')).toBeNull()
    cleanup()
    renderPill({ status: 'unsupported' })
    await waitFor(() => { expect(screen.queryByRole('button')).toBeNull() })
  })

  it('names the failure instead of inventing a balance', async () => {
    renderPill({ status: 'error', reason: 'auth' })
    expect(await screen.findByText('余额不可用')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'API 余额' }))
    expect(screen.getByText('API 密钥被拒绝')).toBeTruthy()
  })

  it('reports a rejected read as unknown', async () => {
    renderPill(new Error('offline'))
    expect(await screen.findByText('余额不可用')).toBeTruthy()
  })
})
