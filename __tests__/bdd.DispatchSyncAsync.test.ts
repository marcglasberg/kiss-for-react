import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, StoreException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('dispatchSync of an async action');

// Collects the unhandled rejections that happen while `fn` runs (and a bit after).
async function collectUnhandledRejections(fn: () => void): Promise<any[]> {
  const unhandled: any[] = [];
  const listener = (e: any) => unhandled.push(e);
  const old = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', listener);
  try {
    fn();
    await delayMillis(30);
  } finally {
    process.removeListener('unhandledRejection', listener);
    old.forEach(l => process.on('unhandledRejection', l as any));
  }
  return unhandled;
}

Bdd(feature)
  .scenario('dispatchSync of an action with an async reducer that fails throws, and the error does not go unhandled.')
  .given('An action whose async reducer fails.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('There is no unhandled rejection.')
  .and('The reducer error is logged.')
  .run(async (_) => {
    const logs: any[] = [];
    const store = new Store<number>({initialState: 0, logger: (obj: any) => logs.push(obj)});

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        throw new Error('async reduce boom');
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new A());
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(StoreException);
    expect(unhandled).toEqual([]);
    expect(logs.some(l => String(l).includes('async reduce boom'))).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchSync of an action with an async before that fails throws, and the error does not go unhandled.')
  .given('An action whose async before method fails.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('There is no unhandled rejection.')
  .and('The before error is logged.')
  .run(async (_) => {
    const logs: any[] = [];
    const store = new Store<number>({initialState: 0, logger: (obj: any) => logs.push(obj)});

    class A extends KissAction<number> {
      async before(): Promise<void> {
        throw new Error('async before boom');
      }

      reduce() {
        return 1;
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new A());
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(StoreException);
    expect(unhandled).toEqual([]);
    expect(logs.some(l => String(l).includes('async before boom'))).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchSync of an action with an async reducer that succeeds does not change the state.')
  .given('An action whose async reducer finishes and returns a new state.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The state stays the same, even after the async reducer finishes.')
  .run(async (_) => {
    const store = new Store<number>({initialState: 0, logger: null});

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        await delayMillis(5);
        return (s) => s + 1;
      }
    }

    expect(() => store.dispatchSync(new A())).toThrow(StoreException);
    await delayMillis(30);
    expect(store.state).toBe(0);
  });

Bdd(feature)
  .scenario('dispatchSync of an action with an async before that succeeds does not run the reducer.')
  .given('An action whose async before method finishes successfully.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The reducer never runs, and the state stays the same.')
  .run(async (_) => {
    const store = new Store<number>({initialState: 0, logger: null});
    let reduceCalled = false;

    class A extends KissAction<number> {
      async before(): Promise<void> {
        await delayMillis(5);
      }

      reduce() {
        reduceCalled = true;
        return 1;
      }
    }

    expect(() => store.dispatchSync(new A())).toThrow(StoreException);
    await delayMillis(30);
    expect(reduceCalled).toBe(false);
    expect(store.state).toBe(0);
  });
