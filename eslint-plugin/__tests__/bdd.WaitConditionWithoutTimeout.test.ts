import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/waitConditionWithoutTimeout';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: wait-condition-without-timeout');

const prelude = `import { createStore, KissAction, useDispatchWhen, useStore } from 'kiss-for-react';

class State {
  constructor(readonly price: number) {}
}

class BuyStock extends KissAction<State> {
  reduce() { return null; }
}

const store = createStore<State>({ initialState: new State(0) });
`;

Bdd(feature)
  .scenario('A wait for a condition without a timeout is reported outside tests.')
  .given('{Where}.')
  .when('It waits for a condition with timeoutMillis {Timeout}.')
  .then('There is a warning on the timeout.')
  .example(val('Where', 'The store\'s waitCondition'), val('Timeout', '0'), val('Code', `
export async function run() {
  await store.waitCondition((state) => state.price >= 100, { timeoutMillis: 0 });
}`))
  .example(val('Where', 'The store\'s dispatchWhen'), val('Timeout', '-1'), val('Code', `
store.dispatchWhen(new BuyStock(), (state) => state.price >= 100, { timeoutMillis: -1 });`))
  .example(val('Where', 'The function returned by useDispatchWhen'), val('Timeout', '0'), val('Code', `
export function useBuy() {
  const dispatchWhen = useDispatchWhen();
  return () => dispatchWhen(new BuyStock(), (state: State) => state.price >= 100, { timeoutMillis: 0 });
}`))
  .example(val('Where', 'The dispatchWhen of useStore()'), val('Timeout', '0'), val('Code', `
export function useBuy() {
  const s = useStore();
  return () => s.dispatchWhen(new BuyStock(), (state: State) => state.price >= 100, { timeoutMillis: 0 });
}`))
  .example(val('Where', 'An action\'s waitCondition'), val('Timeout', '0'), val('Code', `
class WaitForPrice extends KissAction<State> {
  async reduce() {
    await this.waitCondition((state) => state.price >= 100, { timeoutMillis: 0 });
    return null;
  }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      expect(result.messages.map((m) => m.text)).toEqual([`timeoutMillis: ${ctx.example.val('Timeout')}`]);
      expect(result.messages[0].message).toContain('without a timeout may never end');
      if (types) expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('A wait with a timeout is fine.')
  .given('The store\'s waitCondition and dispatchWhen.')
  .when('They wait with timeoutMillis 5000, or with a timeout from a variable.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
const timeoutMillis = 0;

export async function run() {
  await store.waitCondition((state) => state.price >= 100, { timeoutMillis: 5000 });
  store.dispatchWhen(new BuyStock(), (state) => state.price >= 100, { timeoutMillis });
}
`;
    for (const types of [true, false]) {
      expect(lint(rule, code, {types, filename: 'src/app.ts'}).messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Nothing is reported in tests.')
  .given('A waitCondition with timeoutMillis 0.')
  .when('The code is in a test file.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
export async function run() {
  await store.waitCondition((state) => state.price >= 100, { timeoutMillis: 0 });
}
`;
    expect(lint(rule, code, {filename: '__tests__/app.test.ts'}).messages).toEqual([]);
    expect(lint(rule, code, {filename: 'src/app.ts'}).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('With type information, other objects with a waitCondition method are not reported.')
  .given('An object that is not a Kiss store, with a waitCondition method.')
  .when('It is called with timeoutMillis 0.')
  .then('With type information, there is no warning.')
  .and('Without type information, there is a warning, since the timeoutMillis option is specific to Kiss.')
  .run(async (_) => {
    const code = `
const queue = {
  async waitCondition(condition: () => boolean, options: { timeoutMillis: number }) { return condition() && options; },
};

export async function run() {
  await queue.waitCondition(() => true, { timeoutMillis: 0 });
}
`;
    expect(lint(rule, code, {filename: 'src/app.ts'}).messages).toEqual([]);
    expect(lint(rule, code, {types: false, filename: 'src/app.ts'}).messages.length).toBe(1);
  });
