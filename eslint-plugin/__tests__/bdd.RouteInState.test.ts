import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/routeInState';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: route-in-state');

const stateWith = (fields: string) => `import { createStore } from 'kiss-for-react';

class State {
  constructor(${fields}) {}
}

export const store = createStore<State>({ initialState: new State('/home') });
`;

Bdd(feature)
  .scenario('A field of a state class with the name of a route is a warning.')
  .given('A state class with a field named like the current route.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning in the field.')
  .example(val('Field', 'currentRoute'), val('Type information', true))
  .example(val('Field', 'routeName'), val('Type information', true))
  .example(val('Field', 'currentPath'), val('Type information', true))
  .example(val('Field', 'pathname'), val('Type information', false))
  .example(val('Field', 'location'), val('Type information', false))
  .run(async (ctx) => {
    const field = ctx.example.val('Field') as string;
    const code = stateWith(`readonly ${field}: string`);
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([field]);
    expect(result.messages[0].message).toBe(
      `The field \`${field}\` of the state class \`State\` seems to keep the current route. Get it from your ` +
      'router instead, like React Router\'s `useLocation()`, since a copy in the state can get out of sync with the router.');
  });

Bdd(feature)
  .scenario('Other names, and classes that are not state classes, are fine.')
  .given('A state class with a field named "path", and a class that is not part of the state with a field named "pathname".')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${stateWith('readonly path: string')}
export class Link { constructor(readonly pathname: string) {} }
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Routes in state classes are not reported in tests.')
  .given('A test file with a state class with a field named "currentRoute".')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = stateWith('readonly currentRoute: string');
    expect(lint(rule, code, {filename: 'state.test.ts'}).messages).toEqual([]);
  });
