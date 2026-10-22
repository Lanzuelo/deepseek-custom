/** Decimal-string money formatting without binary floating point conversion. */

/** Symbol shown before an amount; an unknown currency keeps its code. */
const SYMBOLS: Readonly<Record<string, string>> = { CNY: '¥', USD: '$' }

/**
 * Format one provider decimal string for display.
 *
 * The value is truncated toward zero at two fraction digits, matching the
 * account screen's `big.js` rounding; the original string is never converted
 * to a binary float.
 * @param amount - decimal string exactly as the provider reported it.
 * @param currency - provider currency code.
 * @returns the symbol-prefixed amount with grouped thousands.
 */
export function formatAmount(amount: string, currency: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(amount.trim())
  if (match === null) return `${currency} ${amount}`
  const [, sign = '', integer = '0', fraction = ''] = match
  const whole = integer.replace(/^0+(?=\d)/u, '')
  const cents = fraction.padEnd(2, '0').slice(0, 2)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  const head = SYMBOLS[currency]
  const negative = sign === '-' && /[1-9]/u.test(integer + cents)
  const value = `${grouped}.${cents}`
  return head === undefined ? `${negative ? '-' : ''}${value} ${currency}` : `${negative ? '-' : ''}${head}${value}`
}
