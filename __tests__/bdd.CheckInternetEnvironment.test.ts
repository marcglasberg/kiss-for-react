import { afterEach, beforeEach, expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Check internet in different environments');

const g = globalThis as any;
let savedWindow: PropertyDescriptor | undefined;
let savedNavigator: PropertyDescriptor | undefined;

beforeEach(() => {
  savedWindow = Object.getOwnPropertyDescriptor(g, 'window');
  savedNavigator = Object.getOwnPropertyDescriptor(g, 'navigator');
});

afterEach(() => {
  restore('window', savedWindow);
  restore('navigator', savedNavigator);
});

Bdd(feature)
  .scenario('In React Native, the default internet check assumes the device is online.')
  .given('A React Native environment, which has `window` and `navigator`, but no `navigator.onLine`.')
  .and('An action with checkInternet turned on, and no hasInternet override.')
  .when('The action is dispatched.')
  .then('The action completes successfully.')
  .and('The state is changed by the reducer.')
  .run(async (_) => {
    setGlobals(g, { product: 'ReactNative' });

    const store = new Store<number>({ initialState: 0 });
    const action = new Increment();
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state).toBe(1);
  });

Bdd(feature)
  .scenario('In the browser, the default internet check uses navigator.onLine.')
  .given('A browser environment where navigator.onLine is a boolean.')
  .and('An action with checkInternet turned on, and no hasInternet override.')
  .when('The action is dispatched.')
  .then('It succeeds when online, and fails with "No Internet" when offline.')
  .example(val('onLine', true), val('succeeds', true))
  .example(val('onLine', false), val('succeeds', false))
  .run(async (ctx) => {
    setGlobals({}, { onLine: ctx.example.val('onLine') });

    const store = new Store<number>({ initialState: 0 });
    const action = new Increment();
    await store.dispatchAndWait(action);

    if (ctx.example.val('succeeds')) {
      expect(action.status.isCompletedOk).toBe(true);
      expect(store.state).toBe(1);
    } else {
      expect(action.status.isCompletedFailed).toBe(true);
      expect(action.status.originalError).toBeInstanceOf(UserException);
      expect((action.status.originalError as UserException).message).toBe('No Internet');
      expect(store.state).toBe(0);
    }
  });

Bdd(feature)
  .scenario('Without a window object, the default internet check assumes the device is online.')
  .given('An environment with no `window`, like Node.js.')
  .and('An action with checkInternet turned on, and no hasInternet override.')
  .when('The action is dispatched.')
  .then('The action completes successfully.')
  .run(async (_) => {
    define('window', undefined);

    const store = new Store<number>({ initialState: 0 });
    const action = new Increment();
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state).toBe(1);
  });

class Increment extends KissAction<number> {
  checkInternet = { dialog: false };

  reduce() {
    return this.state + 1;
  }
}

function setGlobals(window: any, navigator: any) {
  define('window', window);
  define('navigator', navigator);
  if (window !== g) window.navigator = navigator;
}

function define(name: string, value: any) {
  Object.defineProperty(g, name, { value, configurable: true, writable: true, enumerable: true });
}

function restore(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(g, name, descriptor);
  else delete g[name];
}
