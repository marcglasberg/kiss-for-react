import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: dispatch-sync-async-action');

const rule = 'dispatch-sync-async-action';

const prelude = `import { KissAction, Store, useDispatchSync } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  add(n: number): State { return new State(this.count + n); }
}

declare function load(): Promise<number>;

const store = new Store<State>({ initialState: new State(0) });

class SyncAction extends KissAction<State> {
  reduce() { return this.state.add(1); }
}

class AsyncReduce extends KissAction<State> {
  async reduce() {
    const n = await load();
    return (state: State) => state.add(n);
  }
}

class AsyncBefore extends KissAction<State> {
  async before() { await load(); }
  reduce() { return this.state.add(1); }
}

class WithCheckInternet extends KissAction<State> {
  checkInternet = { dialog: true };
  reduce() { return this.state.add(1); }
}

class SubclassOfAsync extends AsyncBefore {
  reduce() { return this.state.add(2); }
}
`;

Bdd(feature)
  .scenario('dispatchSync of an async action is an error.')
  .given('An action that is async because {Reason}.')
  .when('It is dispatched with store.dispatchSync.')
  .then('There is an error, saying why the action is async.')
  .and('The suggestions replace dispatchSync with dispatch or dispatchAndWait.')
  .example(val('Reason', 'its reduce is async'), val('Action', 'AsyncReduce'), val('Message', '`reduce` returns a promise'), val('Type information', true))
  .example(val('Reason', 'its reduce is async'), val('Action', 'AsyncReduce'), val('Message', '`reduce` returns a promise'), val('Type information', false))
  .example(val('Reason', 'its before is async'), val('Action', 'AsyncBefore'), val('Message', '`before` returns a promise'), val('Type information', true))
  .example(val('Reason', 'its before is async'), val('Action', 'AsyncBefore'), val('Message', '`before` returns a promise'), val('Type information', false))
  .example(val('Reason', 'it sets checkInternet'), val('Action', 'WithCheckInternet'), val('Message', 'sets `checkInternet`'), val('Type information', true))
  .example(val('Reason', 'it sets checkInternet'), val('Action', 'WithCheckInternet'), val('Message', 'sets `checkInternet`'), val('Type information', false))
  .example(val('Reason', 'its superclass has an async before'), val('Action', 'SubclassOfAsync'), val('Message', '`before` returns a promise'), val('Type information', true))
  .example(val('Reason', 'its superclass has an async before'), val('Action', 'SubclassOfAsync'), val('Message', '`before` returns a promise'), val('Type information', false))
  .run(async (ctx) => {
    const action = ctx.example.val('Action') as string;
    const code = `${prelude}
store.dispatchSync(new ${action}());
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['store.dispatchSync']);
    expect(result.messages[0].message).toContain(`\`${action}\` is async`);
    expect(result.messages[0].message).toContain(ctx.example.val('Message') as string);
    expect(result.messages[0].suggestions).toEqual(['Replace with `dispatch`.', 'Replace with `dispatchAndWait`.']);
    expect(result.withSuggestion(0, 0)).toContain(`store.dispatch(new ${action}());`);
  });

Bdd(feature)
  .scenario('dispatchSync of a sync action is fine.')
  .given('A sync action.')
  .when('It is dispatched with store.dispatchSync.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `${prelude}
store.dispatchSync(new SyncAction());
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('The action can be in a variable, or dispatched with the function from useDispatchSync.')
  .given('An async action.')
  .when('It is dispatched {How}.')
  .then('There is an error.')
  .example(val('How', 'from a const variable'), val('Code', `
const action = new AsyncReduce();
store.dispatchSync(action);`))
  .example(val('How', 'with the function returned by useDispatchSync'), val('Code', `
export function Button() {
  const dispatchSync = useDispatchSync();
  return () => dispatchSync(new AsyncReduce());
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    expect(lint(rule, code).messages.length).toBe(1);
    expect(lint(rule, code, {types: false}).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('With type information, the action\'s type is enough to know it\'s async.')
  .given('A function that gets an action typed as an async action class, and dispatches it with dispatchSync.')
  .when('The code is linted.')
  .then('With type information, there is an error.')
  .and('Without type information, there is no error, since the action\'s class is unknown.')
  .run(async (_) => {
    const code = `${prelude}
export function run(action: AsyncReduce) {
  store.dispatchSync(action);
}
`;
    expect(lint(rule, code).messages.length).toBe(1);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An action typed only as KissAction is not reported.')
  .given('A function that gets an action typed as KissAction, and dispatches it with dispatchSync.')
  .when('The code is linted with type information.')
  .then('There are no errors, since the action could be sync.')
  .run(async (_) => {
    const code = `${prelude}
export function run(action: KissAction<State>) {
  store.dispatchSync(action);
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
