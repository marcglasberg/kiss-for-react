export function delayMillis(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, capTimeoutMillis(ms)));
}

/** The largest delay `setTimeout` accepts (about 24.8 days). Larger delays fire after 1 ms. */
export const MAX_TIMEOUT_MILLIS = 2 ** 31 - 1;

/**
 * Returns the given delay, capped at the largest delay `setTimeout` accepts (about 24.8 days).
 * Without the cap, a larger delay would fire after 1 ms.
 */
export function capTimeoutMillis(millis: number): number {
  return Math.min(millis, MAX_TIMEOUT_MILLIS);
}

/** True for an object literal, or an object with no prototype. Not for class instances or arrays. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Turns a value into a string, for logging. Never throws, so that a circular, BigInt,
 * prototype-less or otherwise unserializable value can still be logged.
 */
export function describeValue(value: any): string {
  if (typeof value === 'bigint') return `${value}n`;
  try {
    return JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? `${v}n` : v);
  } catch {
    try {
      return String(value);
    } catch {
      return '[object]';
    }
  }
}
