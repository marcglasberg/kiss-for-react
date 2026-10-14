import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint, LintResult } from '../testing/lint';
import rule from '../src/rules/eventNotSpentInitially';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: event-not-spent-initially');

const message = (text: string, replacement: string) =>
  `The initial state has a new event, \`${text}\`, which fires when the first component that uses it mounts. ` +
  `Use \`${replacement}\` instead, so that nothing fires when the app starts.`;

const imports = `import { createStore, Evt, EvtState, KissAction, Store } from 'kiss-for-react';
`;

const stateClass = (initialState: string) => `class State {
  constructor(readonly scrollEvt: Evt, readonly textEvt: Evt<string>, readonly pulseEvt: EvtState<string>) {}
  ${initialState}
  copy(changes: Partial<State>): State {
    return Object.assign(new State(this.scrollEvt, this.textEvt, this.pulseEvt), changes);
  }
}
`;

// Applies the first suggestion of each warning, one at a time, until there are no warnings.
function applyAllSuggestions(code: string, types: boolean): string {
  for (let i = 0; i < 10; i++) {
    const result: LintResult = lint(rule, code, {types});
    if (result.messages.length === 0) return code;
    code = result.withSuggestion(0, 0);
  }
  throw new Error('Too many suggestions.');
}

Bdd(feature)
  .scenario('Spent events in the initial state, and new events in reducers, are fine.')
  .given('A state class whose static initialState uses Evt.spent() and EvtState.spent().')
  .and('An action whose reducer puts a new Evt in the state.')
  .and('A store created with the static initialState.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = imports + stateClass('static initialState = new State(Evt.spent(), Evt.spent<string>(), EvtState.spent());') + `
class ScrollToTop extends KissAction<State> {
  reduce() { return this.state.copy({ scrollEvt: new Evt() }); }
}
class Pulse extends KissAction<State> {
  reduce() { return this.state.copy({ pulseEvt: new EvtState('go') }); }
}
export const store = createStore<State>({ initialState: State.initialState });
export { ScrollToTop, Pulse };
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('New events in a static initialState property are a warning, with a suggestion to use spent events.')
  .given('A state class whose static initialState property creates new events, one with type arguments.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning on each new event.')
  .and('The suggestion replaces it with Evt.spent() (or EvtState.spent()), keeping the type arguments.')
  .and('The code with all the suggestions applied compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = imports + stateClass("static initialState = new State(new Evt(), new Evt<string>('x'), new EvtState('p'));") +
      'export const store = createStore<State>({ initialState: State.initialState });\n';
    const result = lint(rule, code, {types});

    expect(result.messages.map((m) => m.text)).toEqual(['new Evt()', "new Evt<string>('x')", "new EvtState('p')"]);
    expect(result.messages[0].message).toBe(message('new Evt()', 'Evt.spent()'));
    expect(result.messages[1].message).toBe(message("new Evt<string>('x')", 'Evt.spent<string>()'));
    expect(result.messages[2].message).toBe(message("new EvtState('p')", 'EvtState.spent()'));
    expect(result.messages.map((m) => m.suggestions)).toEqual([
      ['Replace with `Evt.spent()`.'], ['Replace with `Evt.spent<string>()`.'], ['Replace with `EvtState.spent()`.']]);

    const fixed = applyAllSuggestions(code, types);
    expect(fixed).toContain('static initialState = new State(Evt.spent(), Evt.spent<string>(), EvtState.spent());');
    if (types) expect(lint(rule, fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('New events in a static initialState getter or method are a warning.')
  .given('A state class whose static initialState is a getter or a method, and creates a new event.')
  .when('The code is linted.')
  .then('There is a warning on the new event.')
  .example(val('Initial state', 'static get initialState(): State { return new State(new Evt(), Evt.spent(), EvtState.spent()); }'))
  .example(val('Initial state', 'static initialState(): State { return new State(new Evt(), Evt.spent(), EvtState.spent()); }'))
  .example(val('Initial state', 'static initialState(): State { const scroll = new Evt(); return new State(scroll, Evt.spent(), EvtState.spent()); }'))
  .run(async (ctx) => {
    const code = imports + stateClass(ctx.example.val('Initial state') as string) + 'export { State };\n';
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['new Evt()']);
  });

Bdd(feature)
  .scenario('New events in the initialState given to createStore, new Store or logOut are a warning.')
  .given('A store created (or logged out) with an initial state that creates a new event.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning on the new event, with a suggestion.')
  .example(val('Type information', true), val('Code', 'export const store = createStore<State>({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) });'))
  .example(val('Type information', false), val('Code', 'export const store = createStore({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) });'))
  .example(val('Type information', true), val('Code', 'export const store = new Store<State>({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) });'))
  .example(val('Type information', true), val('Code', 'export const store = createStore<State>({ initialState: State.initialState });\nexport const loggedOut = store.logOut({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) });'))
  .run(async (ctx) => {
    const code = imports + stateClass('static initialState = new State(Evt.spent(), Evt.spent(), EvtState.spent());') +
      ctx.example.val('Code') + '\n';
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['new Evt()']);
    expect(result.messages[0].suggestions).toEqual(['Replace with `Evt.spent()`.']);
    expect(result.withSuggestion(0, 0)).toContain('new State(Evt.spent(), Evt.spent(), EvtState.spent())');
  });

Bdd(feature)
  .scenario('New events outside the initial state are fine.')
  .given('New events created in a reducer, in a plain function, and in an unrelated static field.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = imports + stateClass('static initialState = new State(Evt.spent(), Evt.spent(), EvtState.spent());') + `
class ChangeText extends KissAction<State> {
  constructor(readonly text: string) { super(); }
  reduce() { return this.state.copy({ textEvt: new Evt(this.text) }); }
}
class Samples {
  static sample = new State(new Evt(), new Evt('x'), new EvtState('p'));
}
export function makeEvent() { return new Evt(); }
export { ChangeText, Samples };
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A class named Evt that is not from Kiss is not reported, and nothing is reported in tests.')
  .given('A local class named Evt, created in a static initialState.')
  .and('A test file with a new Kiss Evt in a static initialState.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const localEvt = `class Evt {}
export class State {
  constructor(readonly evt: Evt) {}
  static initialState = new State(new Evt());
}
`;
    expect(lint(rule, localEvt).messages).toEqual([]);

    const test = imports + stateClass('static initialState = new State(new Evt(), Evt.spent(), EvtState.spent());') + 'export { State };\n';
    expect(lint(rule, test, {filename: 'state.test.ts'}).messages).toEqual([]);
    expect(lint(rule, test, {filename: '__tests__/state.ts'}).messages).toEqual([]);
  });
