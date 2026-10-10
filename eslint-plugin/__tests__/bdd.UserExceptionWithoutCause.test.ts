import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/userExceptionWithoutCause';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: user-exception-without-cause');

const prelude = `import { createStore, KissAction, Persistor, UserException } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  copy(count: number): State { return new State(count); }
}

declare function parseNumber(text: string): number;
declare function load(): Promise<number>;
`;

Bdd(feature)
  .scenario('A UserException that replaces an error without keeping it as its cause is reported.')
  .given('A UserException created {Where}, without a hardCause.')
  .when('The code is linted (with or without type information).')
  .then('The UserException is reported.')
  .and('The fix adds .withHardCause with the replaced error, and the fixed code compiles.')
  .example(
    val('Where', 'in a catch clause of a reducer'),
    val('Code', `
class SetCount extends KissAction<State> {
  constructor(readonly text: string) { super(); }
  reduce() {
    try {
      return this.state.copy(parseNumber(this.text));
    } catch (error) {
      throw new UserException('Please enter a valid number');
    }
  }
}
`),
    val('Fixed', `throw new UserException('Please enter a valid number').withHardCause(error);`),
    val('Name', 'error'),
  )
  .example(
    val('Where', 'in the wrapError of an action'),
    val('Code', `
class LoadCount extends KissAction<State> {
  async reduce() {
    const count = await load();
    return (state: State) => state.copy(count);
  }
  wrapError(e: any) {
    return new UserException('Could not load the count', { title: 'Error' });
  }
}
`),
    val('Fixed', `return new UserException('Could not load the count', { title: 'Error' }).withHardCause(e);`),
    val('Name', 'e'),
  )
  .example(
    val('Where', 'in the wrapError of a persistor'),
    val('Code', `
abstract class MyPersistor extends Persistor<State> {
  wrapError(error: any) {
    return new UserException('Could not save your data.');
  }
}
`),
    val('Fixed', `return new UserException('Could not save your data.').withHardCause(error);`),
    val('Name', 'error'),
  )
  .example(
    val('Where', 'in errorObserver'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  errorObserver: ({ error }) =>
    error instanceof TypeError ? new UserException('Something went wrong') : error,
});
`),
    val('Fixed', `error instanceof TypeError ? new UserException('Something went wrong').withHardCause(error) : error,`),
    val('Name', 'error'),
  )
  .example(
    val('Where', 'in errorObserver, which renames the error'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  errorObserver({ error: e, action }) {
    return action !== null && e instanceof TypeError ? new UserException('Something went wrong') : e;
  },
});
`),
    val('Fixed', `return action !== null && e instanceof TypeError ? new UserException('Something went wrong').withHardCause(e) : e;`),
    val('Name', 'e'),
  )
  .example(
    val('Where', 'in errorObserver, which does not destructure its parameter'),
    val('Code', `
function errorObserver(params: { error: any }) {
  return params.error instanceof TypeError ? new UserException('Something went wrong') : params.error;
}

const store = createStore<State>({ initialState: new State(0), errorObserver });
`),
    val('Fixed', `return params.error instanceof TypeError ? new UserException('Something went wrong').withHardCause(params.error) : params.error;`),
    val('Name', 'params.error'),
  )
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toMatch(/^new UserException\(/);
      expect(result.messages[0].message).toContain(`This \`UserException\` replaces the error \`${ctx.example.val('Name')}\`, but loses it.`);
      expect(result.fixed).toContain(ctx.example.val('Fixed'));
      if (types) expect(lint(rule, result.fixed).typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('A UserException that keeps the error, or does not replace one, is not reported.')
  .given('{Case}.')
  .when('The code is linted.')
  .then('There are no reports.')
  .example(
    val('Case', 'A UserException with withHardCause'),
    val('Code', `
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    throw new UserException('Please enter a valid number').withHardCause(error);
  }
}
`))
  .example(
    val('Case', 'A UserException with the hardCause option'),
    val('Code', `
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    throw new UserException('Please enter a valid number', { hardCause: error });
  }
}
`))
  .example(
    val('Case', 'A UserException outside a catch or wrapError'),
    val('Code', `
function parse(text: string) {
  if (text === '') throw new UserException('Please enter a number');
  return parseNumber(text);
}
`))
  .example(
    val('Case', 'A catch without a parameter, or with a parameter starting with an underscore'),
    val('Code', `
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch {
    throw new UserException('Please enter a valid number');
  }
}

function parse2(text: string) {
  try {
    return parseNumber(text);
  } catch (_error) {
    throw new UserException('Please enter a valid number');
  }
}
`))
  .example(
    val('Case', 'A UserException in a function declared inside the catch'),
    val('Code', `
function parse(text: string, onError: (show: () => void) => void) {
  try {
    return parseNumber(text);
  } catch (error) {
    onError(() => { throw new UserException('Please enter a valid number'); });
    return 0;
  }
}
`))
  .example(
    val('Case', 'A UserException stored in a variable'),
    val('Code', `
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    const exception = new UserException('Please enter a valid number');
    throw exception.withHardCause(error);
  }
}
`))
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('If the error name is shadowed, the UserException is reported but not fixed.')
  .given('A catch clause with a UserException created inside a block that declares another variable with the same name as the error.')
  .when('The code is linted.')
  .then('The UserException is reported, but there is no fix.')
  .run(async (_) => {
    const code = `${prelude}
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    {
      const error = 'shadowed';
      throw new UserException('Please enter a valid number: ' + error);
    }
  }
}
`;
    const result = lint(rule, code);
    expect(result.messages).toHaveLength(1);
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('A UserException without a cause is not reported in tests.')
  .given('A test file with a UserException created in a catch clause, without a hardCause.')
  .when('The code is linted.')
  .then('There are no reports.')
  .run(async (_) => {
    const code = `${prelude}
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    throw new UserException('Please enter a valid number');
  }
}
`;
    expect(lint(rule, code, {filename: 'parse.test.ts'}).messages).toEqual([]);
  });
