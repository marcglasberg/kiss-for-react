import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/preferReturnNull';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: prefer-return-null');

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number, readonly items: string[] = []) {}
  add(n: number): State { return new State(this.count + n, this.items); }
}

declare function save(): Promise<void>;
`;

Bdd(feature)
  .scenario('A sync reduce that returns this.state is reported, and fixed to return null.')
  .given('An action whose sync reduce returns this.state in some case.')
  .when('The code is linted.')
  .then('That return is reported.')
  .and('The fix returns null instead, and the code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class Increment extends KissAction<State> {
  reduce() {
    if (this.state.count > 10) return this.state;
    return this.state.add(1);
  }
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['this.state']);
    expect(result.messages[0].message).toContain('Return `null` instead of the unchanged state');
    expect(result.fixed).toContain('if (this.state.count > 10) return null;');
    expect(result.fixed).toContain('return this.state.add(1);');
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('An async reduce whose returned function returns the state unchanged is reported, and fixed.')
  .given('An action whose async reduce returns {Function}.')
  .when('The code is linted.')
  .then('The returned function is reported.')
  .and('The fix returns null instead, and the code compiles.')
  .example(val('Function', '(state: State) => state'))
  .example(val('Function', '() => this.state'))
  .example(val('Function', '(state: State) => { return state; }'))
  .run(async (ctx) => {
    const fn = ctx.example.val('Function') as string;
    const code = `${prelude}
class Save extends KissAction<State> {
  async reduce() {
    await save();
    if (this.state.count > 10) return ${fn};
    return (state: State) => state.add(1);
  }
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual([fn.split('\n')[0]]);
      expect(result.fixed).toContain('if (this.state.count > 10) return null;');
      expect(lint(rule, result.fixed).typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('There is no fix when the declared return type of reduce does not accept null.')
  .given('An action whose reduce returns this.state, with a declared return type {Type}.')
  .when('The code is linted.')
  .then('It is reported, {Fix}.')
  .example(val('Type', 'State'), val('Fix', 'without a fix'), val('Fixed', false))
  .example(val('Type', 'State | null'), val('Fix', 'with a fix'), val('Fixed', true))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  reduce(): ${ctx.example.val('Type')} {
    if (this.state.count > 10) return this.state;
    return this.state.add(1);
  }
}
`;
    const isFixed = ctx.example.val('Fixed') as boolean;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual(['this.state']);
      expect(result.fixed.includes('return null;')).toBe(isFixed);
    }
  });

Bdd(feature)
  .scenario('Reducers that change the state are not reported.')
  .given('An action whose reduce {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'returns null'), val('Code', `
  reduce() { return null; }`))
  .example(val('Case', 'returns a new state'), val('Code', `
  reduce() { return this.state.add(1); }`))
  .example(val('Case', 'returns a function that changes the state'), val('Code', `
  async reduce() { await save(); return (state: State) => state.add(1); }`))
  .example(val('Case', 'mutates this.state, and returns it'), val('Code', `
  reduce() { this.state.items.push('a'); return this.state; }`))
  .example(val('Case', 'mutates a variable with this.state, and returns this.state'), val('Code', `
  reduce() { const s = this.state; (s as any).count = 2; return this.state; }`))
  .example(val('Case', 'returns this.state inside a nested function'), val('Code', `
  reduce() { const get = () => { return this.state; }; return get().add(1); }`))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {${ctx.example.val('Code')}
}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Classes that are not Kiss actions are not reported.')
  .given('A class that is not a Kiss action, whose reduce returns this.state.')
  .when('The code is linted with type information.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `class Base { state = 1; reduce(): number | null { return null; } }

class Reducer extends Base {
  reduce() {
    return this.state;
  }
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
