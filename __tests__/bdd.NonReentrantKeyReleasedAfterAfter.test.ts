import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Non-reentrant key is released after the after method');

Bdd(feature)
  .scenario('Dispatching the same non-reentrant action from its after() method is aborted, whatever its reducer did.')
  .given('A non-reentrant action that dispatches the same action again from its after() method.')
  .when('The action is dispatched, and its reducer is SYNC or ASYNC, and changes the state, returns null, or fails.')
  .then('The action dispatched from after() is aborted, since the non-reentrant key is only released after after() runs.')
  .and('The state is changed only by the first action.')
  .example(val('Reducer', 'async'), val('Result', 'changes the state'))
  .example(val('Reducer', 'async'), val('Result', 'returns null'))
  .example(val('Reducer', 'async'), val('Result', 'fails'))
  .example(val('Reducer', 'sync'), val('Result', 'changes the state'))
  .example(val('Reducer', 'sync'), val('Result', 'returns null'))
  .example(val('Reducer', 'sync'), val('Result', 'fails'))
  .run(async (ctx) => {
    const isAsync = ctx.example.val('Reducer') === 'async';
    const result = ctx.example.val('Result') as Result;

    // Given
    const store = new Store<State>({ initialState: new State(0) });
    const log: string[] = [];
    const first = isAsync ? new AsyncRefresh(1, result, log) : new SyncRefresh(1, result, log);

    // When
    await store.dispatchAndWait(first);
    await flush(5);

    // Then
    expect(log).toEqual(['reduce 1', 'after 1']);
    expect(first.dispatchedFromAfter!.status.isDispatched).toBe(false);
    expect(store.state.count).toBe(result === 'changes the state' ? 1 : 0);
  });

Bdd(feature)
  .scenario('Dispatching the same non-reentrant action after its state changed, but before its after() method ran, is aborted.')
  .given('A non-reentrant ASYNC action whose reducer changes the state.')
  .and('The same action is dispatched again right after the state changes, before after() runs.')
  .when('The first action is dispatched.')
  .then('The action dispatched after the state changed is aborted, since the first action has not finished.')
  .run(async (_) => {
    // Given
    const log: string[] = [];
    const first = new AsyncRefresh(1, 'changes the state', log, false);
    let hadFinishedAfter: boolean | undefined;
    let second: AsyncRefresh | undefined;
    const store = new Store<State>({
      initialState: new State(0),
      stateObserver: (action) => {
        if (action === first) queueMicrotask(() => {
          hadFinishedAfter = first.status.hasFinishedMethodAfter;
          second = new AsyncRefresh(2, 'changes the state', log, false);
          store.dispatch(second);
        });
      },
    });

    // When
    await store.dispatchAndWait(first);
    await flush(5);

    // Then
    expect(hadFinishedAfter).toBe(false);
    expect(second!.status.isDispatched).toBe(false);
    expect(log).toEqual(['reduce 1', 'after 1']);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('A non-reentrant action with a different key can be dispatched from the after() method.')
  .given('A non-reentrant action whose key depends on a parameter.')
  .and('It dispatches the same action, but with a different key, from its after() method.')
  .when('The action is dispatched, and its reducer changes the state or returns null.')
  .then('The action dispatched from after() runs, since its key is not taken.')
  .example(val('Reducer', 'async'), val('Result', 'changes the state'))
  .example(val('Reducer', 'async'), val('Result', 'returns null'))
  .example(val('Reducer', 'sync'), val('Result', 'changes the state'))
  .example(val('Reducer', 'sync'), val('Result', 'returns null'))
  .run(async (ctx) => {
    const isAsync = ctx.example.val('Reducer') === 'async';
    const result = ctx.example.val('Result') as Result;

    // Given
    const store = new Store<State>({ initialState: new State(0) });
    const log: string[] = [];
    const first = isAsync ? new AsyncRefreshById(1, result, log) : new SyncRefreshById(1, result, log);

    // When
    await store.dispatchAndWait(first);
    await flush(5);

    // Then
    expect(log).toEqual(['reduce 1', 'after 1', 'reduce 2', 'after 2']);
    expect(first.dispatchedFromAfter!.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(result === 'changes the state' ? 2 : 0);
  });

Bdd(feature)
  .scenario('Once the non-reentrant action has finished, the same action can be dispatched again.')
  .given('A non-reentrant action whose reducer changes the state or returns null.')
  .and('The same action is dispatched again when the action observer sees the first action has finished.')
  .when('The first action is dispatched.')
  .then('The action dispatched after the first one finished runs.')
  .example(val('Reducer', 'async'), val('Result', 'changes the state'))
  .example(val('Reducer', 'async'), val('Result', 'returns null'))
  .example(val('Reducer', 'sync'), val('Result', 'changes the state'))
  .example(val('Reducer', 'sync'), val('Result', 'returns null'))
  .run(async (ctx) => {
    const isAsync = ctx.example.val('Reducer') === 'async';
    const result = ctx.example.val('Result') as Result;
    const log: string[] = [];
    const create = (n: number) =>
      isAsync ? new AsyncRefresh(n, result, log, false) : new SyncRefresh(n, result, log, false);

    // Given
    let second: KissAction<State> | undefined;
    const first = create(1);
    const store = new Store<State>({
      initialState: new State(0),
      actionObserver: (action, _dispatchCount, ini) => {
        if (action === first && !ini) {
          second = create(2);
          store.dispatch(second);
        }
      },
    });

    // When
    await store.dispatchAndWait(first);
    await flush(5);

    // Then
    expect(log).toEqual(['reduce 1', 'after 1', 'reduce 2', 'after 2']);
    expect(second!.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(result === 'changes the state' ? 2 : 0);
  });

Bdd(feature)
  .scenario('An unlimitedRetryCheckInternet action dispatched from its own after() method is aborted.')
  .given('An action with "unlimitedRetryCheckInternet = true", which is non-reentrant.')
  .and('Its reducer changes the state.')
  .and('It dispatches the same action again from its after() method.')
  .when('The action is dispatched.')
  .then('The action dispatched from after() is aborted.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({ initialState: new State(0) });
    const log: string[] = [];
    const first = new AsyncRefreshWithInternet(1, 'changes the state', log);

    // When
    await store.dispatchAndWait(first);
    await flush(5);

    // Then
    expect(log).toEqual(['reduce 1', 'after 1']);
    expect(first.dispatchedFromAfter!.status.isDispatched).toBe(false);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('An action that shares the non-reentrant key, dispatched from the after() method, is aborted.')
  .given('A non-reentrant action, and an optimistic command, that share the same non-reentrant key.')
  .and('The action dispatched first changes the state.')
  .and('It dispatches the other one from its after() method.')
  .when('The first action is dispatched.')
  .then('The one dispatched from after() is aborted.')
  .example(val('First', 'non-reentrant action'))
  .example(val('First', 'optimistic command'))
  .run(async (ctx) => {
    const commandFirst = ctx.example.val('First') === 'optimistic command';

    // Given
    const store = new Store<State>({ initialState: new State(0) });
    const log: string[] = [];
    let second: KissAction<State> | undefined;
    const first = commandFirst
      ? new SaveCount(1, log, () => second = new SharedKeyRefresh(2, 'changes the state', log, false))
      : new SharedKeyRefresh(1, 'changes the state', log, false, () => second = new SaveCount(2, log));

    // When
    await store.dispatchAndWait(first);
    await flush(5);

    // Then
    expect(log).toEqual(['reduce 1', 'after 1']);
    expect(second!.status.isDispatched).toBe(false);
    expect(store.state.count).toBe(1);
  });

// ---

type Result = 'changes the state' | 'returns null' | 'fails';

class State {
  constructor(readonly count: number) {
  }
}

async function flush(times: number = 1) {
  for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Non-reentrant action. When it's the first one (n = 1), and `redispatch` is true, it dispatches
 * `next()` from its `after()` method, and keeps it in `dispatchedFromAfter`.
 */
abstract class Refresh extends KissAction<State> {
  nonReentrant = true;
  dispatchedFromAfter: KissAction<State> | undefined;

  constructor(
    readonly n: number,
    readonly result: Result,
    readonly calls: string[],
    readonly redispatch: boolean = true,
    readonly createNext?: () => KissAction<State>,
  ) {
    super();
  }

  abstract next(): KissAction<State>;

  protected reduceSync(): State | null {
    this.calls.push('reduce ' + this.n);
    if (this.result === 'fails') throw new UserException('Failed');
    return this.result === 'changes the state' ? new State(this.state.count + 1) : null;
  }

  protected async reduceAsync(): Promise<((state: State) => State) | null> {
    this.calls.push('reduce ' + this.n);
    await flush();
    if (this.result === 'fails') throw new UserException('Failed');
    return this.result === 'changes the state' ? (state: State) => new State(state.count + 1) : null;
  }

  after() {
    this.calls.push('after ' + this.n);
    if (this.n === 1 && (this.redispatch || this.createNext !== undefined)) {
      this.dispatchedFromAfter = this.createNext?.() ?? this.next();
      this.dispatch(this.dispatchedFromAfter);
    }
  }
}

class SyncRefresh extends Refresh {
  next() {
    return new SyncRefresh(2, this.result, this.calls);
  }

  reduce() {
    return this.reduceSync();
  }
}

class AsyncRefresh extends Refresh {
  next() {
    return new AsyncRefresh(2, this.result, this.calls);
  }

  reduce() {
    return this.reduceAsync();
  }
}

class SyncRefreshById extends SyncRefresh {
  nonReentrantKeyParams() {
    return this.n;
  }

  next() {
    return new SyncRefreshById(2, this.result, this.calls);
  }
}

class AsyncRefreshById extends AsyncRefresh {
  nonReentrantKeyParams() {
    return this.n;
  }

  next() {
    return new AsyncRefreshById(2, this.result, this.calls);
  }
}

class AsyncRefreshWithInternet extends AsyncRefresh {
  nonReentrant = false;
  unlimitedRetryCheckInternet = true;

  protected hasInternet(): Promise<boolean> {
    return Promise.resolve(true);
  }

  next() {
    return new AsyncRefreshWithInternet(2, this.result, this.calls);
  }
}

class SharedKeyRefresh extends AsyncRefresh {
  computeNonReentrantKey() {
    return 'count';
  }
}

/**
 * Optimistic command that shares the non-reentrant key with `SharedKeyRefresh`.
 * Its server response changes the state.
 */
class SaveCount extends OptimisticCommand<State, number> {
  constructor(readonly n: number, readonly calls: string[], readonly createNext?: () => KissAction<State>) {
    super();
  }

  computeNonReentrantKey() {
    return 'count';
  }

  optimisticValue() {
    return 1;
  }

  getValueFromState(state: State) {
    return state.count;
  }

  applyValueToState(_state: State, value: number) {
    return new State(value);
  }

  async sendCommandToServer() {
    this.calls.push('reduce ' + this.n);
    await flush();
    return 1;
  }

  after() {
    this.calls.push('after ' + this.n);
    if (this.createNext !== undefined) this.dispatch(this.createNext());
  }
}
