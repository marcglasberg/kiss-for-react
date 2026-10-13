/**
 * A promise that is settled explicitly by the test, with `resolve()` or `reject()`.
 * Use it to keep an action or a persistor pending until the test decides to finish it,
 * instead of waiting a fixed time and hoping the work is done.
 */
export class Deferred<T = void> {
  readonly promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;
  isSettled = false;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = (value) => {
        this.isSettled = true;
        resolve(value);
      };
      this.reject = (reason) => {
        this.isSettled = true;
        reject(reason);
      };
    });
  }
}

/** Lets the pending microtasks run (for example, a `dispatchAndWait` that resolved). */
export async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Waits for the macrotask queue, so that `setTimeout(0)` callbacks and resolved promises ran. */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
