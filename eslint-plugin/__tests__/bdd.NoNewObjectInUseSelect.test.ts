import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: no-new-object-in-use-select');

const rule = 'no-new-object-in-use-select';

const state = `
class State {
  constructor(readonly name: string, readonly age: number) {}
}
`;

Bdd(feature)
  .scenario('A useSelect whose selector returns a new object is an error, fixed with useObject.')
  .given('A component that uses useSelect with a selector that returns a new object.')
  .when('The code is linted.')
  .then('There is an error in useSelect.')
  .and('The fix replaces useSelect with useObject, and adds useObject to the import.')
  .and('The fixed code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { useSelect } from 'kiss-for-react';
${state}
export function User() {
  const name = useSelect((state: State) => state.name);
  const user = useSelect((state: State) => ({ name: state.name, age: state.age }));
  return name + user.age;
}
`;
    const result = lint(rule, code, {types});

    expect(result.messages.map((m) => m.text)).toEqual(['useSelect']);
    expect(result.messages[0].message).toContain('new object');
    expect(result.fixed).toContain(`import { useSelect, useObject } from 'kiss-for-react';`);
    expect(result.fixed).toContain('const user = useObject((state: State) => ({ name: state.name, age: state.age }));');
    if (types) expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('If it was the only use of useSelect, the fix replaces it with useObject in the import too.')
  .given('A component that uses useSelect only once, with a selector that returns a new object.')
  .when('The code is linted and fixed.')
  .then('The import has useObject instead of useSelect.')
  .run(async (_) => {
    const code = `import { KissAction, useSelect } from 'kiss-for-react';
${state}
export function User() {
  return useSelect((state: State) => ({ name: state.name })).name;
}
`;
    const result = lint(rule, code);
    expect(result.fixed).toContain(`import { KissAction, useObject } from 'kiss-for-react';`);
    expect(result.fixed).toContain('return useObject((state: State) => ({ name: state.name })).name;');
  });

Bdd(feature)
  .scenario('Selectors that return a new array, or return a new object from a block, are also errors.')
  .given('A component that uses useSelect or useSelector with a selector that returns a new array or object.')
  .when('The code is linted.')
  .then('There is an error.')
  .example(val('Selector', '(state: State) => [state.name, state.age]'), val('Hook', 'useSelect'))
  .example(val('Selector', '(state: State) => { return { name: state.name }; }'), val('Hook', 'useSelect'))
  .example(val('Selector', '(state: State) => ({ name: state.name }) as { name: string }'), val('Hook', 'useSelect'))
  .example(val('Selector', 'function (state: State) { return [state.name]; }'), val('Hook', 'useSelect'))
  .example(val('Selector', '(state: State) => ({ name: state.name })'), val('Hook', 'useSelector'))
  .run(async (ctx) => {
    const hook = ctx.example.val('Hook') as string;
    const code = `import { ${hook} } from 'kiss-for-react';
${state}
export function User() {
  const user = ${hook}(${ctx.example.val('Selector')});
  return user;
}
`;
    expect(lint(rule, code).messages.map((m) => m.text)).toEqual([hook]);
  });

Bdd(feature)
  .scenario('A useSelect that returns a part of the state is fine.')
  .given('A component that uses useSelect with selectors that return parts of the state.')
  .when('The code is linted.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `import { useSelect } from 'kiss-for-react';
${state}
export function User() {
  const name = useSelect((state: State) => state.name);
  const age = useSelect((state: State) => state.age);
  return name + age;
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A useSelect that does not come from Kiss is ignored.')
  .given('A component that uses a useSelect from another library, with a selector that returns a new object.')
  .when('The code is linted.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `
${state}
function useSelect<T>(selector: (state: State) => T): T { return selector(new State('a', 1)); }

export function User() {
  return useSelect((state: State) => ({ name: state.name }));
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('If useObject is already imported, the fix uses it.')
  .given('A component that imports both useSelect and useObject (as "useObj").')
  .and('It uses useSelect with a selector that returns a new object.')
  .when('The code is linted and fixed.')
  .then('The fix replaces useSelect with useObj, and doesn\'t change the import.')
  .run(async (_) => {
    const code = `import { useSelect, useObject as useObj } from 'kiss-for-react';
${state}
export function User() {
  const age = useSelect((state: State) => state.age);
  const user = useSelect((state: State) => ({ name: state.name, age: state.age }));
  return useObj((state: State) => [state.name]).length + user.age + age;
}
`;
    const result = lint(rule, code);
    expect(result.fixed).toContain(`import { useSelect, useObject as useObj } from 'kiss-for-react';`);
    expect(result.fixed).toContain('const user = useObj((state: State) => ({ name: state.name, age: state.age }));');
  });

Bdd(feature)
  .scenario('With a namespace import, the fix uses the namespace.')
  .given('A component that imports Kiss as a namespace, and uses kiss.useSelect with a selector that returns a new object.')
  .when('The code is linted and fixed.')
  .then('The fix replaces kiss.useSelect with kiss.useObject.')
  .run(async (_) => {
    const code = `import * as kiss from 'kiss-for-react';
${state}
export function User() {
  return kiss.useSelect((state: State) => ({ name: state.name }));
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['kiss.useSelect']);
    expect(result.fixed).toContain('return kiss.useObject((state: State) => ({ name: state.name }));');
  });

Bdd(feature)
  .scenario('If the name useObject is already used for something else, there is no fix.')
  .given('A file with its own function called useObject.')
  .and('A component that uses useSelect with a selector that returns a new object.')
  .when('The code is linted.')
  .then('There is an error, but no fix.')
  .run(async (_) => {
    const code = `import { useSelect } from 'kiss-for-react';
${state}
function useObject() { return 1; }

export function User() {
  return useSelect((state: State) => ({ name: state.name })).name + useObject();
}
`;
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.fixed).toBe(code);
  });
