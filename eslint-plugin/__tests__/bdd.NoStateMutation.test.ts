import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/noStateMutation';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: no-state-mutation');

const state = `class Item { constructor(readonly text: string, public done = false) {} }

class State {
  constructor(
    public items: Item[] = [],
    public count = 0,
    readonly tags: Set<string> = new Set(),
    readonly byId: Map<string, Item> = new Map(),
  ) {}
  add(n: number) { return new State(this.items, this.count + n, this.tags, this.byId); }
  set(count: number) { return new State(this.items, count, this.tags, this.byId); }
}
`;

const ASSIGNMENT = 'This changes the state in place. Kiss compares states by identity, so the components don\'t re-render, ' +
  'and the change isn\'t persisted. Create a new state instead.';

Bdd(feature)
  .scenario('Changing this.state in place in an action is an error.')
  .given('An action whose reducer changes this.state in place.')
  .when('The code is linted, with or without type information.')
  .then('There is an error.')
  .example(val('Type information', true), val('Code', 'this.state.count = 5;'), val('Error', 'this.state.count'))
  .example(val('Type information', false), val('Code', 'this.state.count += 5;'), val('Error', 'this.state.count'))
  .example(val('Type information', true), val('Code', 'this.state.count++;'), val('Error', 'this.state.count++'))
  .example(val('Type information', false), val('Code', 'this.state.items[0].done = true;'), val('Error', 'this.state.items[0].done'))
  .example(val('Type information', true), val('Code', 'delete (this.state as any).count;'), val('Error', 'delete (this.state as any).count'))
  .example(val('Type information', false), val('Code', 'Object.assign(this.state, { count: 1 });'), val('Error', 'Object.assign(this.state, { count: 1 })'))
  .example(val('Type information', true), val('Code', 'this.state.items.push(new Item(\'a\'));'), val('Error', 'this.state.items.push'))
  .example(val('Type information', false), val('Code', 'this.state.items.splice(0, 1);'), val('Error', 'this.state.items.splice'))
  .example(val('Type information', true), val('Code', 'this.state.tags.add(\'a\');'), val('Error', 'this.state.tags.add'))
  .example(val('Type information', true), val('Code', 'this.state.byId.delete(\'a\');'), val('Error', 'this.state.byId.delete'))
  .example(val('Type information', true), val('Code', 'this.initialState.items.pop();'), val('Error', 'this.initialState.items.pop'))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `/// <reference lib="es2023.array" />
import { KissAction } from 'kiss-for-react';
${state}
export class Change extends KissAction<State> {
  reduce() {
    ${ctx.example.val('Code')}
    return this.state;
  }
}
`;
    const result = lint(rule, code, {types});
    if (types) expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Error')]);
    if (!/\.(push|splice|add|delete|pop)$/.test(ctx.example.val('Error') as string)) expect(result.messages[0].message).toBe(ASSIGNMENT);
  });

Bdd(feature)
  .scenario('The message of a mutating method names it, and suggests the method that returns a new array.')
  .given('A selector that sorts the state array in place, and uses the result.')
  .when('The code is linted with type information.')
  .then('There is an error that says to use toSorted.')
  .and('The suggestion replaces sort with toSorted.')
  .run(async (_) => {
    const code = `/// <reference lib="es2023.array" />
import { useSelect } from 'kiss-for-react';
${state}
export function Items() {
  const items = useSelect((state: State) => state.items.sort((a, b) => a.text.localeCompare(b.text)));
  return items.length;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['state.items.sort']);
    expect(result.messages[0].message).toBe(
      '`sort` changes the state in place. Kiss compares states by identity, so the components don\'t re-render, ' +
      'and the change isn\'t persisted. Create a new state instead, for example with `toSorted`.');
    expect(result.messages[0].suggestions).toEqual(['Use `toSorted`, which returns a new array.']);
    expect(result.withSuggestion(0, 0)).toContain('state.items.toSorted((a, b) => a.text.localeCompare(b.text))');
  });

Bdd(feature)
  .scenario('Changing the state parameter of selectors, conditions and update functions is an error.')
  .given('A function that gets the state, and changes it in place.')
  .when('The code is linted, with or without type information.')
  .then('There is an error.')
  .example(val('Type information', true), val('Code', 'useSelect((state: State) => state.items.reverse())'))
  .example(val('Type information', false), val('Code', 'useObject((state: State) => ({ items: state.items.sort() }))'))
  .example(val('Type information', true), val('Code', 'store.waitCondition((state) => { state.count = 1; return true; }, { timeoutMillis: 100 })'))
  .example(val('Type information', false), val('Code', 'store.dispatchWhen(new Increment(), (state) => state.items.push(new Item(\'a\')) > 0, { timeoutMillis: 100 })'))
  .example(val('Type information', true), val('Code', 'dispatchWhen(new Increment(), (state: State) => { state.count++; return true; }, { timeoutMillis: 100 })'))
  .example(val('Type information', false), val('Code', 'store.dispatch(new UpdateStateAction((state: State) => { state.count = 0; return state; }))'))
  .example(val('Type information', true), val('Code', 'useSelect(({ items }: State) => items.pop())'))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `/// <reference lib="es2023.array" />
import { createStore, KissAction, UpdateStateAction, useDispatchWhen, useObject, useSelect } from 'kiss-for-react';
${state}
class Increment extends KissAction<State> {
  reduce() { return this.state.add(1); }
}

const store = createStore<State>({ initialState: new State() });

export function Items() {
  const dispatchWhen = useDispatchWhen();
  return ${ctx.example.val('Code')};
}
`;
    const result = lint(rule, code, {types});
    if (types) expect(result.typeErrors).toEqual([]);
    expect(result.messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('Changing the state parameter of the function returned by an async reducer is an error.')
  .given('An async reducer that returns a function that changes its state parameter.')
  .when('The code is linted, with or without type information.')
  .then('There is an error.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `/// <reference lib="es2023.array" />
import { KissAction } from 'kiss-for-react';
${state}
export class AddItem extends KissAction<State> {
  async reduce() {
    const item = await Promise.resolve(new Item('a'));
    return (state: State) => {
      state.items.push(item);
      return state;
    };
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['state.items.push']);
  });

Bdd(feature)
  .scenario('With type information, variables that hold parts of the state are followed.')
  .given('An action that reads parts of the state into variables, and changes them.')
  .when('The code is linted with and without type information.')
  .then('With type information, there is an error.')
  .and('Without type information, there is no error.')
  .example(val('Code', 'const items = this.state.items; items.push(new Item(\'a\'));'))
  .example(val('Code', 'const { items } = this.state; items.length = 0;'))
  .example(val('Code', 'for (const item of this.state.items) item.done = true;'))
  .example(val('Code', 'this.state.items.forEach((item) => { item.done = true; });'))
  .example(val('Code', 'const item = this.state.byId.get(\'a\'); if (item) item.done = true;'))
  .example(val('Code', 'this.state.items.at(0)!.done = true;'))
  .run(async (ctx) => {
    const code = `/// <reference lib="es2023.array" />
import { KissAction } from 'kiss-for-react';
${state}
export class Change extends KissAction<State> {
  reduce() {
    ${ctx.example.val('Code')}
    return null;
  }
}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].message).toContain('changes the state in place.');
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Changing the state from useAllState, or from useSelect, in a component is an error.')
  .given('A component that changes the state it got from useAllState or useSelect.')
  .when('The code is linted, with or without type information.')
  .then('There is an error.')
  .example(val('Type information', true), val('Hook', 'const state = useAllState<State>();'), val('Code', 'state.items.push(new Item(text))'))
  .example(val('Type information', false), val('Hook', 'const items = useSelect((state: State) => state.items);'), val('Code', 'items.push(new Item(text))'))
  .run(async (ctx) => {
    const code = `/// <reference lib="es2023.array" />
import { useAllState, useSelect } from 'kiss-for-react';
${state}
export function AddItem({ text }: { text: string }) {
  ${ctx.example.val('Hook')}
  return <button onClick={() => ${ctx.example.val('Code')}}>Add</button>;
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([`${(ctx.example.val('Code') as string).split('(')[0]}`]);
  });

Bdd(feature)
  .scenario('With type information, changing store.state is an error.')
  .given('A function that pushes to store.state.items.')
  .when('The code is linted with type information.')
  .then('There is an error.')
  .run(async (_) => {
    const code = `/// <reference lib="es2023.array" />
import { createStore } from 'kiss-for-react';
${state}
const store = createStore<State>({ initialState: new State() });
export function addItem(text: string) {
  store.state.items.push(new Item(text));
}
`;
    expect(lint(rule, code).messages.map((m) => m.text)).toEqual(['store.state.items.push']);
  });

Bdd(feature)
  .scenario('Creating a new state, and changing new objects, is fine.')
  .given('An action that creates new arrays and objects, changes them, and returns a new state.')
  .and('It calls methods of the state class named add and set, which return a new state.')
  .and('It sorts a copy of the state array.')
  .when('The code is linted, with or without type information.')
  .then('There are no errors.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `/// <reference lib="es2023.array" />
import { KissAction, useSelect } from 'kiss-for-react';
${state}
export class AddItem extends KissAction<State> {
  constructor(readonly text: string) { super(); }
  private cache: Item[] = [];
  reduce() {
    const items = [...this.state.items, new Item(this.text)];
    items.sort((a, b) => a.text.localeCompare(b.text));
    const copy = this.state.items.slice();
    copy.reverse();
    this.cache.push(new Item('b'));
    const sorted = this.state.items.toSorted((a, b) => a.text.localeCompare(b.text));
    let s = this.state;
    s = s.add(1).set(2);
    return new State(items, s.count + sorted.length, this.state.tags, this.state.byId);
  }
}

export function Count() {
  return useSelect((state: State) => state.items.filter((i) => i.done).sort().length);
}
`;
    const types = ctx.example.val('Type information') as boolean;
    const result = lint(rule, code, {types});
    if (types) expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, methods of classes that are not arrays, maps or sets are fine.')
  .given('A state class with a list class, whose push and sort methods return a new list.')
  .and('An action that calls them on the state.')
  .when('The code is linted with type information.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `/// <reference lib="es2023.array" />
import { KissAction } from 'kiss-for-react';

class TodoList {
  constructor(readonly items: readonly string[] = []) {}
  push(item: string) { return new TodoList([...this.items, item]); }
  sort() { return new TodoList(this.items.toSorted()); }
}

class State {
  constructor(readonly todos: TodoList = new TodoList()) {}
}

export class AddTodo extends KissAction<State> {
  reduce() { return new State(this.state.todos.push('a').sort()); }
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('this.state outside actions is not reported.')
  .given('A class that is not an action, which changes its own state field.')
  .when('The code is linted.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `class Counter {
  state = { count: 0, items: [] as string[] };
  increment() {
    this.state.count++;
    this.state.items.push('a');
  }
}
export const counter = new Counter();
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, the methods of maps and sets are not reported.')
  .given('An action that calls add on a set of the state, and add on the state itself.')
  .when('The code is linted with and without type information.')
  .then('With type information, only the add of the set is an error.')
  .and('Without type information, there are no errors, since add may be a method that returns a new state.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { KissAction } from 'kiss-for-react';
${state}
export class Change extends KissAction<State> {
  reduce() {
    this.state.tags.add('a');
    return this.state.add(1);
  }
}
`;
    expect(lint(rule, code, {types}).messages.map((m) => m.text)).toEqual(types ? ['this.state.tags.add'] : []);
  });
