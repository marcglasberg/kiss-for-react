/**
 * @jest-environment jsdom
 */
import { afterEach, expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { Store } from '../src';

reporter(new FeatureFileReporter());

// The default sources, in the browser (jsdom): `document.visibilityState` with the
// `visibilitychange` event, and `navigator.onLine` with the `online` and `offline` events.

const feature = new Feature('App focus and online signals in the browser');

let visibilityState: DocumentVisibilityState = 'visible';
let onLine = true;

Object.defineProperty(document, 'visibilityState', { get: () => visibilityState, configurable: true });
Object.defineProperty(navigator, 'onLine', { get: () => onLine, configurable: true });

afterEach(() => {
  visibilityState = 'visible';
  onLine = true;
});

Bdd(feature)
  .scenario('In the browser, the store is focused when the document is visible.')
  .given('A browser where the document is visible, or hidden.')
  .when('The store is created and isFocused is read.')
  .then('It is true when the document is visible, and false when hidden.')
  .run(async (_) => {
    visibilityState = 'hidden';
    let store = createStore();
    expect(store.isFocused).toBe(false);
    await store.dispose();

    visibilityState = 'visible';
    store = createStore();
    expect(store.isFocused).toBe(true);
    await store.dispose();
  });

Bdd(feature)
  .scenario('In the browser, the store follows the visibilitychange event.')
  .given('A store in a visible document, with a focus listener.')
  .when('The document becomes hidden, and then visible again.')
  .then('isFocused follows, and the listener is notified each time.')
  .run(async (_) => {
    const store = createStore();
    const notifications: boolean[] = [];
    store._subscribeFocus(() => notifications.push(store.isFocused));
    expect(store.isFocused).toBe(true);

    hide();
    expect(store.isFocused).toBe(false);
    expect(notifications).toEqual([false]);

    show();
    expect(store.isFocused).toBe(true);
    expect(notifications).toEqual([false, true]);

    await store.dispose();
  });

Bdd(feature)
  .scenario('In the browser, the store is online when navigator.onLine is true.')
  .given('A browser where navigator.onLine is true, or false.')
  .when('The store is created and isOnline is read.')
  .then('It has the value of navigator.onLine.')
  .run(async (_) => {
    onLine = false;
    let store = createStore();
    expect(store.isOnline).toBe(false);
    await store.dispose();

    onLine = true;
    store = createStore();
    expect(store.isOnline).toBe(true);
    await store.dispose();
  });

Bdd(feature)
  .scenario('In the browser, the store follows the online and offline events.')
  .given('A store in an online browser, with an online listener.')
  .when('The browser goes offline, and then online again.')
  .then('isOnline follows, and the listener is notified each time.')
  .run(async (_) => {
    const store = createStore();
    const notifications: boolean[] = [];
    store._subscribeOnline(() => notifications.push(store.isOnline));
    expect(store.isOnline).toBe(true);

    goOffline();
    expect(store.isOnline).toBe(false);
    expect(notifications).toEqual([false]);

    goOnline();
    expect(store.isOnline).toBe(true);
    expect(notifications).toEqual([false, true]);

    await store.dispose();
  });

Bdd(feature)
  .scenario('A disposed store stops listening to the browser events.')
  .given('A store that was listening to the focus and online events.')
  .when('The store is disposed, and the events fire.')
  .then('The store keeps its last values, and does not notify.')
  .run(async (_) => {
    const store = createStore();
    let count = 0;
    store._subscribeFocus(() => count++);
    store._subscribeOnline(() => count++);
    expect(store.isFocused).toBe(true);
    expect(store.isOnline).toBe(true);

    await store.dispose();
    hide();
    goOffline();

    expect(store.isFocused).toBe(true);
    expect(store.isOnline).toBe(true);
    expect(count).toBe(0);
  });

Bdd(feature)
  .scenario('Setting a signal by hand stops listening to the browser events.')
  .given('A store in a visible document.')
  .when('setFocused(false) is called, and the document becomes visible again.')
  .then('isFocused stays false.')
  .and('After setFocused(null), it follows the document again.')
  .run(async (_) => {
    const store = createStore();
    expect(store.isFocused).toBe(true);

    store.setFocused(false);
    show();
    expect(store.isFocused).toBe(false);

    store.setFocused(null);
    expect(store.isFocused).toBe(true);
    hide();
    expect(store.isFocused).toBe(false);

    await store.dispose();
  });

// ---------------------------------------------------------------------------------------------

function createStore(): Store<number> {
  return new Store<number>({ initialState: 0, logger: () => {} });
}

function hide() {
  visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
}

function show() {
  visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
}

function goOffline() {
  onLine = false;
  window.dispatchEvent(new Event('offline'));
}

function goOnline() {
  onLine = true;
  window.dispatchEvent(new Event('online'));
}
