import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/newValuesInUseObject';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: new-values-in-use-object');

const state = `
class Item {
  constructor(readonly text: string, readonly done: boolean) {}
}

class State {
  constructor(readonly name: string, readonly items: readonly Item[], readonly filter: string, readonly tags: readonly string[] | null) {}
}
`;

Bdd(feature)
  .scenario('A useObject selector that creates new values inside the object is a warning.')
  .given('A component with a useObject selector that returns {Value} inside the object.')
  .when('The code is linted.')
  .then('There is a warning in that value.')
  .example(val('Value', 'a filtered array'), val('Code', 'state.items.filter((i) => i.done)'), val('Kind', 'array or object'), val('Type information', true))
  .example(val('Value', 'a filtered array'), val('Code', 'state.items.filter((i) => i.done)'), val('Kind', 'array or object'), val('Type information', false))
  .example(val('Value', 'a mapped array'), val('Code', 'state.items.map((i) => i.text)'), val('Kind', 'array or object'), val('Type information', true))
  .example(val('Value', 'a copy of an object'), val('Code', '{ ...state.items[0] }'), val('Kind', 'object'), val('Type information', true))
  .example(val('Value', 'an array literal'), val('Code', '[state.name, state.filter]'), val('Kind', 'array'), val('Type information', false))
  .example(val('Value', 'a function'), val('Code', '() => state.name'), val('Kind', 'function'), val('Type information', true))
  .example(val('Value', 'a new empty array when null'), val('Code', 'state.tags ?? []'), val('Kind', 'array'), val('Type information', true))
  .example(val('Value', 'the keys of an object'), val('Code', 'Object.keys(state)'), val('Kind', 'array or object'), val('Type information', false))
  .run(async (ctx) => {
    const value = ctx.example.val('Code') as string;
    const code = `import { useObject } from 'kiss-for-react';
${state}
export function Items() {
  const data = useObject((state: State) => ({ name: state.name, value: ${value} }));
  return <p>{data.name}</p>;
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].message).toContain(`creates a new ${ctx.example.val('Kind')} each time the selector runs`);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('New values in a returned array, or in a const of the selector, are warnings too.')
  .given('A component with a useObject selector that {How}.')
  .when('The code is linted.')
  .then('There is a warning.')
  .example(val('How', 'returns an array with a filtered array'),
    val('Selector', '(state: State) => [state.name, state.items.filter((i) => i.done)]'), val('Text', 'state.items.filter((i) => i.done)'))
  .example(val('How', 'returns an object with a const that has a filtered array'),
    val('Selector', '(state: State) => { const done = state.items.filter((i) => i.done); return { done }; }'), val('Text', 'done'))
  .run(async (ctx) => {
    const code = `import { useObject } from 'kiss-for-react';
${state}
export function Items() {
  const data = useObject(${ctx.example.val('Selector')});
  return <p>{data.length}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Text')]);
  });

Bdd(feature)
  .scenario('New values inside a Map or a Set returned by the selector are warnings too.')
  .given('A component with a useObject selector that returns {How}.')
  .when('The code is linted.')
  .then('There is a warning in that value.')
  .example(val('How', 'a Map with a filtered array as a value'),
    val('Selector', `(state: State) => new Map<string, unknown>([['name', state.name], ['done', state.items.filter((i) => i.done)]])`),
    val('Text', 'state.items.filter((i) => i.done)'), val('Container', 'Map'))
  .example(val('How', 'a Map with a new object as a key'),
    val('Selector', `(state: State) => new Map([[{ id: 1 }, state.name]])`),
    val('Text', '{ id: 1 }'), val('Container', 'Map'))
  .example(val('How', 'a Set with a function'),
    val('Selector', '(state: State) => new Set([state.name, () => state.name])'),
    val('Text', '() => state.name'), val('Container', 'Set'))
  .example(val('How', 'a Set with an array literal'),
    val('Selector', '(state: State) => new Set([state.filter, [state.name]])'),
    val('Text', '[state.name]'), val('Container', 'Set'))
  .run(async (ctx) => {
    const code = `import { useObject } from 'kiss-for-react';
${state}
export function Items() {
  const data = useObject(${ctx.example.val('Selector')});
  return <p>{data.size}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Text')]);
    expect(result.messages[0].message).toContain(`inside the ${ctx.example.val('Container')} by identity`);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A useObject selector that returns a Map or a Set with parts of the state is fine.')
  .given('A component with useObject selectors that return a Map and a Set, with parts of the state and primitive values.')
  .and('A Set created from a mapped array, whose items are strings.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { useObject } from 'kiss-for-react';
${state}
export function Items() {
  const map = useObject((state: State) => new Map<string, unknown>([['items', state.items], ['count', state.items.length]]));
  const set = useObject((state: State) => new Set([state.name, state.filter]));
  const texts = useObject((state: State) => new Set(state.items.map((i) => i.text)));
  return <p>{map.size} {set.size} {texts.size}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A useObject selector that returns parts of the state, or primitive values, is fine.')
  .given('A component with useObject selectors that return parts of the state, and computed numbers, strings and booleans.')
  .and('A selector that returns a filtered array directly, which useObject compares item by item.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { useObject } from 'kiss-for-react';
${state}
export function Items() {
  const data = useObject((state: State) => ({
    items: state.items,
    filter: state.filter,
    count: state.items.filter((i) => i.done).length,
    title: state.name.toUpperCase(),
    hasTags: state.tags !== null,
    first: state.items.find((i) => i.done),
    tag: state.tags?.join(', '),
  }));
  const done = useObject((state: State) => state.items.filter((i) => i.done));
  return <p>{data.count} {done.length}</p>;
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, methods that return strings are not reported.')
  .given('A component with a useObject selector that returns state.name.slice(0, 3) inside the object.')
  .when('The code is linted.')
  .then('There are no warnings, with or without type information.')
  .and('With type information, state.items.slice(0, 3) is a warning.')
  .run(async (_) => {
    const code = (value: string) => `import { useObject } from 'kiss-for-react';
${state}
export function Items() {
  const data = useObject((state: State) => ({ value: ${value} }));
  return <p>{data.value.length}</p>;
}
`;
    expect(lint(rule, code('state.name.slice(0, 3)')).messages).toEqual([]);
    expect(lint(rule, code('state.name.slice(0, 3)'), {types: false}).messages).toEqual([]);
    expect(lint(rule, code('state.items.slice(0, 3)')).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('A useObject that does not come from Kiss is ignored.')
  .given('A component that uses a useObject from another library, with a selector that creates a new array.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${state}
declare function useObject<T>(selector: (state: State) => T): T;

export function Items() {
  const data = useObject((state: State) => ({ done: state.items.filter((i) => i.done) }));
  return <p>{data.done.length}</p>;
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
