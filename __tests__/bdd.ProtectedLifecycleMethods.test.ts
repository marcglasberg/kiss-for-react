import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import {
  KissAction,
  OptimisticCommand,
  OptimisticSync,
  OptimisticSyncWithPush,
  PushMetadata,
  ServerPush,
  Store,
} from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Protected lifecycle methods');

class State {
  constructor(readonly count: number) {
  }
}

// Tells, at compile time, if `K` is a public member of `T`. Protected members are not in `keyof T`.
type IsPublic<T, K extends string> = K extends keyof T ? true : false;

// Only compiles if all the given methods are NOT public members of `T`. Returns the methods.
function notPublic<T>() {
  return <K extends string>(methods: { [P in K]: IsPublic<T, P> }) => Object.keys(methods);
}

const kissActionMethods = notPublic<KissAction<State>>()({
  reduce: false,
  before: false,
  after: false,
  wrapError: false,
  wrapReduce: false,
  abortDispatch: false,
  abortReduce: false,
  hasInternet: false,
  nonReentrantKeyParams: false,
  computeNonReentrantKey: false,
  debounceLockBuilder: false,
  ignoreOldKeyParams: false,
  computeIgnoreOldKey: false,
  throttleLockBuilder: false,
  freshKeyParams: false,
  computeFreshKey: false,
  sequentialKeyParams: false,
  discardQueueOnError: false,
  createPollingAction: false,
  pollingKeyParams: false,
  computePollingKey: false,
});

const optimisticCommandMethods = notPublic<OptimisticCommand<State, number>>()({
  reduce: false,
  optimisticValue: false,
  applyValueToState: false,
  getValueFromState: false,
  sendCommandToServer: false,
  applyServerResponseToState: false,
  reloadFromServer: false,
  rollbackState: false,
  shouldRollback: false,
  shouldReload: false,
  shouldApplyReload: false,
  applyReloadResultToState: false,
});

const optimisticSyncMethods = notPublic<OptimisticSync<State, number>>()({
  reduce: false,
  optimisticSyncKeyParams: false,
  computeOptimisticSyncKey: false,
  valueToApply: false,
  applyOptimisticValueToState: false,
  getValueFromState: false,
  sendValueToServer: false,
  applyServerResponseToState: false,
  onFinish: false,
  ifShouldSendAnotherRequest: false,
});

const optimisticSyncWithPushMethods = notPublic<OptimisticSyncWithPush<State, number>>()({
  reduce: false,
  optimisticSyncKeyParams: false,
  computeOptimisticSyncKey: false,
  valueToApply: false,
  applyOptimisticValueToState: false,
  getValueFromState: false,
  sendValueToServer: false,
  getServerRevisionFromState: false,
  applyServerResponseToState: false,
  onFinish: false,
});

const serverPushMethods = notPublic<ServerPush<State>>()({
  reduce: false,
  associatedAction: false,
  optimisticSyncKeyParams: false,
  computeOptimisticSyncKey: false,
  pushMetadata: false,
  applyServerPushToState: false,
  getServerRevisionFromState: false,
});

// Concrete subclasses, used to check that the methods above exist at run time (so that there
// are no typos in their names). Their own methods are public, since they don't say `protected`.

class ConcreteAction extends KissAction<State> {
  reduce() {
    return null;
  }
}

class ConcreteCommand extends OptimisticCommand<State, number> {
  optimisticValue() { return 1; }

  applyValueToState(state: State, value: number) { return new State(value); }

  getValueFromState(state: State) { return state.count; }

  async sendCommandToServer(_value: number) { return null; }

  async reloadFromServer() { return 1; }
}

class ConcreteSync extends OptimisticSync<State, number> {
  valueToApply() { return 1; }

  applyOptimisticValueToState(state: State, value: number) { return new State(value); }

  getValueFromState(state: State) { return state.count; }

  async sendValueToServer(_value: number) { return null; }
}

class ConcreteSyncWithPush extends OptimisticSyncWithPush<State, number> {
  valueToApply() { return 1; }

  applyOptimisticValueToState(state: State, value: number) { return new State(value); }

  getValueFromState(state: State) { return state.count; }

  async sendValueToServer(_value: number, _localRevision: number, _deviceId: number) { return null; }

  getServerRevisionFromState(_state: State, _key: any) { return 0; }
}

class ConcretePush extends ServerPush<State> {
  associatedAction() { return ConcreteSyncWithPush; }

  pushMetadata(): PushMetadata { return {serverRevision: 1, localRevision: 1, deviceId: 1}; }

  applyServerPushToState(state: State, _key: any, _serverRevision: number) { return state; }

  getServerRevisionFromState(_state: State, _key: any) { return 0; }
}

const classes: Record<string, { methods: string[], concrete: { prototype: object } }> = {
  'KissAction': {methods: kissActionMethods, concrete: ConcreteAction},
  'OptimisticCommand': {methods: optimisticCommandMethods, concrete: ConcreteCommand},
  'OptimisticSync': {methods: optimisticSyncMethods, concrete: ConcreteSync},
  'OptimisticSyncWithPush': {methods: optimisticSyncWithPushMethods, concrete: ConcreteSyncWithPush},
  'ServerPush': {methods: serverPushMethods, concrete: ConcretePush},
};

Bdd(feature)
  .scenario('The lifecycle methods of the action classes are protected.')
  .given('The <Class> class.')
  .when('Code outside the action calls one of its lifecycle methods, like reduce, before or after.')
  .then('It does not compile, since these methods are protected.')
  .and('They can only be called by the store, when the action is dispatched.')
  .example(val('Class', 'KissAction'))
  .example(val('Class', 'OptimisticCommand'))
  .example(val('Class', 'OptimisticSync'))
  .example(val('Class', 'OptimisticSyncWithPush'))
  .example(val('Class', 'ServerPush'))
  .run(async (ctx) => {
    // Given:
    const {methods, concrete} = classes[ctx.example.val('Class')];

    // When/Then: The `notPublic` calls above only compile if the methods are not public.
    // Here we check they are really methods of the class (no typos).
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect([method, typeof (concrete.prototype as any)[method]]).toEqual([method, 'function']);
    }
  });

Bdd(feature)
  .scenario('An action can override the protected lifecycle methods, and call super.')
  .given('An action that overrides before, after and wrapError, as protected methods.')
  .and('Each one calls super, and the reducer fails.')
  .when('The action is dispatched.')
  .then('The store calls before, then wrapError, then after.')
  .run(async (_) => {
    // Given:
    const trace: string[] = [];

    class Traced extends KissAction<State> {
      protected before() {
        trace.push('before');
        return super.before();
      }

      protected reduce(): State {
        throw new Error('boom');
      }

      protected wrapError(error: any) {
        trace.push('wrapError');
        return super.wrapError(error);
      }

      protected after() {
        trace.push('after');
        super.after();
      }
    }

    const store = new Store<State>({initialState: new State(0), logger: null});

    // When:
    await store.dispatchAndWait(new Traced()).catch(() => {});

    // Then:
    expect(trace).toEqual(['before', 'wrapError', 'after']);
  });
