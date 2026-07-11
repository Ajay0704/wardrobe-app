/**
 * Currency options + formatting. The chosen currency lives on the user profile
 * (synced) and drives every money value in the app so nothing is hardcoded to $.
 */

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "CNY", symbol: "¥", label: "Chinese Yuan" },
  { code: "CHF", symbol: "Fr", label: "Swiss Franc" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
  { code: "AED", symbol: "AED", label: "UAE Dirham" },
  { code: "KRW", symbol: "₩", label: "South Korean Won" },
  { code: "BRL", symbol: "R$", label: "Brazilian Real" },
  { code: "MXN", symbol: "MX$", label: "Mexican Peso" },
  { code: "SEK", symbol: "kr", label: "Swedish Krona" },
  { code: "NZD", symbol: "NZ$", label: "New Zealand Dollar" },
  { code: "ZAR", symbol: "R", label: "South African Rand" },
];

export const DEFAULT_CURRENCY = "USD";

export function currencySymbol(code = DEFAULT_CURRENCY): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "$";
}

/** Format an amount in the given currency. `decimals` controls fraction digits. */
export function formatMoney(
  amount: number,
  code = DEFAULT_CURRENCY,
  decimals = 0,
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // Unknown/unsupported code — fall back to symbol + number.
    return `${currencySymbol(code)}${amount.toFixed(decimals)}`;
  }
}
