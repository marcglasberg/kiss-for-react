import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/errorObserverWithoutEnvironment';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: error-observer-without-environment');

const message =
  'The store has an `errorObserver`, but no `environment`. Pass the `environment` too, so that the observer can ' +
  'handle the errors differently in production, staging and tests (for example, sending them to a monitoring ' +
  'service only in production).';

const header = `import { createStore, Store } from 'kiss-for-react';
class State { constructor(readonly count: number) {} }
enum Environment { production, testing }
const observer = ({ error }: { error: any }) => error;
`;

Bdd(feature)
  .scenario('A store with an errorObserver and an environment is fine, and so is a store without an errorObserver.')
  .given('A store created with an errorObserver and an environment, and a store created with neither.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = header + `
export const store1 = createStore<State>({
  initialState: new State(0),
  environment: Environment.production,
  errorObserver: ({ error, store }) => {
    if (store.environment === Environment.production) console.log(error);
    return error;
  },
});
export const store2 = new Store<State>({ initialState: new State(0), errorObserver: observer, environment: Environment.testing });
export const store3 = createStore<State>({ initialState: new State(0) });
export const store4 = createStore<State>({ initialState: new State(0), environment: Environment.testing });
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A store with an errorObserver but no environment is a warning.')
  .given('A store created with an errorObserver, and no environment, with createStore or new Store.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning on the errorObserver, which says to pass the environment too.')
  .example(val('Type information', true), val('Creation', 'createStore<State>'))
  .example(val('Type information', false), val('Creation', 'createStore<State>'))
  .example(val('Type information', true), val('Creation', 'new Store<State>'))
  .example(val('Type information', false), val('Creation', 'new Store<State>'))
  .run(async (ctx) => {
    const code = header + `
export const store = ${ctx.example.val('Creation')}({
  initialState: new State(0),
  errorObserver: ({ error }) => {
    console.log(error);
    return error;
  },
});
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['errorObserver']);
    expect(result.messages[0].message).toBe(message);
    expect(result.messages[0].suggestions).toEqual([]);
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('An errorObserver given as a shorthand property, or as a method, is a warning too.')
  .given('A store created with `errorObserver` as a shorthand property, and another with it as a method, without an environment.')
  .when('The code is linted.')
  .then('There is a warning on each.')
  .run(async (_) => {
    const code = header + `
export const store1 = createStore<State>({ initialState: new State(0), errorObserver: observer });
export const store2 = createStore<State>({
  initialState: new State(0),
  errorObserver({ error }) { return error; },
});
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => [m.line, m.text])).toEqual([[6, 'errorObserver'], [9, 'errorObserver']]);
  });

Bdd(feature)
  .scenario('Not reported when the options are spread from another object, since the environment may be in it.')
  .given('A store created with options spread from a variable, and an errorObserver.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = header + `
const options = { initialState: new State(0), environment: Environment.production };
export const store = createStore<State>({ ...options, errorObserver: observer });
`;
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Not reported in tests, nor for other objects with an errorObserver.')
  .given('A test file that creates a store with an errorObserver and no environment.')
  .and('A file where an object that is not a store has an errorObserver.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = header + `
export const store = createStore<State>({ initialState: new State(0), errorObserver: observer });
`;
    expect(lint(rule, code, {filename: '__tests__/store.test.ts'}).messages).toEqual([]);

    const other = header + `
function configure(options: { errorObserver: unknown }) { return options; }
export const config = configure({ errorObserver: observer });
export const plain = { initialState: new State(0), errorObserver: observer };
`;
    expect(lint(rule, other).messages).toEqual([]);
  });
