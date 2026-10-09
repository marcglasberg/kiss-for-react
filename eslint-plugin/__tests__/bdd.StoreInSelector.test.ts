import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/storeInSelector';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: store-in-selector');

const state = `
class State {
  constructor(readonly user: { name: string, id: string }, readonly items: readonly string[], readonly ready: boolean) {}
}

class LoadUser extends KissAction<State> {
  reduce() { return null; }
}
`;

Bdd(feature)
  .scenario('A selector that reads the state from useAllState is an error, fixed with its parameter.')
  .given('A component that gets the whole state with useAllState.')
  .and('A useSelect whose selector reads that state, instead of its parameter.')
  .when('The code is linted.')
  .then('There is an error in the variable.')
  .and('The fix replaces it with the parameter.')
  .and('The fixed code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { KissAction, useAllState, useSelect } from 'kiss-for-react';
${state}
export function UserName() {
  const all = useAllState<State>();
  const name = useSelect((s: State) => all.user.name);
  return <p>{name} {all.items.length}</p>;
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['all']);
    expect(result.messages[0].message).toContain('state of the last render');
    expect(result.fixed).toContain('const name = useSelect((s: State) => s.user.name);');
    if (types) expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A selector or condition that dispatches is an error.')
  .given('A component with {Where} that dispatches an action.')
  .when('The code is linted.')
  .then('There is an error in the dispatch.')
  .example(val('Where', 'a useSelect selector'),
    val('Code', 'const items = useSelect((s: State) => { dispatch(new LoadUser()); return s.items; });'),
    val('Dispatch', 'dispatch'))
  .example(val('Where', 'a useObject selector'),
    val('Code', 'const items = useObject((s: State) => { store.dispatch(new LoadUser()); return [s.items]; });'),
    val('Dispatch', 'store.dispatch'))
  .example(val('Where', 'a useDispatchWhen condition'),
    val('Code', 'const dispatchWhen = useDispatchWhen(); dispatchWhen(new LoadUser(), (s: State) => { dispatch(new LoadUser()); return s.ready; }, { timeoutMillis: 1000 });'),
    val('Dispatch', 'dispatch'))
  .run(async (ctx) => {
    const code = `import { KissAction, useDispatch, useDispatchWhen, useObject, useSelect, useStore } from 'kiss-for-react';
${state}
export function Items() {
  const dispatch = useDispatch();
  const store = useStore();
  ${ctx.example.val('Code')}
  return <p />;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Dispatch')]);
    expect(result.messages[0].message).toContain('must not dispatch actions');
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A selector that reads store.state is an error, fixed with its parameter.')
  .given('A store {Where}.')
  .and('A component with a useSelect whose selector reads store.state.')
  .when('The code is linted.')
  .then('There is an error in store.state, with type information or when the store is created in the same file.')
  .and('The fix replaces it with the parameter.')
  .example(val('Where', 'created in the same file'), val('Type information', true), val('Reported', true))
  .example(val('Where', 'created in the same file'), val('Type information', false), val('Reported', true))
  .example(val('Where', 'imported from another file'), val('Type information', true), val('Reported', true))
  .example(val('Where', 'imported from another file'), val('Type information', false), val('Reported', false))
  .run(async (ctx) => {
    const imported = (ctx.example.val('Where') as string).startsWith('imported');
    const storeCode = `export const store = createStore<State>({ initialState: new State({ name: 'Mary', id: '1' }, [], false) });`;
    const code = `import { createStore, KissAction, useSelect } from 'kiss-for-react';
${imported ? `import { store } from './store';` : storeCode}
${state}
export function UserName() {
  const name = useSelect((s: State) => store.state.user.name);
  return <p>{name}</p>;
}
`;
    const files = {
      'store.ts': `import { createStore } from 'kiss-for-react';
export class AppState { constructor(readonly user: { name: string }) {} }
export const store = createStore<AppState>({ initialState: new AppState({ name: 'Mary' }) });`,
    };
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean, files});
    if (ctx.example.val('Reported')) {
      expect(result.messages.map((m) => m.text)).toEqual(['store.state']);
      expect(result.messages[0].message).toContain('reads `store.state` instead of its parameter');
      expect(result.fixed).toContain('const name = useSelect((s: State) => s.user.name);');
    } else {
      expect(result.messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('A condition of waitCondition in an action that reads this.state is an error, fixed with its parameter.')
  .given('An action that waits with this.waitCondition, whose condition reads this.state.')
  .when('The code is linted.')
  .then('There is an error in this.state.')
  .and('The fix replaces it with the parameter.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { KissAction } from 'kiss-for-react';
${state}
export class WaitForUser extends KissAction<State> {
  async reduce() {
    await this.waitCondition((state) => this.state.ready, { timeoutMillis: 1000 });
    return null;
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['this.state']);
    expect(result.messages[0].message).toContain('This condition reads `this.state`');
    expect(result.fixed).toContain('await this.waitCondition((state) => state.ready, { timeoutMillis: 1000 });');
  });

Bdd(feature)
  .scenario('A selector or condition that reads a value selected by another selector is fine.')
  .given('A component that selects a value with useSelect.')
  .and('{Where} that reads that value.')
  .when('The code is linted.')
  .then('There are no errors, since using a selected value, like a prop, is a common and correct pattern.')
  .example(val('Where', 'A useSelect selector'), val('Type information', true))
  .example(val('Where', 'A useSelect selector'), val('Type information', false))
  .example(val('Where', 'A useDispatchWhen condition'), val('Type information', true))
  .example(val('Where', 'A useDispatchWhen condition'), val('Type information', false))
  .run(async (ctx) => {
    const code = (ctx.example.val('Where') as string).includes('useSelect')
      ? `import { KissAction, useSelect } from 'kiss-for-react';
${state}
export function Items() {
  const ready = useSelect((state: State) => state.ready);
  const count = useSelect((state: State) => ready ? state.items.length : 0);
  return <p>{count}</p>;
}
`
      : `import { KissAction, useDispatchWhen, useSelect } from 'kiss-for-react';
${state}
export function User() {
  // Waits until the user changes from the one shown now.
  const userId = useSelect((state: State) => state.user.id);
  const dispatchWhen = useDispatchWhen();
  return <button onClick={() => dispatchWhen(new LoadUser(), (s: State) => s.user.id !== userId, { timeoutMillis: 1000 })} />;
}
`;
    expect(lint(rule, code, {types: ctx.example.val('Type information') as boolean}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A selector that reads a variable with the whole state, from another selector, is an error.')
  .given('A component that gets the whole state with a useSelect whose selector returns its parameter.')
  .and('A useSelect whose selector reads that variable.')
  .when('The code is linted.')
  .then('There is an error in the variable, fixed with the parameter.')
  .run(async (_) => {
    const code = `import { KissAction, useSelect } from 'kiss-for-react';
${state}
export function UserName() {
  const all = useSelect((state: State) => state);
  const name = useSelect((s: State) => all.user.name);
  return <p>{name}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['all']);
    expect(result.fixed).toContain('const name = useSelect((s: State) => s.user.name);');
  });

Bdd(feature)
  .scenario('Selectors that only use their parameter, props and local values are fine.')
  .given('A component with selectors that use their parameter, a prop, and a local constant.')
  .and('A useSelect from another library, whose selector reads the whole state.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (_) => {
    const code = `import { KissAction, useAllState, useDispatch, useObject, useSelect } from 'kiss-for-react';
${state}
declare function useOtherSelect<T>(selector: (state: unknown) => T): T;

export function Item({ index }: { index: number }) {
  const all = useAllState<State>();
  const dispatch = useDispatch();
  const max = 10;
  const item = useSelect((state: State) => state.items[index]);
  const data = useObject((state: State) => ({ name: state.user.name, isLong: state.items.length > max }));
  const other = useOtherSelect(() => all.user);
  return <p onClick={() => dispatch(new LoadUser())}>{item} {data.name} {other.name}</p>;
}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A selector without a parameter is reported without a fix.')
  .given('A component with a useSelect whose selector has no parameter, and reads the state from useAllState.')
  .when('The code is linted.')
  .then('There is an error, but no fix.')
  .run(async (_) => {
    const code = `import { KissAction, useAllState, useSelect } from 'kiss-for-react';
${state}
export function UserName() {
  const all = useAllState<State>();
  const name = useSelect(() => all.user.name);
  return <p>{name}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['all']);
    expect(result.fixed).toBe(code);
  });
