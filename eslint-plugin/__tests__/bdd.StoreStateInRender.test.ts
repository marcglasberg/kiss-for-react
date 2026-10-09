import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/storeStateInRender';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: store-state-in-render');

const files = {
  'state.ts': `export class User {
  constructor(readonly name: string) {}
}

export class State {
  constructor(readonly user: User, readonly items: readonly string[]) {}
}`,
  'store.ts': `import { createStore } from 'kiss-for-react';
import { State, User } from './state';

export const store = createStore<State>({ initialState: new State(new User('Mary'), []) });`,
};

Bdd(feature)
  .scenario('Reading the state of an imported store while rendering is a warning, with a suggestion to use useSelect.')
  .given('A component that reads store.state.user.name in its body, from a store imported from another file.')
  .and('The file {Imports} the State class.')
  .when('The code is linted with type information.')
  .then('There is a warning in store.state.')
  .and('The suggestion replaces the read with useSelect, typing the state parameter.')
  .and('The code with the suggestion compiles.')
  .example(val('Imports', 'imports'), val('Type', 'State'))
  .example(val('Imports', 'does not import'), val('Type', 'typeof store.state'))
  .run(async (ctx) => {
    const imports = ctx.example.val('Imports') === 'imports';
    const code = `${imports ? `import { State } from './state';\n` : ''}import { store } from './store';

export function UserName() {
  const name = store.state.user.name;
  return <p>{name}</p>;
}
`;
    const result = lint(rule, code, {files});
    expect(result.messages.map((m) => m.text)).toEqual(['store.state']);
    expect(result.messages[0].message).toContain('doesn\'t re-render when the state changes');
    const type = ctx.example.val('Type') as string;
    expect(result.messages[0].suggestions).toEqual([`Replace with \`useSelect((state: ${type}) => state.user.name)\`.`]);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`import { useSelect } from 'kiss-for-react';`);
    expect(suggested).toContain(`const name = useSelect((state: ${type}) => state.user.name);`);
    expect(lint(rule, suggested, {files}).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, only stores known in the same file are recognized.')
  .given('A component that reads store.state, from a store {Where}.')
  .when('The code is linted without type information.')
  .then('There is a warning only if the store is created in the same file.')
  .and('The suggestion takes the state type from the createStore type argument.')
  .example(val('Where', 'created in the same file'), val('Reported', true))
  .example(val('Where', 'imported from another file'), val('Reported', false))
  .run(async (ctx) => {
    const sameFile = ctx.example.val('Reported') as boolean;
    const code = `import { createStore, useSelect } from 'kiss-for-react';
import { State, User } from './state';
${sameFile ? `const store = createStore<State>({ initialState: new State(new User('Mary'), []) });` : `import { store } from './store';`}

export function Items() {
  const count = useSelect((state: State) => state.items.length);
  return <p>{count} {store.state.items.join(', ')}</p>;
}
`;
    const result = lint(rule, code, {types: false, files});
    if (sameFile) {
      expect(result.messages.map((m) => m.text)).toEqual(['store.state']);
      expect(result.withSuggestion(0, 0)).toContain('{useSelect((state: State) => state.items).join(\', \')}');
    } else {
      expect(result.messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Reading store.state in event handlers and effects is fine.')
  .given('A component that reads store.state in an event handler, an effect, and the onMount option of useDispatch.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { Store, useDispatch } from 'kiss-for-react';
import { useEffect } from 'react';
import { State } from './state';
import { store } from './store';

export function UserName() {
  useDispatch({ onMount: (s: Store<State>) => console.log(s.state.user.name) });
  useEffect(() => { console.log(store.state.user.name); }, []);
  return <button onClick={() => console.log(store.state.items)} />;
}
`;
    const result = lint(rule, code, {files});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('There is no suggestion when the read doesn\'t run on every render.')
  .given('A component that reads store.state {Where}.')
  .when('The code is linted.')
  .then('There is a warning, but no suggestion, since a hook can\'t be called there.')
  .example(val('Where', 'inside an if'), val('Code', 'if (props.show) console.log(store.state.user.name);'))
  .example(val('Where', 'in the right side of &&'), val('Code', 'const name = props.show && store.state.user.name;'))
  .example(val('Where', 'after an early return'), val('Code', 'if (!props.show) return null;\n  const name = store.state.user.name;'))
  .example(val('Where', 'reading the whole state'), val('Code', 'const state = store.state;'))
  .run(async (ctx) => {
    const code = `import { store } from './store';

export function UserName(props: { show: boolean }) {
  ${ctx.example.val('Code')}
  return <p />;
}
`;
    const result = lint(rule, code, {files});
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('The store of useStore is a store too.')
  .given('A component that reads useStore().store.state in its body.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning.')
  .run(async (_) => {
    const code = `import { useStore } from 'kiss-for-react';

export function UserName() {
  const kiss = useStore();
  return <p>{kiss.store.state.user.name}</p>;
}
`;
    expect(lint(rule, code, {files}).messages.map((m) => m.text)).toEqual(['kiss.store.state']);
    expect(lint(rule, code, {files, types: false}).messages.map((m) => m.text)).toEqual(['kiss.store.state']);
  });
