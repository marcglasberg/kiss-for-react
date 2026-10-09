import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/debugObserverInRelease';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: debug-observer-in-release');

const prelude = `import { ClassPersistor, createStore, KissAction, PersistorPrinterDecorator, Store } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
}

declare const persistor: ClassPersistor<State>;
declare const isDev: boolean;
`;

Bdd(feature)
  .scenario('A PersistorPrinterDecorator given to the store is reported.')
  .given('A store whose persistor is a PersistorPrinterDecorator, {Where}.')
  .when('The code is linted.')
  .then('The PersistorPrinterDecorator is reported.')
  .and('The suggestion removes it, keeping the persistor it decorates, and the code compiles.')
  .example(
    val('Where', 'created in the store options'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  persistor: new PersistorPrinterDecorator(persistor),
});
`),
    val('Suggested', `  persistor: persistor,`),
  )
  .example(
    val('Where', 'created in a variable'),
    val('Code', `
const debugPersistor = new PersistorPrinterDecorator<State>(persistor);
const store = new Store<State>({ initialState: new State(0), persistor: debugPersistor });
`),
    val('Suggested', `const debugPersistor = persistor;`),
  )
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    const result = lint(rule, code);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toMatch(/^new PersistorPrinterDecorator/);
    expect(result.messages[0].message).toContain('`PersistorPrinterDecorator` prints all persistence calls');
    expect(result.messages[0].suggestions).toEqual(['Remove the `PersistorPrinterDecorator`, and use the persistor it decorates.']);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(ctx.example.val('Suggested'));
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('An actionObserver or stateObserver that only prints to the console is reported.')
  .given('A store with {Observer}, which only calls console.log.')
  .when('The code is linted (with or without type information).')
  .then('The observer is reported.')
  .and('The suggestion removes it, and the code compiles.')
  .example(
    val('Observer', 'an actionObserver'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  actionObserver: (action, dispatchCount, ini) => console.log(action, dispatchCount, ini),
  logger: null,
});
`),
    val('Text', 'actionObserver: (action, dispatchCount, ini) => console.log(action, dispatchCount, ini)'),
    val('Suggested', `
const store = createStore<State>({
  initialState: new State(0),
  logger: null,
});
`),
    val('Type information', true),
  )
  .example(
    val('Observer', 'a stateObserver declared as a function'),
    val('Code', `
function stateObserver(action: KissAction<State>, prevState: State, newState: State) {
  console.log('Action:', action);
  console.log('State:', prevState, newState);
}

const store = createStore<State>({
  initialState: new State(0),
  stateObserver,
});
`),
    val('Text', 'stateObserver'),
    val('Suggested', `
const store = createStore<State>({
  initialState: new State(0),
});
`),
    val('Type information', false),
  )
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    const types = ctx.example.val('Type information') as boolean;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Text')]);
    expect(result.messages[0].message).toContain('only prints to the console');
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(ctx.example.val('Suggested'));
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Debug tools used only in some conditions, and observers that do more than print, are not reported.')
  .given('{Case}.')
  .when('The code is linted.')
  .then('There are no reports.')
  .example(
    val('Case', 'A PersistorPrinterDecorator in a conditional expression'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  persistor: isDev ? new PersistorPrinterDecorator(persistor) : persistor,
});
`))
  .example(
    val('Case', 'A store with debug tools created inside an if'),
    val('Code', `
function create() {
  if (isDev) {
    return createStore<State>({
      initialState: new State(0),
      persistor: new PersistorPrinterDecorator(persistor),
      actionObserver: (action) => console.log(action),
    });
  }
  return createStore<State>({ initialState: new State(0), persistor });
}
`))
  .example(
    val('Case', 'An actionObserver given only in development'),
    val('Code', `
const store = createStore<State>({
  initialState: new State(0),
  actionObserver: isDev ? (action) => console.log(action) : undefined,
});
`))
  .example(
    val('Case', 'An actionObserver that does more than print'),
    val('Code', `
declare function track(name: string): void;

const store = createStore<State>({
  initialState: new State(0),
  actionObserver: (action, dispatchCount, ini) => {
    console.log(action);
    if (ini) track(action.constructor.name);
  },
});
`))
  .run(async (ctx) => {
    const code = prelude + ctx.example.val('Code');
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Debug tools in tests are not reported.')
  .given('A test file that creates a store with a PersistorPrinterDecorator and a console actionObserver.')
  .when('The code is linted.')
  .then('There are no reports.')
  .run(async (_) => {
    const code = `${prelude}
const store = createStore<State>({
  initialState: new State(0),
  persistor: new PersistorPrinterDecorator(persistor),
  actionObserver: (action) => console.log(action),
});
`;
    expect(lint(rule, code, {filename: '__tests__/store.test.ts'}).messages).toEqual([]);
  });
