const CURRENCY_SYMBOL: Record<string, string> = {
  PKR: 'Rs',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED',
  INR: '₹',
};

/**
 * Formats a numeric price using the store's currency code. Falls back to the
 * currency code itself when no symbol is known.
 */
export function formatPrice(
  amount: number | string | null | undefined,
  currency = 'PKR',
): string {
  const value = Number(amount ?? 0);
  const symbol = CURRENCY_SYMBOL[currency] ?? currency;
  // Fixed locale so server-rendered markup and the client hydration match,
  // regardless of the visitor's locale.
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatted}`;
}
