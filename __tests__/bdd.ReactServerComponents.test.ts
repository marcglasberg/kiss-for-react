/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions": ["react-server", "node", "node-addons"]}
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import * as React from 'react';
import { createStore, KissAction, UserException } from '../src/server';

// React Server Components bundlers (like the Next.js app router) resolve the modules of server
// components with the `react-server` export condition. With it, `react` is its server build,
// which has no context and no state hooks (no `createContext`, `useState`, `useContext`...).
// This file runs with that condition, so `react` here is the server build, and checks that the
// server entry of the package (which the condition selects, see package.json) works in it.

reporter(new FeatureFileReporter());

const feature = new Feature('Using Kiss in React Server Components');

class State {
  constructor(readonly count: number, readonly name: string) {}
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1, this.state.name);
  }
}

class LoadName extends KissAction<State> {
  async reduce() {
    await Promise.resolve();
    return (state: State) => new State(state.count, 'Mary');
  }
}

class Fail extends KissAction<State> {
  reduce(): State {
    throw new UserException('failed');
  }
}

Bdd(feature)
  .scenario('In the React Server Components environment, React is its server build.')
  .given('The react-server export condition.')
  .when('React is imported.')
  .then('It has createElement, but no createContext and no state hooks, which the Kiss hooks and provider need.')
  .run(async (_) => {
    expect(typeof React.createElement).toBe('function');
    expect(typeof React.createContext).toBe('undefined');
    expect(typeof React.useState).toBe('undefined');
    expect(typeof React.useContext).toBe('undefined');
    expect(typeof React.useSyncExternalStore).toBe('undefined');
  });

Bdd(feature)
  .scenario('The server entry of the package loads in a server component, and the store works there.')
  .given('The server entry of the package, imported with the react-server condition.')
  .when('A store is created, and sync and async actions are dispatched and awaited.')
  .then('The state changes, the status is tracked, and a failed action is recorded, like on the client.')
  .run(async (_) => {
    const store = createStore<State>({ initialState: new State(0, ''), logger: () => {}, showUserException: () => {} });

    store.dispatch(new Increment());
    await store.dispatchAndWait(new LoadName());
    await store.dispatchAndWait(new Fail());

    expect(store.state).toEqual(new State(1, 'Mary'));
    expect(store.isWaiting(LoadName)).toBe(false);
    expect(store.isFailed(Fail)).toBe(true);
    expect(store.exceptionFor(Fail)?.message).toBe('failed');
    await store.dispose();
  });

Bdd(feature)
  .scenario('The server entry gives a server component the StoreProvider and StoreSlice components, and no hook.')
  .given('The server entry of the package, imported with the react-server condition.')
  .when('Its exports are read.')
  .then('StoreProvider and StoreSlice are there (a bundler turns them into client references, since their module is "use client").')
  .and('No hook is there, so importing one in a server component is a build error.')
  .run(async (_) => {
    const server = await import('../src/server');
    expect(typeof server.StoreProvider).toBe('function');
    expect(typeof server.StoreSlice).toBe('function');
    expect(typeof server.MergeServerStateAction).toBe('function');
    expect(Object.keys(server).filter((name) => /^use[A-Z]/.test(name))).toEqual([]);
  });
