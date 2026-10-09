import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/thenOnDispatchAndWait';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: then-on-dispatch-and-wait');

const prelude = `import { createStore, KissAction, useDispatchAndWait, useStore } from 'kiss-for-react';

class State {
  constructor(readonly saved: boolean) {}
}

class SaveUser extends KissAction<State> {
  reduce() { return new State(true); }
}

declare function navigate(path: string): void;

const store = createStore<State>({ initialState: new State(false) });
`;

Bdd(feature)
  .scenario('A then callback that ignores the status of dispatchAndWait is a warning, with a suggestion to check it.')
  .given('A component that dispatches with the function from useDispatchAndWait.')
  .and('It navigates in a then callback, without a parameter.')
  .when('The code is linted.')
  .then('There is a warning in then.')
  .and('The suggestion adds a status parameter, and only navigates if status.isCompletedOk.')
  .and('The code with the suggestion compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
export function SaveButton() {
  const dispatchAndWait = useDispatchAndWait();
  return <button onClick={() => dispatchAndWait(new SaveUser()).then(() => navigate('/home'))} />;
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['then']);
    expect(result.messages[0].message).toContain('runs even when the action fails');
    expect(result.messages[0].suggestions).toEqual(['Run the callback only if `status.isCompletedOk`.']);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(
      `dispatchAndWait(new SaveUser()).then((status) => { if (status.isCompletedOk) return navigate('/home'); })`);
    if (types) expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The promise of any kind of dispatchAndWait is checked.')
  .given('Code that calls then on {Call}, with a callback that ignores the status.')
  .when('The code is linted.')
  .then('There is a warning.')
  .example(val('Call', 'store.dispatchAndWait'), val('Code', `
store.dispatchAndWait(new SaveUser()).then(() => navigate('/home'));`))
  .example(val('Call', 'useStore().dispatchAndWait'), val('Code', `
export function SaveButton() {
  const kiss = useStore();
  return <button onClick={() => kiss.dispatchAndWait(new SaveUser()).then(() => navigate('/home'))} />;
}`))
  .example(val('Call', 'this.dispatchAndWait, in an action'), val('Code', `
class SaveAndGo extends KissAction<State> {
  reduce() {
    this.dispatchAndWait(new SaveUser()).then(() => navigate('/home'));
    return null;
  }
}`))
  .example(val('Call', 'a renamed function from useDispatchAndWait'), val('Code', `
export function SaveButton() {
  const save = useDispatchAndWait();
  return <button onClick={() => save(new SaveUser()).then(() => navigate('/home'))} />;
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['then']);
    expect(result.typeErrors).toEqual([]);
    expect(lint(rule, code, {types: false}).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('The suggestion wraps a block body, and uses the parameter that is not read.')
  .given('A then callback with a status parameter that it does not read, and a block body.')
  .when('The code is linted.')
  .then('There is a warning.')
  .and('The suggestion wraps the body in an if that checks the parameter, indenting it.')
  .run(async (_) => {
    const code = `${prelude}
export async function save() {
  await store.dispatchAndWait(new SaveUser()).then((s) => {
    console.log('Saved');
    navigate('/home');
  });
}
`;
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].suggestions).toEqual(['Run the callback only if `s.isCompletedOk`.']);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`  await store.dispatchAndWait(new SaveUser()).then((s) => {
    if (s.isCompletedOk) {
      console.log('Saved');
      navigate('/home');
    }
  });`);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Callbacks that use the status, or ignore it on purpose, are fine.')
  .given('Code that {How}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('How', 'checks the status in then'),
    val('Code', `store.dispatchAndWait(new SaveUser()).then((status) => { if (status.isCompletedOk) navigate('/home'); });`))
  .example(val('How', 'names the parameter _status'),
    val('Code', `store.dispatchAndWait(new SaveUser()).then((_status) => navigate('/home'));`))
  .example(val('How', 'uses finally'),
    val('Code', `store.dispatchAndWait(new SaveUser()).finally(() => navigate('/home'));`))
  .example(val('How', 'uses then on dispatchAndWaitAll'),
    val('Code', `store.dispatchAndWaitAll([new SaveUser()]).then(() => navigate('/home'));`))
  .example(val('How', 'uses then on a promise that is not from Kiss'),
    val('Code', `Promise.resolve(1).then(() => navigate('/home'));`))
  .run(async (ctx) => {
    const code = `${prelude}
${ctx.example.val('Code')}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, a dispatchAndWait that does not return an action status is ignored.')
  .given('A dispatchAndWait function that is not from Kiss, and returns a promise of a number.')
  .when('Code calls then on it, with a callback without parameters.')
  .then('With type information, there are no warnings.')
  .run(async (_) => {
    const code = `declare function dispatchAndWait(action: string): Promise<number>;
declare function navigate(path: string): void;

dispatchAndWait('save').then(() => navigate('/home'));
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
