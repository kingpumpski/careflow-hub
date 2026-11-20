/** Global deployment defaults. Country-specific behavior must be supplied by configuration. */

export interface PlatformLocaleConfig {
  countryCode: string;
  currencyCode: string;
  locale: string;
  timeZone: string;
  dateFormat: Intl.DateTimeFormatOptions;
  numberFormat: Intl.NumberFormatOptions;
}

export const DEFAULT_PLATFORM_LOCALE: PlatformLocaleConfig = {
  countryCode: "GH",
  currencyCode: "GHS",
  locale: "en-GH",
  timeZone: "Africa/Accra",
  dateFormat: { year: "numeric", month: "short", day: "2-digit" },
  numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
};

export function formatMoney(amount: number, config: PlatformLocaleConfig = DEFAULT_PLATFORM_LOCALE): string {
  if (!Number.isFinite(amount)) throw new Error("Money amount must be a finite number.");
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currencyCode,
    ...config.numberFormat,
  }).format(amount);
}

export function formatDate(value: string | Date, config: PlatformLocaleConfig = DEFAULT_PLATFORM_LOCALE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Date value is invalid.");
  return new Intl.DateTimeFormat(config.locale, {
    ...config.dateFormat,
    timeZone: config.timeZone,
  }).format(date);
}
