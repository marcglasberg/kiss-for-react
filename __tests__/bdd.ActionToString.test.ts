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
