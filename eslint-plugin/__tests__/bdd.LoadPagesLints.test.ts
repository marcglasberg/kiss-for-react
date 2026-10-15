import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import { KissAction, LoadPages, Pages, Poll, Store, StoreException } from '../../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: the rules that know LoadPages actions');

const prelude = `import { KissAction, LoadPages, Pages, PagesToLoad, Poll } from 'kiss-for-react';

class State {
  constructor(readonly todos: Pages<string[], number> | null = null) {}
  copy(changes: { todos?: Pages<string[], number> | null }) { return new State(changes.todos ?? this.todos); }
}

declare function loadTodos(after: number): Promise<string[]>;
`;

/** The methods a `LoadPages` must implement. */
const loadPagesMethods = `
  getPagesFromState(state: State) { return state.todos; }
  applyPagesToState(state: State, todos: Pages<string[], number>) { return state.copy({ todos }); }
  initialPageParam() { return 0; }
  loadPage(after: number) { return loadTodos(after); }
  nextPageParam(lastPage: string[]) { return lastPage.length < 20 ? null : lastPage.length; }`;

/** A `LoadTodos` action, with the given extra members. */
const loadTodos = (members: string, superclass = 'LoadPages<State, string[], number>') => `${prelude}
class LoadTodos extends ${superclass} {${members}${loadPagesMethods}
}
`;

// ---------------------------------------------------------------------------------------------
// incompatible-action-features

/** How each feature is turned on, in the code. */
const DECLARATIONS: Record<string, string> = {
  nonReentrant: 'nonReentrant = true;',
  retry: 'retry = { on: true };',
  checkInternet: 'checkInternet = { dialog: false };',
  debounce: 'debounce = 300;',
  throttle: 'throttle = 1000;',
  fresh: 'fresh = 1000;',
  sequential: 'sequential = true;',
  poll: 'poll = Poll.once;',
  unlimitedRetryCheckInternet: 'unlimitedRetryCheckInternet = true;',
  ignoreOld: 'ignoreOld = true;',
};

/** The features a `LoadPages` can't use. */
const INCOMPATIBLE_WITH_LOAD_PAGES = ['nonReentrant', 'ignoreOld'];

Bdd(feature)
  .scenario('The incompatible-action-features rule reports exactly the features a LoadPages does not allow.')
  .given('A LoadPages with each feature.')
  .when('The code is linted, and the same action is dispatched.')
  .then('The lint reports the feature if, and only if, the dispatch throws a StoreException.')
  .run(async (_) => {
    const reported: string[] = [];
    const thrown: string[] = [];
    for (const name of Object.keys(DECLARATIONS)) {
      const code = loadTodos(`
  ${DECLARATIONS[name]}
  createPollingAction() { return new LoadTodos('refresh'); }`);
      if (lint('incompatible-action-features', code, {types: false}).messages.length > 0) reported.push(name);
      if (dispatchThrows(new RuntimeLoadPages(), name)) thrown.push(name);
    }
    expect(reported).toEqual(thrown);
    expect(reported).toEqual(INCOMPATIBLE_WITH_LOAD_PAGES);
  });

Bdd(feature)
  .scenario('A LoadPages with a feature it can\'t use is an error.')
  .given('A LoadPages with {Feature}.')
  .when('The code is linted.')
  .then('There is an error in {Feature}, which says why, with a suggestion to remove it.')
  .example(val('Feature', 'nonReentrant'), val('Type information', true), val('Reason', 'It already runs one load per list at a time.'))
  .example(val('Feature', 'nonReentrant'), val('Type information', false), val('Reason', 'It already runs one load per list at a time.'))
  .example(val('Feature', 'ignoreOld'), val('Type information', true), val('Reason', 'It already aborts the older loads of the list.'))
  .example(val('Feature', 'ignoreOld'), val('Type information', false), val('Reason', 'It already aborts the older loads of the list.'))
  .run(async (ctx) => {
    const name = ctx.example.val('Feature') as string;
    const code = loadTodos(`\n  ${DECLARATIONS[name]}`);
    const result = lint('incompatible-action-features', code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toContain(`A \`LoadPages\` can't use \`${name}\`.`);
    expect(result.messages[0].message).toContain(ctx.example.val('Reason'));
    expect(result.messages[0].suggestions).toEqual([`Remove \`${name}\`.`]);
    expect(result.typeErrors).toEqual([]);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).not.toContain(DECLARATIONS[name]);
    expect(lint('incompatible-action-features', suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, a LoadPages declared in another file is known by its methods.')
  .given('An action that extends a base class of another file, and declares the LoadPages methods.')
  .and('It has ignoreOld.')
  .when('The code is linted without type information.')
  .then('There is an error in ignoreOld.')
  .run(async (_) => {
    const code = `import { Pages } from 'kiss-for-react';
import { BaseLoadPages, State } from './base';

declare function loadTodos(after: number): Promise<string[]>;

class LoadTodos extends BaseLoadPages {
  ignoreOld = true;${loadPagesMethods}
}
`;
    const result = lint('incompatible-action-features', code, {types: false});
    expect(result.messages.map((m) => m.text)).toEqual(['ignoreOld']);
    expect(result.messages[0].message).toContain('A `LoadPages` can\'t use `ignoreOld`.');
  });

// ---------------------------------------------------------------------------------------------
// missing-super-in-override

Bdd(feature)
  .scenario('Overriding reduce in a LoadPages is an error.')
  .given('An action that extends LoadPages {Where}, and overrides reduce.')
  .when('The code is linted.')
  .then('There is an error in reduce.')
  .example(val('Where', 'directly'), val('Type information', true))
  .example(val('Where', 'directly'), val('Type information', false))
  .example(val('Where', 'through a base class of the same file'), val('Type information', true))
  .example(val('Where', 'through a base class of the same file'), val('Type information', false))
  .run(async (ctx) => {
    const direct = ctx.example.val('Where') === 'directly';
    const base = direct ? '' : `
abstract class BaseLoad<St, Page, Param> extends LoadPages<St, Page, Param> {}
`;
    const code = `${base}${loadTodos(`
  async reduce() { return null; }`, direct ? 'LoadPages<State, string[], number>' : 'BaseLoad<State, string[], number>')}`;
    const result = lint('missing-super-in-override', code, {types: ctx.example.val('Type information') as boolean});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    expect(result.messages[0].message).toContain('Don\'t override `reduce` in a `LoadPages`');
  });

Bdd(feature)
  .scenario('In a LoadPages, an override that turns off its loading rules is an error.')
  .given('A LoadPages with {Override}.')
  .when('The code is linted, with or without type information.')
  .then('There is an error in {Member}, which says: {Message}')
  .example(
    val('Override', 'an abortDispatch that does not call super.abortDispatch()'),
    val('Code', 'abortDispatch() { return this.state.todos === null; }'),
    val('Member', 'abortDispatch'),
    val('Message', 'doesn\'t call `super.abortDispatch()`'))
  .example(
    val('Override', 'an ignoreFresh getter that does not read super.ignoreFresh'),
    val('Code', 'get ignoreFresh() { return this.force; }\n  force = false;'),
    val('Member', 'ignoreFresh'),
    val('Message', 'doesn\'t read `super.ignoreFresh`, so a `\'next\'` or `\'previous\'` of this `LoadPages` is aborted while the list is fresh'))
  .example(
    val('Override', 'an ignoreThrottle getter that does not read super.ignoreThrottle'),
    val('Code', 'get ignoreThrottle() { return true; }'),
    val('Member', 'ignoreThrottle'),
    val('Message', 'doesn\'t read `super.ignoreThrottle`, so a `\'next\'` or `\'previous\'` of this `LoadPages` is aborted while the list is throttled'))
  .example(
    val('Override', 'a statusKey getter'),
    val('Code', 'get statusKey() { return \'todos\'; }'),
    val('Member', 'statusKey'),
    val('Message', 'Don\'t override `statusKey` in a `LoadPages`'))
  .run(async (ctx) => {
    const code = loadTodos(`\n  ${ctx.example.val('Code')}`);
    for (const types of [true, false]) {
      const result = lint('missing-super-in-override', code, {types});
      expect(result.typeErrors).toEqual([]);
      expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Member')]);
      expect(result.messages[0].message).toContain(ctx.example.val('Message'));
    }
  });

Bdd(feature)
  .scenario('In a LoadPages, overrides that keep its loading rules are fine.')
  .given('A LoadPages with {Override}.')
  .when('The code is linted, with or without type information.')
  .then('There are no errors.')
  .example(
    val('Override', 'an abortDispatch that calls super.abortDispatch()'),
    val('Code', 'abortDispatch() { return super.abortDispatch() || this.state.todos === null; }'))
  .example(
    val('Override', 'an ignoreFresh getter that reads super.ignoreFresh'),
    val('Code', 'get ignoreFresh() { return this.force || super.ignoreFresh; }\n  force = false;'))
  .example(
    val('Override', 'pagesKeyParams, instead of statusKey'),
    val('Code', 'pagesKeyParams() { return \'todos\'; }'))
  .example(
    val('Override', 'the same overrides, in an action that is not a LoadPages'),
    val('Code', ''))
  .run(async (ctx) => {
    const isLoadPages = ctx.example.val('Code') !== '';
    const code = isLoadPages
      ? loadTodos(`\n  ${ctx.example.val('Code')}`)
      : `${prelude}
class LoadText extends KissAction<State> {
  abortDispatch() { return this.state.todos === null; }
  get ignoreFresh() { return true; }
  get statusKey() { return 'text'; }
  reduce() { return null; }
}
`;
    for (const types of [true, false]) {
      const result = lint('missing-super-in-override', code, {types});
      expect(result.typeErrors).toEqual([]);
      expect(result.messages).toEqual([]);
    }
  });

// ---------------------------------------------------------------------------------------------
// missing-key-params

Bdd(feature)
  .scenario('A LoadPages with fields, without pagesKeyParams, is a warning.')
  .given('A subclass of LoadPages with the field postId, that doesn\'t override pagesKeyParams.')
  .when('The code is linted.')
  .then('There is a warning in the class name.')
  .and('The suggestion overrides pagesKeyParams, returning the field, and the code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = loadTodos(`
  constructor(readonly postId: string, which: PagesToLoad = 'refresh') { super(which); }`);
    const result = lint('missing-key-params', code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['LoadTodos']);
    expect(result.messages[0].message).toContain('`LoadTodos` has fields, but its pages key doesn\'t depend on them.');
    expect(result.messages[0].suggestions).toEqual(['Override `pagesKeyParams()`, returning `this.postId`.']);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`  constructor(readonly postId: string, which: PagesToLoad = 'refresh') { super(which); }

  pagesKeyParams() { return this.postId; }
`);
    expect(lint('missing-key-params', suggested).typeErrors).toEqual([]);
    expect(lint('missing-key-params', suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('LoadPages actions that are not reported by missing-key-params.')
  .given('{Case}.')
  .when('The code is linted, with or without type information.')
  .then('There is no warning.')
  .example(val('Case', 'A LoadPages without fields (maxPages and which are not fields)'), val('Code', `
  constructor(which: PagesToLoad = 'refresh') { super(which); }
  maxPages = 5;`))
  .example(val('Case', 'A LoadPages with a field, that overrides pagesKeyParams'), val('Code', `
  constructor(readonly postId: string) { super(); }
  pagesKeyParams() { return this.postId; }`))
  .run(async (ctx) => {
    const code = loadTodos(ctx.example.val('Code') as string);
    for (const types of [true, false]) {
      const result = lint('missing-key-params', code, {types});
      expect(result.typeErrors).toEqual([]);
      expect(result.messages).toEqual([]);
    }
  });

// ---------------------------------------------------------------------------------------------
// retry-without-non-reentrant, lifecycle-method-call, and the naming rules

Bdd(feature)
  .scenario('A LoadPages with retry is not reported by retry-without-non-reentrant.')
  .given('A LoadPages with retry, which already runs one load per list at a time, and can\'t use nonReentrant.')
  .when('The code is linted, with or without type information.')
  .then('There is no warning.')
  .run(async (_) => {
    const code = loadTodos('\n  retry = { maxRetries: 5 };');
    for (const types of [true, false]) {
      const result = lint('retry-without-non-reentrant', code, {types});
      expect(result.typeErrors).toEqual([]);
      expect(result.messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Calling a LoadPages method from outside the action is reported by lifecycle-method-call.')
  .given('Code outside the action that calls its {Method} method.')
  .when('The code is linted, with or without type information.')
  .then('There is an error in {Method}, which says to dispatch the action instead.')
  .example(val('Method', 'loadPage'), val('Code', 'new LoadTodos().loadPage(0);'))
  .example(val('Method', 'nextPageParam'), val('Code', 'const action = new LoadTodos(); action.nextPageParam([]);'))
  .example(val('Method', 'pagesKeyParams'), val('Code', 'new LoadTodos().pagesKeyParams();'))
  .run(async (ctx) => {
    const method = ctx.example.val('Method') as string;
    const code = `${loadTodos('')}
export function run() {
  ${ctx.example.val('Code')}
}
`;
    for (const types of [true, false]) {
      const result = lint('lifecycle-method-call', code, {types});
      expect(result.messages.map((m) => m.text)).toEqual([method]);
      expect(result.messages[0].message).toContain('dispatch the action');
    }
  });

Bdd(feature)
  .scenario('A LoadPages is a concrete action for the naming rules, even without type information.')
  .given('A LoadPages called LoadTodos, which doesn\'t declare reduce.')
  .when('The code is linted with action-name-ends-with-action, without type information.')
  .then('The name is reported, since the action can be dispatched.')
  .run(async (_) => {
    const result = lint('action-name-ends-with-action', loadTodos(''), {types: false});
    expect(result.messages.map((m) => m.text)).toEqual(['LoadTodos']);
  });

// ---------------------------------------------------------------------------------------------
// Runtime: the store's own checks, to keep the lint in sync with it.

class RuntimeState {
  constructor(readonly todos: Pages<string[], number> | null = null) {}
}

class RuntimeLoadPages extends LoadPages<RuntimeState, string[], number> {
  createPollingAction() { return new RuntimeLoadPages('refresh'); }
  protected hasInternet(): Promise<boolean> { return Promise.resolve(true); }
  getPagesFromState(state: RuntimeState) { return state.todos; }
  applyPagesToState(state: RuntimeState, todos: Pages<string[], number>) { return new RuntimeState(todos); }
  initialPageParam() { return 0; }
  async loadPage() { return []; }
  nextPageParam() { return null; }
}

/** Turns the feature on, in the action, the same way the lint test code does. */
function turnOn(action: KissAction<RuntimeState>, name: string): void {
  const values: Record<string, unknown> = {
    nonReentrant: true,
    retry: {on: true},
    checkInternet: {dialog: false},
    debounce: 300,
    throttle: 1000,
    fresh: 1000,
    sequential: true,
    poll: Poll.once,
    unlimitedRetryCheckInternet: true,
    ignoreOld: true,
  };
  (action as any)[name] = values[name];
}

/** True if dispatching the action with the feature throws a `StoreException`. */
function dispatchThrows(action: KissAction<RuntimeState>, name: string): boolean {
  turnOn(action, name);
  jest.useFakeTimers();
  const store = new Store<RuntimeState>({initialState: new RuntimeState(), logger: null});
  try {
    store.dispatch(action);
    return false;
  } catch (error) {
    if (!(error instanceof StoreException)) throw error;
    return true;
  } finally {
    store.setShutDown(true);
    jest.clearAllTimers();
    jest.useRealTimers();
  }
}
