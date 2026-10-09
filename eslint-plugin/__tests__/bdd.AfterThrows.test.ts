import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/afterThrows';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: after-throws');

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly user: string | null) {}
}

declare function cleanup(): void;
`;

Bdd(feature)
  .scenario('A throw in the after method of an action is reported.')
  .given('An action whose after method throws {Case}.')
  .when('The code is linted.')
  .then('The throw is reported.')
  .example(val('Case', 'directly'), val('Code', `
  after() {
    if (this.state.user === null) throw new Error('No user');
  }`))
  .example(val('Case', 'inside a try without catch'), val('Code', `
  after() {
    try {
      if (this.state.user === null) throw new Error('No user');
    } finally {
      cleanup();
    }
  }`))
  .example(val('Case', 'inside a catch'), val('Code', `
  after() {
    try {
      cleanup();
    } catch (error) {
      throw new Error('Cleanup failed');
    }
  }`))
  .run(async (ctx) => {
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  reduce() { return null; }
${ctx.example.val('Code')}
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.typeErrors).toEqual([]);
      expect(result.messages.map((m) => m.text)).toEqual([expect.stringMatching(/^throw new Error/)]);
      expect(result.messages[0].message).toContain('Kiss ignores errors thrown by `after`');
    }
  });

Bdd(feature)
  .scenario('A throw in the after method of a base action is reported.')
  .given('A base action without reduce, whose after method throws.')
  .when('The code is linted.')
  .then('The throw is reported.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
abstract class Action extends KissAction<State> {
  after() {
    throw new Error('Failed');
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(["throw new Error('Failed');"]);
  });

Bdd(feature)
  .scenario('Throws that are caught, or that are not in after, are not reported.')
  .given('An action with {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'a throw caught by a try in after'), val('Code', `
  after() {
    try {
      if (this.state.user === null) throw new Error('No user');
    } catch (error) {
      console.log(error);
    }
  }`))
  .example(val('Case', 'a throw inside a callback in after'), val('Code', `
  after() {
    setTimeout(() => { throw new Error('Later'); }, 0);
  }`))
  .example(val('Case', 'a throw in before'), val('Code', `
  after() { cleanup(); }
  before() { if (this.state.user === null) throw new Error('No user'); }`))
  .run(async (ctx) => {
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  reduce() { return null; }
${ctx.example.val('Code')}
}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Classes that are not Kiss actions are not reported.')
  .given('A class that is not a Kiss action, whose after method throws.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `class Base { after() {} }

class Job extends Base {
  after() {
    throw new Error('Failed');
  }
}
`;
    expect(lint(rule, code, {types: ctx.example.val('Type information') as boolean}).messages).toEqual([]);
  });
