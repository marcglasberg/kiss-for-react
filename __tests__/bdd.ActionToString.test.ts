import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Action toString');

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  constructor(readonly payload: any) {
    super();
  }

  reduce() {
    return new State(this.state.count + 1);
  }
}

function circularValue() {
  const circular: any = { name: 'x' };
  circular.self = circular;
  return circular;
}

const throwingToJson = { toJSON() { throw new Error('Cannot serialize'); } };

Bdd(feature)
  .scenario('An action with a field that cannot be turned into JSON can be dispatched.')
  .given('An action with a circular, BigInt, or unserializable field.')
  .and('Logging is turned off.')
  .when('The action is dispatched.')
  .then('The dispatch does not throw.')
  .and('The action runs and changes the state.')
  .example(val('Field', 'circular'))
  .example(val('Field', 'bigint'))
  .example(val('Field', 'throwing toJSON'))
  .run(async (ctx) => {
    const field = ctx.example.val('Field');
    const payload = field === 'circular' ? circularValue() : field === 'bigint' ? 10n : throwingToJson;
    const store = new Store<State>({ initialState: new State(1), logger: () => {} });
    const action = new Increment(payload);

    expect(() => store.dispatch(action)).not.toThrow();
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('An action with a field that cannot be turned into JSON is still logged.')
  .given('An action with a circular, BigInt, or unserializable field.')
  .and('Logging is turned on.')
  .when('The action is dispatched.')
  .then('The dispatch does not throw.')
  .and('The action is logged with its class name.')
  .example(val('Field', 'circular'))
  .example(val('Field', 'bigint'))
  .example(val('Field', 'throwing toJSON'))
  .run(async (ctx) => {
    const field = ctx.example.val('Field');
    const payload = field === 'circular' ? circularValue() : field === 'bigint' ? 10n : throwingToJson;
    const logs: string[] = [];
    const store = new Store<State>({ initialState: new State(1), logger: (obj) => logs.push(String(obj)) });

    expect(() => store.dispatch(new Increment(payload))).not.toThrow();
    expect(store.state.count).toBe(2);
    expect(logs.some((log) => log.includes('Increment(') && log.includes('payload:'))).toBe(true);
  });

Bdd(feature)
  .scenario('The description of an action shows fields that cannot be turned into JSON.')
  .given('An action with a BigInt field.')
  .when('The action is turned into a string.')
  .then('The BigInt value is shown.')
  .run(async (_) => {
    expect(new Increment(10n).toString()).toContain('payload:10n)');
  });

Bdd(feature)
  .scenario('The description of an action with normal fields is unchanged.')
  .given('An action with a number field.')
  .when('The action is turned into a string.')
  .then('The field is shown as JSON.')
  .run(async (_) => {
    expect(new Increment(10).toString()).toContain('payload:10)');
    expect(new Increment({ a: 1 }).toString()).toContain('payload:{a:1})');
  });
class NoFields extends KissAction<State> {
  reduce() { return null; }
}

class WithFields extends KissAction<State> {
  constructor(readonly amount: number, readonly label: string) { super(); }

  reduce() { return null; }
}

class WithCheckInternet extends KissAction<State> {
  checkInternet = {dialog: true};

  reduce() { return null; }
}

class WithRetry extends KissAction<State> {
  retry = {maxRetries: 3};

  async reduce() { return null; }
}

Bdd(feature)
  .scenario('An action without fields is described by its name only.')
  .given('An action that declares no fields of its own.')
  .when('The action is turned into a string.')
  .then('Only the action name is printed, without any base class fields.')
  .run(async (_) => {
    const action = new NoFields();
    expect(action.toString()).toBe('NoFields()');
    expect(Object.keys(action)).not.toContain('checkInternet');
    expect(Object.keys(action)).not.toContain('retry');
  });

Bdd(feature)
  .scenario('An action with fields prints its own fields.')
  .given('An action with fields "amount" and "label".')
  .when('The action is turned into a string.')
  .then('Its fields are printed, and the base class fields are not.')
  .run(async (_) => {
    expect(new WithFields(10, 'x').toString()).toBe('WithFields(amount:10, label:x)');
  });

Bdd(feature)
  .scenario('The "checkInternet" and "retry" configurations are not printed.')
  .given('An action that sets "checkInternet", and an action that sets "retry".')
  .when('The actions are turned into strings.')
  .then('The configurations are not printed.')
  .run(async (_) => {
    expect(new WithCheckInternet().toString()).toBe('WithCheckInternet()');
    expect(new WithRetry().toString()).toBe('WithRetry()');
  });

class WithDebounce extends KissAction<State> {
  debounce = 300;

  reduce() { return null; }
}

class WithThrottle extends KissAction<State> {
  throttle = 5000;
  removeThrottleLockOnError = true;

  reduce() { return null; }
}

class WithFresh extends KissAction<State> {
  fresh = 5000;

  reduce() { return null; }
}

class WithSequential extends KissAction<State> {
  sequential = true;

  reduce() { return null; }
}

Bdd(feature)
  .scenario('The "debounce", "throttle", "fresh" and "sequential" configurations are not printed.')
  .given('An action that sets "debounce", an action that sets "throttle" and "removeThrottleLockOnError", an action that sets "fresh", and an action that sets "sequential".')
  .when('The actions are turned into strings.')
  .then('The configurations are not printed.')
  .run(async (_) => {
    expect(new WithDebounce().toString()).toBe('WithDebounce()');
    expect(new WithThrottle().toString()).toBe('WithThrottle()');
    expect(new WithFresh().toString()).toBe('WithFresh()');
    expect(new WithSequential().toString()).toBe('WithSequential()');
  });
