import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import {
  KissAction,
  LoadPages,
  OptimisticCommand,
  OptimisticSync,
  OptimisticSyncWithPush,
  Pages,
  PushMetadata,
  ServerPush,
  Store,
  StoreException,
} from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Base classes with methods that must not be overridden');
const logger = (_obj: any) => {};

class State {
  constructor(readonly value: number = 0, readonly pages: Pages<number[], number> | null = null) {
  }
}

// A minimal action of each Kiss base class. They don't override `reduce`.

class SaveValue extends OptimisticCommand<State, number> {
  protected optimisticValue() { return 1; }
  protected applyValueToState(state: State, value: number) { return new State(value, state.pages); }
  protected getValueFromState(state: State) { return state.value; }
  protected async sendCommandToServer(_value: number) { return null; }
}

class SyncValue extends OptimisticSync<State, number> {
  protected valueToApply() { return 1; }
  protected applyOptimisticValueToState(state: State, value: number) { return new State(value, state.pages); }
  protected getValueFromState(state: State) { return state.value; }
  protected async sendValueToServer(_value: number) { return null; }
}

class SyncValueWithPush extends OptimisticSyncWithPush<State, number> {
  protected valueToApply() { return 1; }
  protected applyOptimisticValueToState(state: State, value: number) { return new State(value, state.pages); }
  protected getValueFromState(state: State) { return state.value; }
  protected async sendValueToServer(_value: number, _localRevision: number, _deviceId: number) { return null; }
  protected getServerRevisionFromState(_state: State, _key: any) { return -1; }
}

class PushValue extends ServerPush<State> {
  protected associatedAction() { return SyncValueWithPush; }
  protected pushMetadata(): PushMetadata { return { serverRevision: 1, localRevision: 0, deviceId: 999 }; }
  protected applyServerPushToState(state: State, _key: any, _serverRevision: number) { return new State(2, state.pages); }
  protected getServerRevisionFromState(_state: State, _key: any) { return -1; }
}

class LoadNumbers extends LoadPages<State, number[], number> {
  protected getPagesFromState(state: State) { return state.pages; }
  protected applyPagesToState(state: State, pages: Pages<number[], number>) { return new State(state.value, pages); }
  protected initialPageParam() { return 0; }
  protected loadPage(_pageParam: number) { return [1, 2, 3]; }
  protected nextPageParam() { return null; }
}

// A subclass of each base class, which overrides `reduce`.
const reduceOverrides: Record<string, () => KissAction<State>> = {
  OptimisticCommand: () => new (class extends SaveValue { async reduce() { return null; } })(),
  OptimisticSync: () => new (class extends SyncValue { async reduce() { return null; } })(),
  OptimisticSyncWithPush: () => new (class extends SyncValueWithPush { async reduce() { return null; } })(),
  ServerPush: () => new (class extends PushValue { reduce() { return null; } })(),
  LoadPages: () => new (class extends LoadNumbers { async reduce() { return null; } })(),
};

Bdd(feature)
  .scenario('An action that overrides the reduce of a Kiss base class can\'t be dispatched.')
  .given('An action that extends the given Kiss base class.')
  .and('The action overrides reduce.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException, which says the action must not override reduce.')
  .and('The state does not change.')
  .example(val('Base class', 'OptimisticCommand'))
  .example(val('Base class', 'OptimisticSync'))
  .example(val('Base class', 'OptimisticSyncWithPush'))
  .example(val('Base class', 'ServerPush'))
  .example(val('Base class', 'LoadPages'))
  .run(async (ctx) => {
    // Given:
    const baseClass: string = ctx.example.val('Base class');
    const store = new Store<State>({ initialState: new State(), logger });
    const action = reduceOverrides[baseClass]();

    // When/Then:
    expect(() => store.dispatch(action)).toThrow(StoreException);
    expect(() => store.dispatch(reduceOverrides[baseClass]())).toThrow(`must not override \`reduce\``);
    expect(store.state.value).toBe(0);
  });

Bdd(feature)
  .scenario('An action that overrides reduce as an arrow function property can\'t be dispatched.')
  .given('An action that extends OptimisticCommand.')
  .and('The action overrides reduce with an arrow function property.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException, which says the action must not override reduce.')
  .run(async (_) => {
    // Given:
    class SaveValueWithArrow extends SaveValue {
      reduce = async () => null;
    }

    const store = new Store<State>({ initialState: new State(), logger });

    // When/Then:
    expect(() => store.dispatch(new SaveValueWithArrow())).toThrow('must not override `reduce`');
    expect(store.state.value).toBe(0);
  });

Bdd(feature)
  .scenario('An action whose own base class overrides reduce can\'t be dispatched.')
  .given('A base class of the app, which extends OptimisticSync and overrides reduce.')
  .and('An action that extends that base class, and doesn\'t override reduce.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException, which says the action must not override reduce.')
  .run(async (_) => {
    // Given:
    abstract class AppSync extends SyncValue {
      async reduce() { return null; }
    }

    class SyncLike extends AppSync {
    }

    const store = new Store<State>({ initialState: new State(), logger });

    // When/Then:
    expect(() => store.dispatch(new SyncLike())).toThrow('must not override `reduce`');
  });

Bdd(feature)
  .scenario('An action with a base class of the app that doesn\'t override reduce is dispatched normally.')
  .given('A base class of the app, which extends OptimisticCommand and doesn\'t override reduce.')
  .and('An action that extends that base class, and doesn\'t override reduce.')
  .when('The action is dispatched.')
  .then('The action completes successfully, and changes the state.')
  .run(async (_) => {
    // Given:
    abstract class AppCommand extends SaveValue {
      protected before() {}
      protected after() {}
    }

    class SaveOne extends AppCommand {
    }

    const store = new Store<State>({ initialState: new State(), logger });

    // When:
    const status = await store.dispatchAndWait(new SaveOne());

    // Then:
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.value).toBe(1);
  });

Bdd(feature)
  .scenario('A LoadPages action that overrides statusKey can\'t be dispatched.')
  .given('An action that extends LoadPages.')
  .and('The action overrides the statusKey getter.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException, which says the action must not override statusKey.')
  .run(async (_) => {
    // Given:
    class LoadNumbersWithStatusKey extends LoadNumbers {
      get statusKey() { return 'numbers'; }
    }

    const store = new Store<State>({ initialState: new State(), logger });

    // When/Then:
    expect(() => store.dispatch(new LoadNumbersWithStatusKey())).toThrow(StoreException);
    expect(() => store.dispatch(new LoadNumbersWithStatusKey())).toThrow('must not override `statusKey`');
    expect(store.state.pages).toBe(null);
  });
