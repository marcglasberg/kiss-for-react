import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/asyncAfter';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: async-after');

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
}

declare function cleanup(): Promise<void>;
declare function log(): void;
`;

Bdd(feature)
  .scenario('An after method that returns a promise is an error.')
  .given('An action with {Case}.')
  .when('The code is linted.')
  .then('There is an error in after.')
  .example(val('Case', 'an async after'), val('Code', `
  async after() { await cleanup(); }`), val('Type information', true))
  .example(val('Case', 'an async after'), val('Code', `
  async after() { await cleanup(); }`), val('Type information', false))
  .example(val('Case', 'an after with a declared Promise return type'), val('Code', `
  after(): Promise<void> { return cleanup(); }`), val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class Save extends KissAction<State> {
  reduce() { return null; }
${ctx.example.val('Code')}
}
`;
    const result = lint(rule, code, {types});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['after']);
    expect(result.messages[0].message).toContain('The `after` method must be sync');
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, an after that returns a promise without declaring it is an error.')
  .given('An action whose after method returns a promise, with no declared return type.')
  .when('The code is linted.')
  .then('With type information, there is an error in after.')
  .and('Without type information, there is no error.')
  .run(async (_) => {
    const code = `${prelude}
class Save extends KissAction<State> {
  reduce() { return null; }
  after() { return cleanup(); }
}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['after']);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An async after without await has a suggestion to remove async.')
  .given('An action with an async after method that has no await.')
  .when('The suggestion is applied.')
  .then('after is sync.')
  .and('The code compiles, and there are no errors.')
  .run(async (_) => {
    const code = `${prelude}
class Save extends KissAction<State> {
  reduce() { return null; }
  async after() { log(); }
}
`;
    const result = lint(rule, code);
    expect(result.messages[0].suggestions).toEqual(['Remove `async`.']);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('\n  after() { log(); }');
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A sync after, or async methods that are not after, are fine.')
  .given('{Case}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Case', 'An action with a sync after'), val('Code', `
class Save extends KissAction<State> {
  reduce() { return null; }
  after() { log(); }
}`))
  .example(val('Case', 'An action with an async before and reduce'), val('Code', `
class Save extends KissAction<State> {
  async before() { await cleanup(); }
  async reduce() { await cleanup(); return null; }
}`))
  .example(val('Case', 'A class that is not an action, with an async after'), val('Code', `
class Base { after(): unknown { return null; } }
class Job extends Base {
  async after() { await cleanup(); }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
  });
