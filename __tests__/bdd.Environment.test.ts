import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import {
  createStore,
  KissAction,
  Persistor,
  Store,
  StoreProvider,
  useConfiguration,
  useEnvironment,
  useSelect,
} from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Environment, dependencies and configuration');

// ==========================================================================
// The app's types.
// ==========================================================================

class State {
  constructor(readonly user: string, readonly count: number = 0) {
  }

  copy(changes: Partial<State>): State {
    return Object.assign(new State(this.user, this.count), changes);
  }

  toString() {
    return `State(${this.user}, ${this.count})`;
  }
}

enum Environment {
  production = 'production',
  testing = 'testing',
}

class Config {
  constructor(readonly showAdminConsole: boolean = false) {
  }
}

// An API client. The real one would call the server; this one records its calls.
class FakeApi {
  calls: number[] = [];

  async loadUser(id: number): Promise<string> {
    this.calls.push(id);
    await delayMillis(5);
    return `User ${id}`;
  }
}

class Dependencies {
  constructor(readonly api: FakeApi = new FakeApi()) {
  }
}

// The app's base action, with typed getters, as the docs recommend.
abstract class Action extends KissAction<State> {
  get env(): Environment {
    return this.store.environment as Environment;
  }

  get deps(): Dependencies {
    return this.store.dependencies as Dependencies;
  }

  get config(): Config {
    return this.store.configuration as Config;
  }
}

// Loads the user with the injected API client.
class LoadUser extends Action {
  constructor(readonly id: number) {
    super();
  }

  async reduce() {
    const user = await this.deps.api.loadUser(this.id);
    return (state: State) => state.copy({ user });
  }
}

// Adds 1 to the count.
class Increment extends Action {
  reduce() {
    return this.state.copy({ count: this.state.count + 1 });
  }
}

// Throws an error.
class Fail extends Action {
  reduce(): null {
    throw new Error('Failed');
  }
}

// An object that can be disposed with the TC39 explicit resource management protocol.
class Disposable {
  disposed = 0;

  constructor(readonly name: string = '', readonly log: string[] = []) {
  }

  [Symbol.dispose]() {
    this.disposed++;
    this.log.push(this.name);
  }
}

// An object that can be disposed asynchronously.
class AsyncDisposable {
  disposed = 0;
  finished = false;

  async [Symbol.asyncDispose]() {
    this.disposed++;
    await delayMillis(20);
    this.finished = true;
  }
}

// An object with a `dispose()` method.
class WithDisposeMethod {
  disposed = 0;

  dispose() {
    this.disposed++;
  }
}

// A persistor whose `readState` fails.
class FailingPersistor extends Persistor<State> {
  constructor(readonly error: Error) {
    super();
  }

  async readState(): Promise<State | null> {
    throw this.error;
  }

  async deleteState(): Promise<void> {
  }

  async persistDifference(_lastPersistedState: State | null, _newState: State): Promise<void> {
  }
}

function newStore(params: Partial<Parameters<typeof createStore<State>>[0]> = {}): Store<State> {
  return createStore<State>({ initialState: new State('nobody'), logger: null, ...params });
}

// ==========================================================================
// The store.
// ==========================================================================

Bdd(feature)
  .scenario('The store gives access to the environment, the dependencies and the configuration it was created with.')
  .given('A store created with an environment, a configuration factory and a dependencies factory.')
  .when('The environment, the configuration and the dependencies are read from the store.')
  .then('They are the environment, and the objects the factories returned.')
  .and('Reading them again gives the same objects.')
  .run(async (_) => {
    const config = new Config(true);
    const deps = new Dependencies();

    const store = newStore({
      environment: Environment.production,
      configuration: () => config,
      dependencies: () => deps,
    });

    expect(store.environment).toBe(Environment.production);
    expect(store.configuration).toBe(config);
    expect(store.dependencies).toBe(deps);

    expect(store.configuration).toBe(config);
    expect(store.dependencies).toBe(deps);
  });

Bdd(feature)
  .scenario('A store created without them has them undefined.')
  .given('A store created with only the initial state.')
  .when('The environment, the configuration and the dependencies are read from the store.')
  .then('They are all undefined.')
  .run(async (_) => {
    const store = newStore();
    expect(store.environment).toBeUndefined();
    expect(store.configuration).toBeUndefined();
    expect(store.dependencies).toBeUndefined();
  });

Bdd(feature)
  .scenario('The factories get the store, and the configuration is created before the dependencies.')
  .given('A store created with an environment, a configuration factory and a dependencies factory.')
  .when('The store is created.')
  .then('The configuration factory gets the store, and can read its environment and its state.')
  .and('The dependencies factory gets the store, and can read its environment and its configuration.')
  .and('Each factory is called once.')
  .run(async (_) => {
    const log: string[] = [];

    const store = newStore({
      initialState: new State('initial'),
      environment: Environment.testing,
      configuration: (store) => {
        log.push(`config: env=${store.environment}, state=${store.state}, deps=${store.dependencies}`);
        return new Config(store.environment === Environment.testing);
      },
      dependencies: (store) => {
        log.push(`deps: env=${store.environment}, config=${(store.configuration as Config).showAdminConsole}`);
        return new Dependencies();
      },
    });

    expect(log).toEqual([
      'config: env=testing, state=State(initial, 0), deps=undefined',
      'deps: env=testing, config=true',
    ]);
    expect((store.configuration as Config).showAdminConsole).toBe(true);
    expect(store.dependencies).toBeInstanceOf(Dependencies);
  });

Bdd(feature)
  .scenario('A factory that throws makes the store creation fail.')
  .given('A dependencies factory that throws.')
  .when('The store is created.')
  .then('The error is thrown by the store creation.')
  .run(async (_) => {
    const error = new Error('No database');
    expect(() => newStore({ dependencies: () => { throw error; } })).toThrow(error);
    expect(() => newStore({ configuration: () => { throw error; } })).toThrow(error);
  });

Bdd(feature)
  .scenario('The dependencies are available to the errorObserver while the persisted state is read.')
  .given('A store with a dependencies factory, a persistor that fails to read the state, and an errorObserver.')
  .when('The store is created, and the persistor fails.')
  .then('The errorObserver gets the error, and can read the dependencies from the store.')
  .run(async (_) => {
    const error = new Error('Read failed');
    const observed: unknown[] = [];

    const store = newStore({
      persistor: new FailingPersistor(error),
      dependencies: () => new Dependencies(),
      errorObserver: ({ store }) => {
        observed.push(store.dependencies);
        return null; // Swallows the error.
      },
    });
    await store.ready();

    expect(observed.length).toBe(1);
    expect(observed[0]).toBe(store.dependencies);
    expect(observed[0]).toBeInstanceOf(Dependencies);
  });

// ==========================================================================
// In actions.
// ==========================================================================

Bdd(feature)
  .scenario('Actions read the environment, the dependencies and the configuration through the store, with typed getters in the base action.')
  .given('A base action with typed getters for the environment, the dependencies and the configuration.')
  .and('A store with an injected API client.')
  .when('An action that loads the user with the API client is dispatched.')
  .then('The action used the injected API client, and put the result in the state.')
  .run(async (_) => {
    const api = new FakeApi();
    const store = newStore({
      environment: Environment.testing,
      configuration: () => new Config(true),
      dependencies: () => new Dependencies(api),
    });

    await store.dispatchAndWait(new LoadUser(42));

    expect(api.calls).toEqual([42]);
    expect(store.state.user).toBe('User 42');
  });

Bdd(feature)
  .scenario('Each store has its own dependencies, so a fake with internal state does not leak from one test to the next.')
  .given('Two stores, each created with its own fake API client.')
  .when('An action that uses the API client is dispatched twice in the first store.')
  .then('The first store\'s fake recorded the calls, and the second store\'s fake recorded none.')
  .and('The dependencies of the two stores are different objects.')
  .run(async (_) => {
    const store1 = newStore({ dependencies: () => new Dependencies() });
    const store2 = newStore({ dependencies: () => new Dependencies() });

    await store1.dispatchAndWait(new LoadUser(1));
    await store1.dispatchAndWait(new LoadUser(2));

    expect((store1.dependencies as Dependencies).api.calls).toEqual([1, 2]);
    expect((store2.dependencies as Dependencies).api.calls).toEqual([]);
    expect(store1.dependencies).not.toBe(store2.dependencies);
  });

Bdd(feature)
  .scenario('The errorObserver can read the environment, to handle errors differently in production and in tests.')
  .given('An errorObserver that sends the errors to a monitoring service only in production.')
  .and('A store in production, and a store in testing, both with that errorObserver.')
  .when('An action fails in each store.')
  .then('Only the error of the production store is sent to the monitoring service.')
  .run(async (_) => {
    const monitoring: string[] = [];
    const errorObserver = ({ error, store }: { error: any, store: Store<State> }) => {
      if (store.environment === Environment.production) monitoring.push(String(error));
      return null; // Swallows the error.
    };

    const production = newStore({ environment: Environment.production, errorObserver });
    const testing = newStore({ environment: Environment.testing, errorObserver });

    await production.dispatchAndWait(new Fail());
    expect(monitoring).toEqual(['Error: Failed']);

    await testing.dispatchAndWait(new Fail());
    expect(monitoring).toEqual(['Error: Failed']);
  });

// ==========================================================================
// logOut and clearInternalActionProps.
// ==========================================================================

Bdd(feature)
  .scenario('logOut and clearInternalActionProps keep the environment, the dependencies and the configuration.')
  .given('A store with an environment, disposable dependencies and a disposable configuration.')
  .when('logOut is called, disposing the props, and clearInternalActionProps is called.')
  .then('The environment, the dependencies and the configuration are the same, and were not disposed.')
  .run(async (_) => {
    const deps = new Disposable();
    const config = new Disposable();
    const store = newStore({
      environment: Environment.production,
      configuration: () => config,
      dependencies: () => deps,
    });

    await store.logOut({ initialState: new State('nobody'), throttle: 0, actionsThrottle: 0, disposeProps: true });
    store.clearInternalActionProps();

    expect(store.environment).toBe(Environment.production);
    expect(store.configuration).toBe(config);
    expect(store.dependencies).toBe(deps);
    expect(deps.disposed).toBe(0);
    expect(config.disposed).toBe(0);
  });

// ==========================================================================
// Disposing the store.
// ==========================================================================

Bdd(feature)
  .scenario('Disposing the store disposes the dependencies and the configuration, after the props.')
  .given('A store with a disposable prop, disposable dependencies and a disposable configuration.')
  .when('The store is disposed.')
  .then('The prop is disposed first, then the dependencies, then the configuration.')
  .and('The dependencies and the configuration can still be read from the store.')
  .run(async (_) => {
    const log: string[] = [];
    const deps = new Disposable('dependencies', log);
    const config = new Disposable('configuration', log);
    const store = newStore({
      configuration: () => config,
      dependencies: () => deps,
    });
    store.setProp('socket', new Disposable('prop', log));

    await store.dispose();

    expect(log).toEqual(['prop', 'dependencies', 'configuration']);
    expect(store.dependencies).toBe(deps);
    expect(store.configuration).toBe(config);
  });

Bdd(feature)
  .scenario('The dependencies and the configuration are disposed with Symbol.dispose, Symbol.asyncDispose, or a dispose method.')
  .given('A store whose dependencies and configuration can be disposed in the given way.')
  .when('The store is disposed, and the returned promise is awaited.')
  .then('Both are disposed once, and the async disposals have finished.')
  .example(val('Way', 'Symbol.dispose'))
  .example(val('Way', 'Symbol.asyncDispose'))
  .example(val('Way', 'dispose()'))
  .run(async (ctx) => {
    const way = ctx.example.val('Way') as string;
    const create = () => (way === 'Symbol.dispose') ? new Disposable()
      : (way === 'Symbol.asyncDispose') ? new AsyncDisposable()
        : new WithDisposeMethod();

    const deps = create();
    const config = create();
    const store = newStore({ configuration: () => config, dependencies: () => deps });

    await store.dispose();

    expect(deps.disposed).toBe(1);
    expect(config.disposed).toBe(1);
    if (deps instanceof AsyncDisposable && config instanceof AsyncDisposable) {
      expect(deps.finished).toBe(true);
      expect(config.finished).toBe(true);
    }
  });

Bdd(feature)
  .scenario('Dependencies and a configuration that cannot be disposed are left alone.')
  .given('A store whose dependencies and configuration are plain objects, without any dispose method.')
  .when('The store is disposed.')
  .then('Nothing happens to them, and dispose finishes without errors.')
  .run(async (_) => {
    const observed: unknown[] = [];
    const deps = { api: new FakeApi() };
    const config = { flag: true };
    const store = newStore({
      configuration: () => config,
      dependencies: () => deps,
      errorObserver: ({ error }) => { observed.push(error); return error; },
    });

    await expect(store.dispose()).resolves.toBeUndefined();

    expect(observed).toEqual([]);
    expect(store.dependencies).toBe(deps);
    expect(store.configuration).toBe(config);

    // Also for a store without them.
    await expect(newStore().dispose()).resolves.toBeUndefined();
  });

Bdd(feature)
  .scenario('A failing disposal of the dependencies does not make dispose fail, and the configuration is still disposed.')
  .given('A store with an errorObserver, dependencies whose disposal fails, and a disposable configuration.')
  .when('The store is disposed.')
  .then('The returned promise resolves.')
  .and('The error is given to the errorObserver, with a null action.')
  .and('The configuration is disposed.')
  .example(val('Failure', 'throws'))
  .example(val('Failure', 'rejects'))
  .run(async (ctx) => {
    const rejects = ctx.example.val('Failure') === 'rejects';
    const observed: any[] = [];
    const error = new Error('Dispose failed');
    const config = new Disposable();
    const deps = rejects
      ? { async dispose() { await delayMillis(5); throw error; } }
      : { dispose() { throw error; } };

    const store = newStore({
      configuration: () => config,
      dependencies: () => deps,
      errorObserver: (params) => { observed.push(params); return null; },
    });

    await expect(store.dispose()).resolves.toBeUndefined();

    expect(observed.length).toBe(1);
    expect(observed[0].error).toBe(error);
    expect(observed[0].action).toBeNull();
    expect(config.disposed).toBe(1);
  });

Bdd(feature)
  .scenario('Disposing the store twice disposes the dependencies and the configuration only once.')
  .given('A store with disposable dependencies and configuration.')
  .when('The store is disposed twice.')
  .then('Each is disposed once.')
  .run(async (_) => {
    const deps = new Disposable();
    const config = new Disposable();
    const store = newStore({ configuration: () => config, dependencies: () => deps });

    await store.dispose();
    await store.dispose();

    expect(deps.disposed).toBe(1);
    expect(config.disposed).toBe(1);
  });

Bdd(feature)
  .scenario('A store declared with `await using` disposes its dependencies at the end of the block.')
  .given('A test that creates a store with `await using`, with async disposable dependencies.')
  .when('The block ends.')
  .then('The dependencies are disposed, and their async disposal has finished.')
  .run(async (_) => {
    const deps = new AsyncDisposable();

    {
      await using store = newStore({ dependencies: () => deps });
      await store.dispatchAndWait(new Increment());
      expect(deps.disposed).toBe(0);
    }

    expect(deps.disposed).toBe(1);
    expect(deps.finished).toBe(true);
  });

// ==========================================================================
// In components.
// ==========================================================================

Bdd(feature)
  .scenario('Components read the environment and the configuration with useEnvironment and useConfiguration.')
  .given('A store with an environment and a configuration.')
  .and('A component that shows them, using useEnvironment and useConfiguration.')
  .when('The component renders.')
  .then('It shows the environment and the configuration of the store.')
  .run(async (_) => {
    const store = newStore({
      environment: Environment.production,
      configuration: () => new Config(true),
    });

    const Comp: React.FC = () => {
      const env = useEnvironment<Environment>();
      const config = useConfiguration<Config>();
      return React.createElement('div', null, `${env}/${config.showAdminConsole}`);
    };

    const renderer = await render(store, Comp);
    expect(text(renderer)).toBe('production/true');
  });

Bdd(feature)
  .scenario('useEnvironment and useConfiguration do not re-render the component when the state changes.')
  .given('A component that uses useEnvironment and useConfiguration, but not the state.')
  .when('The state changes, several times.')
  .then('The component does not render again.')
  .and('A component that also uses the state renders again, as usual.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = newStore({ environment: Environment.testing, configuration: () => new Config() });
    let envRenders = 0;
    let stateRenders = 0;

    const EnvComp: React.FC = () => {
      envRenders++;
      useEnvironment();
      useConfiguration();
      return null;
    };

    const StateComp: React.FC = () => {
      stateRenders++;
      useSelect((state: State) => state.count);
      return null;
    };

    const Parent: React.FC = () => React.createElement(React.Fragment, null,
      React.createElement(EnvComp), React.createElement(StateComp));

    await render(store, Parent, strictMode);
    const envRendersAfterMount = envRenders;
    const stateRendersAfterMount = stateRenders;
    expect(envRendersAfterMount).toBeGreaterThan(0);

    await act(async () => {
      await store.dispatchAndWait(new Increment());
      await store.dispatchAndWait(new Increment());
    });
    await flush();

    expect(store.state.count).toBe(2);
    expect(envRenders).toBe(envRendersAfterMount);
    expect(stateRenders).toBeGreaterThan(stateRendersAfterMount);
  });

Bdd(feature)
  .scenario('useEnvironment and useConfiguration must be used within a StoreProvider.')
  .given('Components that use useEnvironment or useConfiguration, rendered without a StoreProvider.')
  .when('The components render.')
  .then('They throw.')
  .run(async (_) => {
    const EnvComp: React.FC = () => {
      useEnvironment();
      return null;
    };
    const ConfigComp: React.FC = () => {
      useConfiguration();
      return null;
    };

    const errors = silenceReactErrors();
    try {
      expect(() => act(() => {
        TestRenderer.create(React.createElement(EnvComp));
      })).toThrow('useStore must be used within a StoreProvider');

      expect(() => act(() => {
        TestRenderer.create(React.createElement(ConfigComp));
      })).toThrow('useStore must be used within a StoreProvider');
    } finally {
      errors.restore();
    }
  });

// ==========================================================================
// Helpers.
// ==========================================================================

function element<P extends object>(store: Store<State>, Comp: React.FC<P>, props: P, strictMode: boolean) {
  const provider = React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp, props) });
  return strictMode ? React.createElement(React.StrictMode, null, provider) : provider;
}

async function render<P extends object>(store: Store<State>, Comp: React.FC<P>, strictMode = false, props: P = {} as P) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element(store, Comp, props, strictMode));
  });
  await flush();
  return renderer;
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

// The text rendered by the component.
function text(renderer: ReactTestRenderer): string {
  const json = renderer.toJSON();
  if (json === null || Array.isArray(json)) return '';
  return (json.children ?? []).map(String).join('');
}

// React logs the errors thrown during render to the console. Silences them during the test.
function silenceReactErrors() {
  const error = console.error;
  console.error = () => {};
  return { restore: () => (console.error = error) };
}
