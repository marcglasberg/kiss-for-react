import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Aborting actions before their delayed work starts');

class Gate<T> {
  open!: (value: T) => void;
  readonly promise = new Promise<T>(resolve => this.open = resolve);
}

class SaveRequest {
  readonly values: string[] = [];

  async send(value: string): Promise<void> {
    this.values.push(value);
  }
}

class Save extends KissAction<string> {
  afterCalls = 0;

  constructor(readonly request: SaveRequest) { super(); }

  async reduce() {
    await this.request.send('saved');
    return () => 'saved';
  }

  after() { this.afterCalls++; }
}

class DebouncedSave extends Save {
  debounce = 100;
}

class SaveAfterConnectionCheck extends Save {
  unlimitedRetryCheckInternet = true;
  readonly checkStarted = new Gate<void>();
  readonly connection = new Gate<boolean>();

  protected hasInternet(): Promise<boolean> {
    this.checkStarted.open();
    return this.connection.promise;
  }
}

class SaveAfterPreparation extends Save {
  readonly preparationStarted = new Gate<void>();
  readonly preparation = new Gate<void>();

  async before() {
    this.preparationStarted.open();
    await this.preparation.promise;
  }
}

function abort(store: Store<string>, action: Save, method: string): void {
  if (method === 'action.abort()') action.abort();
  else if (method === 'store.abort(Save)') store.abort(Save);
  else throw new Error(`Unknown abort method: ${method}`);
}

function expectCancelledSave(store: Store<string>, action: Save): void {
  expect(action.isAborted).toBe(true);
  expect(action.abortSignal.aborted).toBe(true);
  expect(action.status.isDispatchAborted).toBe(true);
  expect(action.status.isCompleted).toBe(true);
  expect(action.afterCalls).toBe(1);
  expect(store.isWaiting(Save)).toBe(false);
  expect(store.isFailed(action.constructor as typeof Save)).toBe(false);
  expect(store.userExceptionsQueue).toEqual([]);
  expect(store.state).toBe('unsaved');
  expect(action.request.values).toEqual([]);
}

Bdd(feature)
  .scenario('Cancelling a save during its debounce delay prevents the server request.')
  .given('The state contains an unsaved value, and a save action waits for a 100 millisecond debounce delay.')
  .and('The save action has not sent a request to the server.')
  .when('The action is cancelled with [Method] before the debounce delay ends.')
  .and('The debounce delay ends.')
  .then('The action finishes as aborted, its abort signal is set, and its after method runs once.')
  .and('The action is no longer waiting, does not count as failed, and shows no error.')
  .and('The state remains unsaved, and no save request reaches the server.')
  .example(val('Method', 'action.abort()'))
  .example(val('Method', 'store.abort(Save)'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = new Store<string>({ initialState: 'unsaved', logger: null });
    const request = new SaveRequest();
    const action = new DebouncedSave(request);

    try {
      const done = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(99);
      expect(store.isWaiting(DebouncedSave)).toBe(true);
      expect(request.values).toEqual([]);

      abort(store, action, ctx.example.val('Method'));
      await jest.advanceTimersByTimeAsync(1);
      const status = await done;

      expect(status).toBe(action.status);
      expectCancelledSave(store, action);
    } finally {
      await store.dispose();
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('Cancelling a save during its internet check prevents the server request.')
  .given('The state contains an unsaved value, and a save action uses unlimitedRetryCheckInternet.')
  .and('The connection check is still pending, and the save action has not sent a request.')
  .when('The action is cancelled with [Method], and the connection check then reports that the internet is available.')
  .then('The action finishes as aborted, its abort signal is set, and its after method runs once.')
  .and('The action is no longer waiting, does not count as failed, and shows no error.')
  .and('The state remains unsaved, and no save request reaches the server.')
  .example(val('Method', 'action.abort()'))
  .example(val('Method', 'store.abort(Save)'))
  .run(async (ctx) => {
    const store = new Store<string>({ initialState: 'unsaved', logger: null });
    const request = new SaveRequest();
    const action = new SaveAfterConnectionCheck(request);

    try {
      const done = store.dispatchAndWait(action);
      await action.checkStarted.promise;
      expect(store.isWaiting(SaveAfterConnectionCheck)).toBe(true);
      expect(request.values).toEqual([]);

      abort(store, action, ctx.example.val('Method'));
      action.connection.open(true);
      const status = await done;

      expect(status).toBe(action.status);
      expectCancelledSave(store, action);
    } finally {
      action.connection.open(true);
      await store.dispose();
    }
  });

Bdd(feature)
  .scenario('Cancelling a save during its before method prevents the server request.')
  .given('The state contains an unsaved value, and the save action waits for asynchronous preparation in before.')
  .and('The save action has not sent a request to the server.')
  .when('The action is cancelled with [Method], and the preparation then finishes.')
  .then('The action finishes as aborted, its abort signal is set, and its after method runs once.')
  .and('The action is no longer waiting, does not count as failed, and shows no error.')
  .and('The state remains unsaved, and no save request reaches the server.')
  .example(val('Method', 'action.abort()'))
  .example(val('Method', 'store.abort(Save)'))
  .run(async (ctx) => {
    const store = new Store<string>({ initialState: 'unsaved', logger: null });
    const request = new SaveRequest();
    const action = new SaveAfterPreparation(request);

    try {
      const done = store.dispatchAndWait(action);
      await action.preparationStarted.promise;
      expect(store.isWaiting(SaveAfterPreparation)).toBe(true);
      expect(request.values).toEqual([]);

      abort(store, action, ctx.example.val('Method'));
      action.preparation.open();
      const status = await done;

      expect(status).toBe(action.status);
      expectCancelledSave(store, action);
    } finally {
      action.preparation.open();
      await store.dispose();
    }
  });

Bdd(feature)
  .scenario('Cancelling a save during its debounce delay finishes it right away.')
  .given('The state contains an unsaved value, and a save action waits for a 100 millisecond debounce delay.')
  .when('The action is cancelled with [Method] 10 milliseconds after it was dispatched.')
  .then('The action finishes as aborted right away, without waiting for the end of the debounce delay.')
  .and('The state remains unsaved, and no save request reaches the server, also after the delay.')
  .example(val('Method', 'action.abort()'))
  .example(val('Method', 'store.abort(Save)'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = new Store<string>({ initialState: 'unsaved', logger: null });
    const request = new SaveRequest();
    const action = new DebouncedSave(request);

    try {
      const done = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(10);

      abort(store, action, ctx.example.val('Method'));
      await jest.advanceTimersByTimeAsync(0);
      const finishedBeforeDelayEnded = action.status.isCompleted;
      await jest.advanceTimersByTimeAsync(200);
      await done;

      expect(finishedBeforeDelayEnded).toBe(true);
      expectCancelledSave(store, action);
    } finally {
      await store.dispose();
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('A new save runs normally after a save was cancelled during its debounce delay.')
  .given('A save action was cancelled during its 100 millisecond debounce delay.')
  .when('A new save action of the same type is dispatched.')
  .then('The new save waits for its debounce delay, and then sends its request.')
  .and('The state is saved, and the cancelled save sent no request.')
  .run(async () => {
    jest.useFakeTimers();
    const store = new Store<string>({ initialState: 'unsaved', logger: null });
    const cancelledRequest = new SaveRequest();
    const cancelled = new DebouncedSave(cancelledRequest);
    const request = new SaveRequest();
    const action = new DebouncedSave(request);

    try {
      const cancelledDone = store.dispatchAndWait(cancelled);
      await jest.advanceTimersByTimeAsync(10);
      cancelled.abort();
      await cancelledDone;

      const done = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(99);
      const sentBeforeDelayEnded = [...request.values];
      await jest.advanceTimersByTimeAsync(1);
      const status = await done;

      expect(cancelled.status.isDispatchAborted).toBe(true);
      expect(sentBeforeDelayEnded).toEqual([]);
      expect(status.isCompletedOk).toBe(true);
      expect(request.values).toEqual(['saved']);
      expect(cancelledRequest.values).toEqual([]);
      expect(store.state).toBe('saved');
    } finally {
      await store.dispose();
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('Cancelling a save while it waits to check the internet again prevents the server request.')
  .given('The state contains an unsaved value, and a save action uses unlimitedRetryCheckInternet.')
  .and('The connection check reported no internet, so the action waits to check again.')
  .when('The action is cancelled with [Method].')
  .then('The action finishes as aborted, without checking the connection again.')
  .and('The state remains unsaved, and no save request reaches the server.')
  .example(val('Method', 'action.abort()'))
  .example(val('Method', 'store.abort(Save)'))
  .run(async (ctx) => {
    class SaveWithoutInternet extends Save {
      unlimitedRetryCheckInternet = true;
      checks = 0;
      readonly checkStarted = new Gate<void>();

      protected hasInternet(): Promise<boolean> {
        this.checks++;
        this.checkStarted.open();
        return Promise.resolve(false);
      }
    }
    const store = new Store<string>({ initialState: 'unsaved', logger: null });
    const request = new SaveRequest();
    const action = new SaveWithoutInternet(request);

    try {
      const done = store.dispatchAndWait(action);
      await action.checkStarted.promise;

      abort(store, action, ctx.example.val('Method'));
      const status = await done;

      expect(status).toBe(action.status);
      expect(action.checks).toBe(1);
      expectCancelledSave(store, action);
    } finally {
      await store.dispose();
    }
  });
