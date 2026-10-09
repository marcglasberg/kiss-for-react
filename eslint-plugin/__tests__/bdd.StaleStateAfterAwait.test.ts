import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: stale-state-after-await');

const rule = 'stale-state-after-await';

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly name: string, readonly user: string | null) {}
  copy(changes: Partial<State>): State { return Object.assign(new State(this.name, this.user), changes); }
}

declare function loadUser(name?: string): Promise<string>;
`;

Bdd(feature)
  .scenario('Building the returned state from a copy of the state made before an await is an error.')
  .given('An action whose async reduce copies this.state to a variable, before an await.')
  .and('After the await, it returns a function that uses the variable to build the new state.')
  .when('The code is linted.')
  .then('There is an error in the use of the variable.')
  .and('The suggestion uses the state parameter of the returned function instead.')
  .and('The suggested code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  async reduce() {
    const s = this.state;
    const user = await loadUser();
    return (state: State) => s.copy({ user });
  }
}
`;
    const result = lint(rule, code, {types});

    expect(result.messages.map((m) => [m.text, m.line])).toEqual([['s', 14]]);
    expect(result.messages[0].message).toContain('state from before the `await`');
    expect(result.messages[0].suggestions).toEqual(['Use `state` instead of `s`.']);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('return (state: State) => state.copy({ user });');
    if (types) expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A copy of the state used through another local variable is also an error.')
  .given('An action whose async reduce copies this.state to a variable, before an await.')
  .and('After the await, it uses the variable to create another variable, which is returned.')
  .when('The code is linted.')
  .then('There is an error in the use of the first variable.')
  .and('The suggestion uses this.state instead.')
  .run(async (_) => {
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  async reduce() {
    const s = this.state;
    const user = await loadUser();
    const newState = s.copy({ user });
    return () => newState;
  }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['s']);
    expect(result.withSuggestion(0, 0)).toContain('const newState = this.state.copy({ user });');
  });

Bdd(feature)
  .scenario('Uses of the copy that don\'t build the returned state are fine.')
  .given('An action whose async reduce copies this.state to a variable, before an await.')
  .and('It uses the variable {Use}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Use', 'in a condition, after the await'), val('Code', `
    const s = this.state;
    const user = await loadUser();
    if (s.user !== null) return null;
    return (state: State) => state.copy({ user });`))
  .example(val('Use', 'inside the await'), val('Code', `
    const s = this.state;
    const user = await loadUser(s.name);
    return (state: State) => state.copy({ user });`))
  .example(val('Use', 'in the return, but with no await before it'), val('Code', `
    const s = this.state;
    return (state: State) => s.copy({ user: 'x' });`))
  .example(val('Use', 'after an await in the other branch of an if'), val('Code', `
    const s = this.state;
    if (s.name === 'a') {
      await loadUser();
      return null;
    } else {
      return (state: State) => s.copy({ user: 'x' });
    }`))
  .run(async (ctx) => {
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  async reduce() {${ctx.example.val('Code')}
  }
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A class that is not an action is ignored.')
  .given('A class that doesn\'t extend KissAction, with the same async reduce.')
  .when('The code is linted with type information.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `${prelude}
class Base {}

class NotAnAction extends Base {
  state = new State('a', null);
  async reduce() {
    const s = this.state;
    const user = await loadUser();
    return (state: State) => s.copy({ user });
  }
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
