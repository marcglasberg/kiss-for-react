import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/actionNameEndsWithUnderscoreAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: action-name-ends-with-underscore-action');

const prelude = `import { KissAction, Store } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}
`;

Bdd(feature)
  .scenario('An action whose name does not end with _Action is reported.')
  .given('An action called {Name}, which is not exported.')
  .when('The code is linted.')
  .then('The action name is reported, telling to rename it to LoadUser_Action.')
  .and('The suggestion renames the action and all its uses in the file.')
  .and('The renamed code compiles.')
  .example(val('Name', 'LoadUser'), val('Type information', true))
  .example(val('Name', 'LoadUser'), val('Type information', false))
  .example(val('Name', 'LoadUserAction'), val('Type information', true))
  .example(val('Name', 'LoadUserAction'), val('Type information', false))
  .run(async (ctx) => {
    const name = ctx.example.val('Name') as string;
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class ${name} extends Action {
  reduce() { return new State('Mary'); }
}

const store = new Store<State>({ initialState: new State('') });
store.dispatch(new ${name}());
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toBe(
      `Rename the action \`${name}\` to \`LoadUser_Action\`. This project names actions like \`LoadUser_Action\`.`);
    expect(result.messages[0].suggestions).toEqual([`Rename \`${name}\` to \`LoadUser_Action\` in this file.`]);

    const renamed = result.withSuggestion(0, 0);
    expect(renamed).toContain('class LoadUser_Action extends Action {');
    expect(renamed).toContain('store.dispatch(new LoadUser_Action());');
    expect(lint(rule, renamed).typeErrors).toEqual([]);
    expect(lint(rule, renamed, {types}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions whose names end with _Action, and abstract actions, are not reported.')
  .given('{Description}.')
  .when('The code is linted, with or without type information.')
  .then('There are no reports.')
  .example(val('Description', 'An action called LoadUser_Action'), val('Code', `
class LoadUser_Action extends Action {
  reduce() { return new State('Mary'); }
}`))
  .example(val('Description', 'An abstract action called UserAction'), val('Code', `
abstract class UserAction extends Action {
  reduce() { return new State('Mary'); }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An exported action is reported, but there is no suggestion.')
  .given('An exported action called LoadUser.')
  .when('The code is linted.')
  .then('It is reported, telling to rename it with the IDE.')
  .and('There is no suggestion, since ESLint can only change this file.')
  .run(async (_) => {
    const code = `${prelude}
export class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUser']);
    expect(result.messages[0].message).toContain('with your IDE\'s rename refactoring');
    expect(result.messages[0].suggestions).toEqual([]);
  });
