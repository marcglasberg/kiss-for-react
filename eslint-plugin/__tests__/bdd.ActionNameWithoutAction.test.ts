import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/actionNameWithoutAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: action-name-without-action');

const prelude = `import { KissAction, Store } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}
`;

Bdd(feature)
  .scenario('An action whose name ends with Action is reported.')
  .given('An action called {Name}, which is not exported.')
  .when('The code is linted.')
  .then('The action name is reported, telling to rename it to LoadUser.')
  .and('The suggestion renames the action and all its uses in the file.')
  .and('The renamed code compiles.')
  .example(val('Name', 'LoadUserAction'), val('Type information', true))
  .example(val('Name', 'LoadUserAction'), val('Type information', false))
  .example(val('Name', 'LoadUser_Action'), val('Type information', true))
  .example(val('Name', 'LoadUser_Action'), val('Type information', false))
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
      `Rename the action \`${name}\` to \`LoadUser\`. This project names actions like \`LoadUser\`, without \`Action\`.`);
    expect(result.messages[0].suggestions).toEqual([`Rename \`${name}\` to \`LoadUser\` in this file.`]);

    const renamed = result.withSuggestion(0, 0);
    expect(renamed).toContain('class LoadUser extends Action {');
    expect(renamed).toContain('store.dispatch(new LoadUser());');
    expect(lint(rule, renamed).typeErrors).toEqual([]);
    expect(lint(rule, renamed, {types}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions whose names do not end with Action, and abstract actions, are not reported.')
  .given('{Description}.')
  .when('The code is linted, with or without type information.')
  .then('There are no reports.')
  .example(val('Description', 'An action called LoadUser'), val('Code', `
class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}`))
  .example(val('Description', 'An action called ActionLog, with Action only at the start'), val('Code', `
class ActionLog extends Action {
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
  .scenario('There is no suggestion when the new name is already used in the file, or is a global.')
  .given('An action called {Name}.')
  .and('The name {New name} is {Where}.')
  .when('The code is linted.')
  .then('It is reported, but there is no suggestion.')
  .example(val('Name', 'LoadUserAction'), val('New name', 'LoadUser'), val('Where', 'already used in the file'), val('Code', `
type LoadUser = { id: string };`))
  .example(val('Name', 'ErrorAction'), val('New name', 'Error'), val('Where', 'a global class'), val('Code', ''))
  .run(async (ctx) => {
    const name = ctx.example.val('Name') as string;
    const code = `${prelude}${ctx.example.val('Code')}
class ${name} extends Action {
  reduce() { return new State('Mary'); }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toContain(`to \`${ctx.example.val('New name')}\``);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('An exported action is reported, but there is no suggestion.')
  .given('An exported action called LoadUserAction.')
  .when('The code is linted.')
  .then('It is reported, telling to rename it with the IDE.')
  .and('There is no suggestion, since ESLint can only change this file.')
  .run(async (_) => {
    const code = `${prelude}
export class LoadUserAction extends Action {
  reduce() { return new State('Mary'); }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUserAction']);
    expect(result.messages[0].message).toContain('with your IDE\'s rename refactoring');
    expect(result.messages[0].suggestions).toEqual([]);
  });
