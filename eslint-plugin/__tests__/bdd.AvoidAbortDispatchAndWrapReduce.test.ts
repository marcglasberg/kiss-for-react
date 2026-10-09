import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import avoidAbortDispatch from '../src/rules/avoidAbortDispatch';
import avoidWrapReduce from '../src/rules/avoidWrapReduce';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: avoid-abort-dispatch and avoid-wrap-reduce');

const rules = {
  'avoid-abort-dispatch': avoidAbortDispatch,
  'avoid-wrap-reduce': avoidWrapReduce,
};

const methods = {
  'avoid-abort-dispatch': `
  abortDispatch() { return this.state.user === null; }`,
  'avoid-wrap-reduce': `
  wrapReduce(reduce: () => ReduxReducer<State>) { return reduce; }`,
};

const prelude = `import { KissAction, ReduxReducer } from 'kiss-for-react';

class State {
  constructor(readonly user: string | null) {}
}
`;

type RuleName = keyof typeof rules;

Bdd(feature)
  .scenario('Overriding abortDispatch or wrapReduce in an action is reported, by the rule turned on.')
  .given('An action that overrides {Method}.')
  .when('The code is linted with the {Rule} rule.')
  .then('There is a warning in {Method}.')
  .example(val('Rule', 'avoid-abort-dispatch'), val('Method', 'abortDispatch'), val('Type information', true))
  .example(val('Rule', 'avoid-abort-dispatch'), val('Method', 'abortDispatch'), val('Type information', false))
  .example(val('Rule', 'avoid-wrap-reduce'), val('Method', 'wrapReduce'), val('Type information', true))
  .example(val('Rule', 'avoid-wrap-reduce'), val('Method', 'wrapReduce'), val('Type information', false))
  .run(async (ctx) => {
    const ruleName = ctx.example.val('Rule') as RuleName;
    const method = ctx.example.val('Method') as string;
    const code = `${prelude}
class LoadUser extends KissAction<State> {${methods[ruleName]}
  reduce() { return null; }
}
`;
    const result = lint(rules[ruleName], code, {types: ctx.example.val('Type information') as boolean});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual([method]);
    expect(result.messages[0].message).toContain(`Avoid overriding \`${method}\``);
  });

Bdd(feature)
  .scenario('Overriding wrapReduce in a base action, or as a property, is reported.')
  .given('A base action without reduce, that overrides wrapReduce {How}.')
  .when('The code is linted with the avoid-wrap-reduce rule.')
  .then('There is a warning in wrapReduce.')
  .example(val('How', 'as a method'), val('Code', `
  wrapReduce(reduce: () => ReduxReducer<State>) { return reduce; }`))
  .example(val('How', 'as a property with a function'), val('Code', `
  wrapReduce = (reduce: () => ReduxReducer<State>) => reduce;`))
  .run(async (ctx) => {
    const code = `${prelude}
abstract class Action extends KissAction<State> {${ctx.example.val('Code')}
}
`;
    for (const types of [true, false]) {
      const result = lint(avoidWrapReduce, code, {types});
      expect(result.typeErrors).toEqual([]);
      expect(result.messages.map((m) => m.text)).toEqual(['wrapReduce']);
    }
  });

Bdd(feature)
  .scenario('Overrides in tests, and in classes that are not actions, are not reported.')
  .given('{Case}, that overrides {Method}.')
  .when('The code is linted with the {Rule} rule.')
  .then('There are no warnings.')
  .example(val('Case', 'An action in a test file'), val('Rule', 'avoid-abort-dispatch'), val('Method', 'abortDispatch'))
  .example(val('Case', 'An action in a test file'), val('Rule', 'avoid-wrap-reduce'), val('Method', 'wrapReduce'))
  .example(val('Case', 'A class that is not an action'), val('Rule', 'avoid-abort-dispatch'), val('Method', 'abortDispatch'))
  .example(val('Case', 'A class that is not an action'), val('Rule', 'avoid-wrap-reduce'), val('Method', 'wrapReduce'))
  .run(async (ctx) => {
    const ruleName = ctx.example.val('Rule') as RuleName;
    const isTest = ctx.example.val('Case') === 'An action in a test file';
    const superclass = isTest ? 'KissAction<State>' : 'Job';
    const code = `${prelude}
class Job { state = new State(null); }

class LoadUser extends ${superclass} {${methods[ruleName]}
  reduce() { return null; }
}
`;
    const filename = isTest ? '__tests__/LoadUser.test.ts' : 'file.tsx';
    // Without type information, the class with a reduce can't be told apart from an action.
    expect(lint(rules[ruleName], code, {filename}).messages).toEqual([]);
    if (isTest) expect(lint(rules[ruleName], code, {filename, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions that don\'t override abortDispatch or wrapReduce are not reported.')
  .given('An action that only overrides reduce, before and after.')
  .when('The code is linted with both rules.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  before() {}
  reduce() { return null; }
  after() {}
}
`;
    for (const rule of Object.values(rules)) {
      expect(lint(rule, code).messages).toEqual([]);
      expect(lint(rule, code, {types: false}).messages).toEqual([]);
    }
  });
