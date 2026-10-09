import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/avoidUseAllState';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: avoid-use-all-state');

const state = `
class User {
  constructor(readonly name: string, readonly age: number) {}
}

class State {
  constructor(readonly user: User, readonly items: readonly string[]) {}
}
`;

Bdd(feature)
  .scenario('useAllState is a warning, fixed with one useSelect for each path the component reads.')
  .given('A component that gets the whole state with useAllState.')
  .and('It reads state.user.name, state.user.age (twice) and state.items.')
  .when('The code is linted.')
  .then('There is a warning in useAllState.')
  .and('The fix replaces it with one useSelect for each path, named after the path.')
  .and('The fix replaces useAllState with useSelect in the import, since it is no longer used.')
  .and('The fixed code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { useAllState } from 'kiss-for-react';
${state}
export function UserCard() {
  const state = useAllState<State>();
  const label = state.user.name + ' (' + state.user.age + ')';
  return <p title={label}>{state.items.join(', ')} {state.user.age}</p>;
}
`;
    const result = lint(rule, code, {types});

    expect(result.messages.map((m) => m.text)).toEqual(['useAllState']);
    expect(result.messages[0].message).toContain('re-renders the component on every state change');
    expect(result.fixed).toBe(`import { useSelect } from 'kiss-for-react';
${state}
export function UserCard() {
  const userName = useSelect((state: State) => state.user.name);
  const userAge = useSelect((state: State) => state.user.age);
  const items = useSelect((state: State) => state.items);
  const label = userName + ' (' + userAge + ')';
  return <p title={label}>{items.join(', ')} {userAge}</p>;
}
`);
    if (types) expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A useSelect that selects the whole state is a warning too.')
  .given('A component that uses {Hook} with a selector that returns the state itself.')
  .when('The code is linted.')
  .then('There is a warning, saying it selects the whole state.')
  .and('The fix replaces it with one useSelect for each path, and keeps the import.')
  .example(val('Hook', 'useSelect'))
  .example(val('Hook', 'useSelector'))
  .run(async (ctx) => {
    const hook = ctx.example.val('Hook') as string;
    const code = `import { ${hook} } from 'kiss-for-react';
${state}
export function UserName() {
  const all = ${hook}((s: State) => s);
  return <p>{all.user.name}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual([hook]);
    expect(result.messages[0].message).toContain('selects the whole state');
    expect(result.fixed).toContain(`import { ${hook}${hook === 'useSelect' ? '' : ', useSelect'} } from 'kiss-for-react';`);
    expect(result.fixed).toContain('  const userName = useSelect((state: State) => state.user.name);\n  return <p>{userName}</p>;');
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Destructuring the state is fixed with one useSelect for each property.')
  .given('A component that destructures user and items from useAllState.')
  .when('The code is linted and fixed.')
  .then('Each property gets its own useSelect, with the same variable name.')
  .and('The fixed code compiles.')
  .run(async (_) => {
    const code = `import { useAllState, useSelect } from 'kiss-for-react';
${state}
export function UserCard() {
  const { user, items: list } = useAllState<State>();
  const age = useSelect((state: State) => state.user.age);
  return <p>{user.name} {list.length} {age}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.fixed).toContain(`import { useSelect } from 'kiss-for-react';`);
    expect(result.fixed).toContain(
      '  const user = useSelect((state: State) => state.user);\n' +
      '  const list = useSelect((state: State) => state.items);\n');
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('There is no fix when the component uses the whole state.')
  .given('A component that uses useAllState, and {Use}.')
  .when('The code is linted.')
  .then('There is a warning, but no fix.')
  .example(val('Use', 'passes the state to a function'), val('Code', 'console.log(state);'))
  .example(val('Use', 'reads a property with brackets'), val('Code', `console.log(state['user']);`))
  .example(val('Use', 'already has a variable with the name of a path'), val('Code', 'const userName = 1; console.log(userName);'))
  .example(val('Use', 'calls a method of the state'), val('Code', 'console.log(state.toString());'))
  .run(async (ctx) => {
    const code = `import { useAllState } from 'kiss-for-react';
${state}
export function UserCard() {
  const state = useAllState<State>();
  ${ctx.example.val('Code')}
  return <p>{state.user.name}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('The fix gets the state type from the code.')
  .given('A component that uses useAllState, with the state type {Where}.')
  .when('The code is linted and fixed.')
  .then('The fix uses the state type in the selectors.')
  .example(val('Where', 'as a type argument'), val('Code', 'const state = useAllState<State>();'), val('Fixed', true))
  .example(val('Where', 'in the type of the variable'), val('Code', 'const state: State = useAllState();'), val('Fixed', true))
  .example(val('Where', 'only in a cast (there is no fix)'), val('Code', 'const state = useAllState() as State;'), val('Fixed', false))
  .run(async (ctx) => {
    const code = `import { useAllState } from 'kiss-for-react';
${state}
export function UserCard() {
  ${ctx.example.val('Code')}
  return <p>{state.user.name}</p>;
}
`;
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    if (ctx.example.val('Fixed')) {
      expect(result.fixed).toContain('const userName = useSelect((state: State) => state.user.name);');
      expect(lint(rule, result.fixed).typeErrors).toEqual([]);
    } else {
      expect(result.fixed).toBe(code);
    }
  });

Bdd(feature)
  .scenario('A state that is a number is not reported, with type information.')
  .given('A component that uses useAllState of a store whose state is a number.')
  .when('The code is linted.')
  .then('With type information, there is no warning, since the component needs the whole state.')
  .and('Without type information, there is a warning.')
  .run(async (_) => {
    const code = `import { useAllState } from 'kiss-for-react';

export function Counter() {
  const count = useAllState<number>();
  return <p>{count}</p>;
}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('useAllState is not reported in tests, or when it does not come from Kiss.')
  .given('A {Where}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Where', 'test file that uses useAllState'), val('File', '__tests__/UserCard.test.tsx'),
    val('Import', `import { useAllState } from 'kiss-for-react';`))
  .example(val('Where', 'component that uses a useAllState from another library'), val('File', 'file.tsx'),
    val('Import', 'declare function useAllState<T>(): T;'))
  .run(async (ctx) => {
    const code = `${ctx.example.val('Import')}
${state}
export function UserCard() {
  const state = useAllState<State>();
  return <p>{state.user.name}</p>;
}
`;
    expect(lint(rule, code, {filename: ctx.example.val('File') as string}).messages).toEqual([]);
  });
