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
