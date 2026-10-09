import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/actionFileNameStartsWithAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: action-file-name-starts-with-action');

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}
`;

const loadUser = `${prelude}
class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}
`;

const loadAndSaveUser = `${prelude}
class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}

class SaveUser extends Action {
  async reduce() { return null; }
}
`;

Bdd(feature)
  .scenario('A file with one action, whose name does not start with ACTION, is reported.')
  .given('A file called {File name}, which declares the LoadUser action.')
  .when('The code is linted.')
  .then('The action is reported.')
  .and('The message suggests the name {Suggested}, in the same case style.')
  .example(val('File name', 'LoadUser.ts'), val('Suggested', 'ACTION_LoadUser.ts'), val('Type information', true))
  .example(val('File name', 'LoadUser.ts'), val('Suggested', 'ACTION_LoadUser.ts'), val('Type information', false))
  .example(val('File name', 'load_user.ts'), val('Suggested', 'ACTION_load_user.ts'), val('Type information', false))
  .example(val('File name', 'load-user.ts'), val('Suggested', 'action-load-user.ts'), val('Type information', false))
  .example(val('File name', 'loadUser.tsx'), val('Suggested', 'actionLoadUser.tsx'), val('Type information', false))
  .example(val('File name', 'LoadUserAction.ts'), val('Suggested', 'ACTION_LoadUser.ts'), val('Type information', false))
  .example(val('File name', 'load_user_action.ts'), val('Suggested', 'ACTION_load_user.ts'), val('Type information', false))
  .run(async (ctx) => {
    const fileName = ctx.example.val('File name') as string;
    const types = ctx.example.val('Type information') as boolean;
    const result = lint(rule, loadUser, {filename: `actions/${fileName}`, types});
    expect(result.messages.map((m) => [m.text, m.line])).toEqual([['LoadUser', 9]]);
    expect(result.messages[0].message).toBe(
      `Rename the file \`${fileName}\` to \`${ctx.example.val('Suggested')}\`, with your IDE, which also updates the imports. ` +
      'This project names the files that declare actions like `ACTION_LoadUser.ts` or `ACTION_load_user.ts`.');
  });

Bdd(feature)
  .scenario('A file with more than one action is reported on the first one, and the name is based on the file name.')
  .given('A file called {File name}, which declares the LoadUser and SaveUser actions.')
  .when('The code is linted.')
  .then('Only the first action is reported.')
  .and('The message suggests the name {Suggested}.')
  .example(val('File name', 'user.ts'), val('Suggested', 'action-user.ts'))
  .example(val('File name', 'User.ts'), val('Suggested', 'ACTION_User.ts'))
  .run(async (ctx) => {
    const result = lint(rule, loadAndSaveUser, {filename: ctx.example.val('File name') as string});
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUser']);
    expect(result.messages[0].message).toContain(`to \`${ctx.example.val('Suggested')}\``);
  });

Bdd(feature)
  .scenario('Files whose names start with ACTION, in any case style, are not reported.')
  .given('A file called {File name}, which declares actions.')
  .when('The code is linted.')
  .then('There are no reports.')
  .example(val('File name', 'ACTION_LoadUser.ts'))
  .example(val('File name', 'ACTION_load_user.ts'))
  .example(val('File name', 'action-load-user.ts'))
  .example(val('File name', 'actionLoadUser.tsx'))
  .example(val('File name', 'ACTIONS_user.ts'))
  .run(async (ctx) => {
    const filename = ctx.example.val('File name') as string;
    expect(lint(rule, loadAndSaveUser, {filename}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Files without concrete actions, index files, and test files are not reported.')
  .given('{Description}.')
  .when('The code is linted, with or without type information.')
  .then('There are no reports.')
  .example(val('Description', 'A file that only declares the abstract base action'), val('File name', 'base.ts'), val('Code', prelude))
  .example(val('Description', 'A file without actions'), val('File name', 'user.ts'), val('Code', `
export class User {
  constructor(readonly name: string) {}
}
`))
  .example(val('Description', 'A file with actions, called index.ts'), val('File name', 'user/index.ts'), val('Code', loadUser))
  .example(val('Description', 'A test file with actions'), val('File name', 'user.test.ts'), val('Code', loadUser))
  .example(val('Description', 'A file with actions, in a __tests__ directory'), val('File name', '__tests__/user.ts'), val('Code', loadUser))
  .run(async (ctx) => {
    const filename = ctx.example.val('File name') as string;
    const code = ctx.example.val('Code') as string;
    expect(lint(rule, code, {filename}).messages).toEqual([]);
    expect(lint(rule, code, {filename, types: false}).messages).toEqual([]);
  });
