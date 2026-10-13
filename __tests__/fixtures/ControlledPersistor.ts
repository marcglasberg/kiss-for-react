import { Persistor } from '../../src';
import { Deferred } from './deferred';

/**
 * A persistor whose operations the test controls explicitly. Each operation returns a promise
 * that only settles when the test calls the matching `finish...` method (or right away, if the
 * operation is not held). It also records every call, so that tests can check what was persisted.
 */
export class ControlledPersistor<St> extends Persistor<St> {
  /** What `readState` returns. */
  stateToRead: St | null;

  /** If set, `readState` rejects with it (after `finishReading`). */
  readError: unknown = null;

  /** If set, `deleteState` rejects with it. */
  deleteError: unknown = null;

  /** If set, `saveInitialState` rejects with it (after `finishSavingInitialState`). */
  saveInitialStateError: unknown = null;

  /** If set, `persistDifference` rejects with it. */
  persistError: unknown = null;

  /** Whether `readState` waits for `finishReading()`. */
  holdRead: boolean;

  /** Whether `saveInitialState` waits for `finishSavingInitialState()`. */
  holdSaveInitialState = false;

  /** The states given to `saveInitialState`, in order. */
  readonly savedInitialStates: St[] = [];

  /** The states given to `persistDifference`, in order. */
  readonly persistedStates: St[] = [];

  /** How many times `deleteState` was called. */
  deleteCount = 0;

  /** The last state the persistor holds (initial, persisted, or null after delete/read failure). */
  savedState: St | null = null;

  private _reading = new Deferred<void>();
  private _savingInitialState = new Deferred<void>();

  constructor({ stateToRead = null, holdRead = true }: { stateToRead?: St | null, holdRead?: boolean } = {}) {
    super();
    this.stateToRead = stateToRead;
    this.holdRead = holdRead;
  }

  /** Lets `readState` finish. */
  finishReading(): void {
    this._reading.resolve();
  }

  /** Lets `saveInitialState` finish. */
  finishSavingInitialState(): void {
    this._savingInitialState.resolve();
  }

  async readState(): Promise<St | null> {
    if (this.holdRead) await this._reading.promise;
    if (this.readError !== null) throw this.readError;
    return this.stateToRead;
  }

  async saveInitialState(state: St): Promise<void> {
    if (this.holdSaveInitialState) await this._savingInitialState.promise;
    if (this.saveInitialStateError !== null) throw this.saveInitialStateError;
    this.savedInitialStates.push(state);
    this.savedState = state;
  }

  async deleteState(): Promise<void> {
    this.deleteCount++;
    if (this.deleteError !== null) throw this.deleteError;
    this.savedState = null;
  }

  async persistDifference(_lastPersistedState: St | null, newState: St): Promise<void> {
    if (this.persistError !== null) throw this.persistError;
    this.persistedStates.push(newState);
    this.savedState = newState;
  }

  get throttle(): number | null {
    return null;
  }
}
