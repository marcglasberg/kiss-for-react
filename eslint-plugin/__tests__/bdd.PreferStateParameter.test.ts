import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: prefer-state-parameter');

const rule = 'prefer-state-parameter';

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  add(n: number): State { return new State(this.count + n); }
}

declare function load(): Promise<number>;
`;

Bdd(feature)
  .scenario('Using this.state in the function returned by an async reducer is reported.')
  .given('An action whose async reduce returns a function with a state parameter.')
  .and('The function uses this.state instead of its parameter.')
  .when('The code is linted.')
  .then('Each this.state is reported.')
  .and('The fix replaces them with the parameter.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class Increment extends KissAction<State> {
  async reduce() {
    const n = await load();
    return (state: State) => this.state.add(n + this.state.count);
  }
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['this.state', 'this.state']);
    expect(result.messages[0].message).toContain('Use the `state` parameter');
    expect(result.fixed).toContain('return (state: State) => state.add(n + state.count);');
  });

Bdd(feature)
  .scenario('If the returned function has no parameter, the fix adds it, with its type.')
  .given('An action whose async reduce returns a function without parameters, which uses this.state.')
  .when('The code is linted with type information.')
  .then('this.state is reported.')
  .and('The fix adds a state parameter with the state type, and uses it.')
  .and('The fixed code compiles.')
  .run(async (_) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  async reduce() {
    const n = await load();
    return () => this.state.add(n);
  }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['this.state']);
    expect(result.fixed).toContain('return (state: State) => state.add(n);');
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, a returned function with no parameter is reported, but not fixed.')
  .given('An action whose async reduce returns a function without parameters, which uses this.state.')
  .when('The code is linted without type information.')
  .then('this.state is reported, but there is no fix (the parameter would need a type).')
  .run(async (_) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  async reduce() {
    const n = await load();
    return () => this.state.add(n);
  }
}
`;
    const result = lint(rule, code, {types: false});
    expect(result.messages.map((m) => m.text)).toEqual(['this.state']);
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('this.state outside the returned function, or in a sync reducer, is fine.')
  .given('An action that uses this.state {Where}.')
  .when('The code is linted.')
  .then('There are no reports.')
  .example(val('Where', 'in an async reducer, before returning a function'), val('Code', `
  async reduce() {
    const count = this.state.count;
    const n = await load();
    return (state: State) => state.add(n + count);
  }`))
  .example(val('Where', 'in a sync reducer'), val('Code', `
  reduce() {
    return this.state.add(1);
  }`))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {${ctx.example.val('Code')}
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
