/**
 * Exact currency arithmetic for financial domain calculations.
 *
 * Pass decimal strings from database/API values whenever possible. JavaScript
 * number inputs are accepted for compatibility, but cannot recover precision
 * already lost before they reach this module.
 */

export type DecimalAmount = string | number;

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

function currencyScale(currencyCode: string): number {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new Error(`Unsupported ISO 4217 currency code: ${currencyCode}`);
  }
}

function parseDecimal(value: DecimalAmount): { numerator: bigint; denominator: bigint } {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Money amount must be finite.");
  }

  const input = String(value).trim();
  const match = DECIMAL_PATTERN.exec(input);
  if (!match) throw new Error(`Invalid decimal amount: ${input}`);

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2];
  const fraction = match[3] ?? "";
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");

  return { numerator: numerator * sign, denominator };
}

function roundDivision(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Decimal denominator must be positive.");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n);
  return negative ? -rounded : rounded;
}

export function toMinorUnits(amount: DecimalAmount, currencyCode: string): bigint {
  const scale = currencyScale(currencyCode);
  const { numerator, denominator } = parseDecimal(amount);
  return roundDivision(numerator * 10n ** BigInt(scale), denominator);
}

export function fromMinorUnits(minorUnits: bigint, currencyCode: string): string {
  const scale = currencyScale(currencyCode);
  const negative = minorUnits < 0n;
  const absolute = negative ? -minorUnits : minorUnits;
  const divisor = 10n ** BigInt(scale);
  const whole = absolute / divisor;
  if (scale === 0) return `${negative ? "-" : ""}${whole}`;
  const fraction = (absolute % divisor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function addMoney(
  left: DecimalAmount,
  right: DecimalAmount,
  currencyCode: string,
): string {
  return fromMinorUnits(
    toMinorUnits(left, currencyCode) + toMinorUnits(right, currencyCode),
    currencyCode,
  );
}

export function subtractMoney(
  left: DecimalAmount,
  right: DecimalAmount,
  currencyCode: string,
): string {
  return fromMinorUnits(
    toMinorUnits(left, currencyCode) - toMinorUnits(right, currencyCode),
    currencyCode,
  );
}

/** Multiplies an amount by an exact decimal factor and rounds to currency precision. */
export function multiplyMoney(
  amount: DecimalAmount,
  factor: DecimalAmount,
  currencyCode: string,
): string {
  const amountMinor = toMinorUnits(amount, currencyCode);
  const parsedFactor = parseDecimal(factor);
  const result = roundDivision(
    amountMinor * parsedFactor.numerator,
    parsedFactor.denominator,
  );
  return fromMinorUnits(result, currencyCode);
}

export function compareMoney(
  left: DecimalAmount,
  right: DecimalAmount,
  currencyCode: string,
): -1 | 0 | 1 {
  const leftMinor = toMinorUnits(left, currencyCode);
  const rightMinor = toMinorUnits(right, currencyCode);
  return leftMinor < rightMinor ? -1 : leftMinor > rightMinor ? 1 : 0;
}

/** Calculates a percentage of a currency amount without binary floating-point arithmetic. */
export function percentageOfMoney(
  amount: DecimalAmount,
  percentage: DecimalAmount,
  currencyCode: string,
): string {
  const amountMinor = toMinorUnits(amount, currencyCode);
  const parsedPercentage = parseDecimal(percentage);
  return fromMinorUnits(
    roundDivision(amountMinor * parsedPercentage.numerator, parsedPercentage.denominator * 100n),
    currencyCode,
  );
}
