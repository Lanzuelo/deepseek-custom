import { describe, expect, it } from 'vitest'
import { formatAmount } from '../src/client/money.ts'

describe('formatAmount', () => {
  it('keeps the provider decimals without binary float conversion', () => {
    expect(formatAmount('12.34', 'CNY')).toBe('¥12.34')
    expect(formatAmount('5.0000000000000000', 'USD')).toBe('$5.00')
    expect(formatAmount('0.001', 'USD')).toBe('$0.00')
  })

  it('truncates at two fraction digits and groups thousands', () => {
    expect(formatAmount('1234.567', 'CNY')).toBe('¥1,234.56')
    expect(formatAmount('1234567', 'CNY')).toBe('¥1,234,567.00')
  })

  it('drops a negative sign that names zero', () => {
    expect(formatAmount('-0.004', 'CNY')).toBe('¥0.00')
    expect(formatAmount('-2.5', 'CNY')).toBe('-¥2.50')
  })

  it('keeps an unknown currency code', () => {
    expect(formatAmount('3.2', 'EUR')).toBe('3.20 EUR')
    expect(formatAmount('not-a-number', 'EUR')).toBe('EUR not-a-number')
  })
})
