import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/throwInGlobalWrapError';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: throw-in-global-wrap-error');

const prelude = `import { createStore, Store, UserException } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
}

class NetworkError extends Error {}
`;

Bdd(feature)
  .scenario('A throw in globalWrapError is reported, and fixed by returning the error.')
  .given('A store whose globalWrapError {How}.')
  .when('The code is linted.')
  .then('The throw is reported.')
  .and('The fix changes throw to return, and the fixed code compiles.')
  .example(
    val('How', 'is an arrow function given to createStore'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  globalWrapError: (error: any) => {
    if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);
    return error;
  },
});
`),
    val('Fixed', `if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error);`),
  )
  .example(
    val('How', 'is a method given to new Store'),
    val('Code', `
const store = new Store<State>({
  initialState: new State(0),
  globalWrapError(error: any) {
    if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);
    return error;
  },
});
`),
    val('Fixed', `if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error);`),
  )
  .example(
    val('How', 'is a function declared in the same file, and given by name'),
    val('Code', `
function globalWrapError(error: any) {
  if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);
  return error;
}

const store = createStore<State>({ initialState: new State(0), globalWrapError });
`),
    val('Fixed', `if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error);`),
  )
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(["throw new UserException('No connection').withHardCause(error);"]);
    expect(result.messages[0].message).toContain('Return the error instead of throwing it.');
    expect(result.fixed).toContain(ctx.example.val('Fixed'));
    expect(result.fixed).not.toContain('throw');
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, a throw in globalWrapError is also reported.')
  .given('A store whose globalWrapError throws.')
  .when('The code is linted without type information.')
  .then('The throw is reported and fixed.')
  .run(async (_) => {
    const code = `${prelude}
const store = createStore<State>({
  initialState: new State(0),
  globalWrapError: (error: any) => {
    throw new UserException('Failed').withHardCause(error);
  },
});
`;
    const result = lint(rule, code, {types: false});
    expect(result.messages.map((m) => m.text)).toEqual(["throw new UserException('Failed').withHardCause(error);"]);
    expect(result.fixed).toContain(`return new UserException('Failed').withHardCause(error);`);
  });

Bdd(feature)
  .scenario('If the function declares a return type, the throw is reported but not fixed.')
  .given('A globalWrapError with the declared return type UserException, which throws an Error.')
  .when('The code is linted.')
  .then('The throw is reported.')
  .and('There is no fix, since returning an Error would not compile.')
  .run(async (_) => {
    const code = `${prelude}
const store = createStore<State>({
  initialState: new State(0),
  globalWrapError: (error: any): UserException => {
    if (error instanceof UserException) return error;
    throw new Error('Unexpected');
  },
});
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(["throw new Error('Unexpected');"]);
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('Throws that do not leave globalWrapError, or are not in it, are not reported.')
  .given('{Where}.')
  .when('The code is linted.')
  .then('There are no reports.')
  .example(
    val('Where', 'A throw caught by a try in globalWrapError'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  globalWrapError: (error: any) => {
    try {
      if (error === null) throw new Error('No error');
    } catch (e) {
      return e;
    }
    return error;
  },
});
`))
  .example(
    val('Where', 'A throw in a function inside globalWrapError'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  globalWrapError: (error: any) => {
    const check = () => { throw new Error('Never called'); };
    return error;
  },
});
`))
  .example(
    val('Where', 'A throw in a function called globalWrapError, not given to a store'),
    val('Code', `
const options = {
  globalWrapError: (error: any) => { throw error; },
};
`))
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    expect(lint(rule, code).messages).toEqual([]);
  });
