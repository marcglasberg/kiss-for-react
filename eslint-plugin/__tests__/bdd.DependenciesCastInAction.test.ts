import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/dependenciesCastInAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: dependencies-cast-in-action');

const message = (name: string, getter: string, type: string) =>
  `\`store.${name}\` is cast here. Declare a typed getter once, in your base action, like ` +
  `\`get ${getter}() { return this.store.${name} as ${type}; }\`, and use \`this.${getter}\` in all your actions.`;

const header = `import { KissAction } from 'kiss-for-react';
class State { constructor(readonly user: string) {} }
enum Environment { production, testing }
class Config { showAdminConsole = false; }
class Dependencies { async loadUser(id: number): Promise<string> { return 'Mary'; } }
`;

Bdd(feature)
  .scenario('Typed getters in the base action, used by the actions, are fine.')
  .given('A base action with typed getters that cast store.environment, store.dependencies and store.configuration.')
  .and('An action that uses the getters.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = header + `
export abstract class Action extends KissAction<State> {
  get env() { return this.store.environment as Environment; }
  get deps() { return this.store.dependencies as Dependencies; }
  get config() { return this.store.configuration as Config; }
}
export class LoadUser extends Action {
  constructor(readonly id: number) { super(); }
  async reduce() {
    if (this.env === Environment.testing && this.config.showAdminConsole) return null;
    const user = await this.deps.loadUser(this.id);
    return (state: State) => new State(user);
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A cast of store.environment, store.dependencies or store.configuration in an action is a warning.')
  .given('An action that casts one of them, with `as` or with the angle-bracket syntax.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning on the cast, which says to declare a typed getter in the base action.')
  .example(val('Type information', true), val('Cast', 'this.store.dependencies as Dependencies'), val('Name', 'dependencies'), val('Getter', 'deps'), val('Type', 'Dependencies'))
  .example(val('Type information', false), val('Cast', 'this.store.dependencies as Dependencies'), val('Name', 'dependencies'), val('Getter', 'deps'), val('Type', 'Dependencies'))
  .example(val('Type information', true), val('Cast', '<Dependencies>this.store.dependencies'), val('Name', 'dependencies'), val('Getter', 'deps'), val('Type', 'Dependencies'))
  .example(val('Type information', false), val('Cast', '<Dependencies>this.store.dependencies'), val('Name', 'dependencies'), val('Getter', 'deps'), val('Type', 'Dependencies'))
  .example(val('Type information', true), val('Cast', 'this.store.environment as Environment'), val('Name', 'environment'), val('Getter', 'env'), val('Type', 'Environment'))
  .example(val('Type information', false), val('Cast', 'this.store.environment as Environment'), val('Name', 'environment'), val('Getter', 'env'), val('Type', 'Environment'))
  .example(val('Type information', true), val('Cast', 'this.store.configuration as Config'), val('Name', 'configuration'), val('Getter', 'config'), val('Type', 'Config'))
  .example(val('Type information', false), val('Cast', 'this.store.configuration as Config'), val('Name', 'configuration'), val('Getter', 'config'), val('Type', 'Config'))
  .run(async (ctx) => {
    const cast = ctx.example.val('Cast') as string;
    const code = header + `
export class LoadUser extends KissAction<State> {
  async reduce() {
    const value = ${cast};
    console.log(value);
    return null;
  }
}
`;
    // A `.ts` file, since the angle-bracket cast syntax doesn't parse in `.tsx` files.
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean, filename: 'actions.ts'});
    expect(result.messages.map((m) => m.text)).toEqual([cast]);
    expect(result.messages[0].message).toBe(
      message(ctx.example.val('Name') as string, ctx.example.val('Getter') as string, ctx.example.val('Type') as string));
    expect(result.messages[0].suggestions).toEqual([]);
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('A chain of casts is one warning, on the whole chain.')
  .given('An action that casts store.dependencies to unknown, and then to the dependencies type.')
  .when('The code is linted.')
  .then('There is one warning, on the whole chain, which suggests the final type.')
  .run(async (_) => {
    const code = header + `
export class LoadUser extends KissAction<State> {
  async reduce() {
    const user = await (this.store.dependencies as unknown as Dependencies).loadUser(1);
    return (state: State) => new State(user);
  }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['this.store.dependencies as unknown as Dependencies']);
    expect(result.messages[0].message).toBe(message('dependencies', 'deps', 'Dependencies'));
  });

Bdd(feature)
  .scenario('A cast inside a callback of the action, or through a variable that holds the store, is a warning too.')
  .given('An action that casts store.dependencies inside an arrow function, and through a const that holds the store.')
  .when('The code is linted, with type information.')
  .then('There is a warning on each cast.')
  .run(async (_) => {
    const code = header + `
export class LoadUser extends KissAction<State> {
  async reduce() {
    const store = this.store;
    const load = () => (store.dependencies as Dependencies).loadUser(1);
    const user = await load();
    return (state: State) => new State(user);
  }
  after() {
    [1, 2].forEach(() => console.log(this.store.environment as Environment));
  }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual([
      'store.dependencies as Dependencies',
      'this.store.environment as Environment',
    ]);
  });

Bdd(feature)
  .scenario('Casts in a base action (an abstract class) are not reported.')
  .given('An abstract action that casts store.dependencies in a getter, and in a method.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = header + `
export abstract class Action extends KissAction<State> {
  get deps() { return this.store.dependencies as Dependencies; }
  loadUser(id: number) { return (this.store.dependencies as Dependencies).loadUser(id); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Casts outside actions, and casts of other members of the store, are not reported.')
  .given('A component and a function that cast store.dependencies, and an action that casts store.state and store.props.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = header + `
import { createStore, useStore } from 'kiss-for-react';
const store = createStore<State>({ initialState: new State(''), dependencies: () => new Dependencies() });
export function loadUser(id: number) { return (store.dependencies as Dependencies).loadUser(id); }
export function Admin() {
  const { store } = useStore();
  const config = store.configuration as Config;
  return config.showAdminConsole ? 'admin' : null;
}
export class LoadUser extends KissAction<State> {
  reduce() {
    const state = this.store.state as State;
    const props = this.store.props as Map<string, unknown>;
    console.log(state, props);
    return null;
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A cast of the dependencies of an object that is not a store is not reported.')
  .given('A class with its own `store` field, which is not a Kiss store, whose method casts this.store.dependencies.')
  .when('The code is linted, with type information.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = header + `
class Container { dependencies: unknown; }
export class Loader {
  store = new Container();
  reduce() { return this.store.dependencies as Dependencies; }
}
`;
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Not reported in tests.')
  .given('A test file with an action that casts store.dependencies.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = header + `
export class LoadUser extends KissAction<State> {
  async reduce() {
    const user = await (this.store.dependencies as Dependencies).loadUser(1);
    return (state: State) => new State(user);
  }
}
`;
    const result = lint(rule, code, {filename: 'actions.test.ts'});
    expect(result.messages).toEqual([]);
  });
