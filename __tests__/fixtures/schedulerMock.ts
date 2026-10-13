/**
 * The mock scheduler React uses in its own tests, which lets a test flush React's work step
 * by step: `flushNumberOfYields(1)` renders until the first component that calls `log`, and
 * stops there, with the work paused and nothing committed.
 *
 * To use it, a test file must replace the `scheduler` package before React is loaded:
 *
 * ```ts
 * jest.mock('scheduler', () => require('./fixtures/schedulerMock').SchedulerMock);
 * ```
 *
 * It only works outside `act()`, since `act()` bypasses the scheduler. So those tests also set
 * `IS_REACT_ACT_ENVIRONMENT` to false, and flush microtasks and the scheduler explicitly.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const SchedulerMock = require('scheduler/unstable_mock');

/** Records a value in the scheduler log. Components call it to show they rendered. */
export function log(value: string): void {
  (SchedulerMock.log ?? SchedulerMock.unstable_yieldValue)(value);
}

/** Returns the values logged since the last call, and clears the log. */
export function clearLog(): string[] {
  return (SchedulerMock.unstable_clearLog ?? SchedulerMock.unstable_clearYields)();
}

/** Runs the scheduled work until `count` values were logged, then pauses the work there. */
export function flushNumberOfYields(count: number): void {
  SchedulerMock.unstable_flushNumberOfYields(count);
}

/** Runs all the scheduled work. */
export function flushAll(): void {
  SchedulerMock.unstable_flushAllWithoutAsserting();
}

/** True if React scheduled work that was not flushed yet. Null if the mock can't tell (React 18). */
export function hasPendingWork(): boolean | null {
  const fn = SchedulerMock.unstable_hasPendingWork;
  return typeof fn === 'function' ? fn() : null;
}

/** Lets the pending microtasks run, so that React moves its sync work along and schedules the rest. */
export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** Flushes microtasks and the scheduler, a few times, until no work is left. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await flushMicrotasks();
    flushAll();
  }
  await flushMicrotasks();
}
