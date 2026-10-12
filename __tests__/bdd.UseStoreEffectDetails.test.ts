import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Store, StoreProvider, useStoreEffect } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useStoreEffect details');

Bdd(feature)
  .scenario('onMount and onUnmount run at the same time as the useEffects around them.')
  .given('A component with a useEffect, then a useStoreEffect with onMount and onUnmount, then another useEffect.')
  .when('The component mounts, and then unmounts.')
  .then('onMount runs after the setup of the first useEffect, and before the setup of the second.')
  .and('onUnmount runs after the cleanup of the first useEffect, and before the cleanup of the second.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      React.useEffect(() => {
        log.push('effect 1');
        return () => void log.push('cleanup 1');
      }, []);
      useStoreEffect({
        onMount: () => log.push('mount'),
        onUnmount: () => log.push('unmount'),
      });
      React.useEffect(() => {
        log.push('effect 2');
        return () => void log.push('cleanup 2');
      }, []);
      return null;
    };

    const renderer = await render(store, React.createElement(Comp));
    expect(log).toEqual(['effect 1', 'mount', 'effect 2']);

    await unmount(renderer);
    expect(log).toEqual(['effect 1', 'mount', 'effect 2', 'cleanup 1', 'unmount', 'cleanup 2']);
  });

Bdd(feature)
  .scenario('Two useStoreEffect in the same component run in the order they are called.')
  .given('A component that calls useStoreEffect twice, each with onMount and onUnmount.')
  .when('The component mounts, and then unmounts.')
  .then('The first onMount runs before the second one.')
  .and('The first onUnmount runs before the second one.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({onMount: () => log.push('mount 1'), onUnmount: () => log.push('unmount 1')});
      useStoreEffect({onMount: () => log.push('mount 2'), onUnmount: () => log.push('unmount 2')});
      return null;
    };

    const renderer = await render(store, React.createElement(Comp), strictMode);
    await unmount(renderer);
    expect(log).toEqual(['mount 1', 'mount 2', 'unmount 1', 'unmount 2']);
  });

Bdd(feature)
  .scenario('An async onMount is not awaited, so onUnmount may run before it finishes.')
  .given('A component that uses useStoreEffect with an async onMount, and onUnmount.')
  .and('onMount waits for something that is not finished yet.')
  .when('The component unmounts.')
  .then('onUnmount runs right away, while onMount is still waiting.')
  .and('onMount finishes later.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];
    let finish!: () => void;
    const waiting = new Promise<void>(resolve => finish = resolve);

    const Comp: React.FC = () => {
      useStoreEffect({
        onMount: async () => {
          log.push('mount start');
          await waiting;
          log.push('mount end');
        },
        onUnmount: () => log.push('unmount'),
      });
      return null;
    };

    const renderer = await render(store, React.createElement(Comp));
    await unmount(renderer);
    expect(log).toEqual(['mount start', 'unmount']);

    finish();
    await flush();
    expect(log).toEqual(['mount start', 'unmount', 'mount end']);
  });

Bdd(feature)
  .scenario('A component that unmounts in the same synchronous run as its mount gets onUnmount a microtask later.')
  .given('A component that uses useStoreEffect with onMount and onUnmount.')
  .when('The component mounts and unmounts in the same synchronous run, with no microtask in between.')
  .then('onMount is called, but onUnmount is not called yet.')
  .and('onUnmount is called after a microtask.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({onMount: () => log.push('mount'), onUnmount: () => log.push('unmount')});
      return null;
    };

    // Synchronous acts, so there's no microtask between the mount and the unmount.
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(wrap(store, React.createElement(Comp), strictMode));
    });
    act(() => renderer.unmount());
    expect(log).toEqual(['mount']);

    await Promise.resolve();
    expect(log).toEqual(['mount', 'unmount']);
  });

Bdd(feature)
  .scenario('Hiding and showing the component with Activity calls onUnmount, and then onMount again.')
  .given('A component that uses useStoreEffect with onMount and onUnmount, inside an Activity.')
  .when('The Activity hides the component, and then shows it again.')
  .then('onUnmount is called when the component is hidden.')
  .and('onMount is called again when the component is shown.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({onMount: () => log.push('mount'), onUnmount: () => log.push('unmount')});
      return null;
    };

    const inActivity = (mode: 'visible' | 'hidden') =>
      React.createElement(React.Activity, {mode, children: React.createElement(Comp)});

    const renderer = await render(store, inActivity('visible'), strictMode);
    expect(log).toEqual(['mount']);

    await update(renderer, store, inActivity('hidden'), strictMode);
    expect(log).toEqual(['mount', 'unmount']);

    await update(renderer, store, inActivity('visible'), strictMode);
    expect(log).toEqual(['mount', 'unmount', 'mount']);
  });

// The deps of the examples below, by name. They are named because `NaN` and `-0` can't be
// shown in the feature file.
const depsByName: Record<string, unknown> = {
  'NaN': NaN,
  '0': 0,
  '-0': -0,
  '"a"': 'a',
  '["a"]': ['a'],
  '[1, 2]': [1, 2],
  '[1, 2, 3]': [1, 2, 3],
  'undefined': undefined,
};

Bdd(feature)
  .scenario('The deps are compared like React does: each value with Object.is.')
  .given('A component that uses useStoreEffect with deps and onDepsChange.')
  .and('It is mounted with the old deps.')
  .when('It re-renders with the new deps (a new array, when it is an array).')
  .then('onDepsChange is called only when the deps changed, with the old deps.')
  .example(val('Old deps', 'NaN'), val('New deps', 'NaN'), val('onDepsChange is called', false))
  .example(val('Old deps', '0'), val('New deps', '-0'), val('onDepsChange is called', true))
  .example(val('Old deps', '"a"'), val('New deps', '"a"'), val('onDepsChange is called', false))
  .example(val('Old deps', '"a"'), val('New deps', '["a"]'), val('onDepsChange is called', true))
  .example(val('Old deps', '[1, 2]'), val('New deps', '[1, 2]'), val('onDepsChange is called', false))
  .example(val('Old deps', '[1, 2]'), val('New deps', '[1, 2, 3]'), val('onDepsChange is called', true))
  .example(val('Old deps', 'undefined'), val('New deps', '"a"'), val('onDepsChange is called', true))
  .run(async (ctx) => {
    // Creates a new value each time, so that arrays are new arrays.
    const deps = (name: string) => {
      const value = depsByName[name];
      return Array.isArray(value) ? [...value] : value;
    };
    const oldDeps = deps(ctx.example.val('Old deps') as string);
    const newDeps = deps(ctx.example.val('New deps') as string);
    const isCalled = ctx.example.val('onDepsChange is called') as boolean;
    const store = createStore();
    const calls: unknown[] = [];

    const Comp: React.FC<{ deps: unknown }> = ({deps}) => {
      useStoreEffect({deps, onDepsChange: (_s, old) => calls.push(old)});
      return null;
    };

    const renderer = await render(store, React.createElement(Comp, {deps: oldDeps}));
    await update(renderer, store, React.createElement(Comp, {deps: newDeps}));

    if (isCalled) {
      expect(calls.length).toBe(1);
      expect(calls[0]).toBe(oldDeps);
    }
    else expect(calls).toEqual([]);
  });

Bdd(feature)
  .scenario('An error thrown by onMount, onDepsChange or onUnmount goes to the nearest error boundary.')
  .given('A component inside an error boundary.')
  .and('The component uses useStoreEffect, and one of its callbacks throws an error.')
  .when('The callback runs.')
  .then('The error boundary gets the error.')
  .and('If onMount threw, onUnmount is not called later.')
  .example(val('Callback', 'onMount'))
  .example(val('Callback', 'onDepsChange'))
  .example(val('Callback', 'onUnmount'))
  .run(async (ctx) => {
    const callback = ctx.example.val('Callback') as string;
    const store = createStore();
    const log: string[] = [];
    const throwsIf = (name: string) => () => {
      log.push(name);
      if (name === callback) throw new Error(name + ' failed');
    };

    const Comp: React.FC<{ deps: number }> = ({deps}) => {
      useStoreEffect({
        deps,
        onMount: throwsIf('onMount'),
        onDepsChange: throwsIf('onDepsChange'),
        onUnmount: throwsIf('onUnmount'),
      });
      return null;
    };

    const tree = (show: boolean, deps: number) => React.createElement(ErrorBoundary, {
      onError: (error: Error) => log.push('caught: ' + error.message),
      children: show ? React.createElement(Comp, {deps}) : null,
    });

    const renderer = await render(store, tree(true, 1));
    if (callback === 'onDepsChange') await update(renderer, store, tree(true, 2));
    if (callback === 'onUnmount') await update(renderer, store, tree(false, 1));

    expect(log).toContain(`caught: ${callback} failed`);
    expect(log.indexOf(`caught: ${callback} failed`)).toBe(log.indexOf(callback) + 1);

    if (callback === 'onMount') {
      await unmount(renderer);
      expect(log).toEqual(['onMount', 'caught: onMount failed']);
    }
  });

Bdd(feature)
  .scenario('The promise returned by an async onMount, onDepsChange or onUnmount is not handled.')
  .given('A component that uses useStoreEffect with async onMount, onDepsChange and onUnmount.')
  .when('The component mounts, its deps change, and it unmounts.')
  .then('The promises they return are not awaited, and their errors are not caught.')
  .and('So, if one of them rejects, it is an unhandled promise rejection, as in a useEffect.')
  .example(val('Callback', 'onMount'))
  .example(val('Callback', 'onDepsChange'))
  .example(val('Callback', 'onUnmount'))
  .run(async (ctx) => {
    const callback = ctx.example.val('Callback') as string;
    const store = createStore();
    const log: string[] = [];

    // Works like a promise that never settles, and records when someone handles it, with
    // `await`, `then`, `catch` or `finally`. It's not a native promise, because `await` doesn't
    // call the `then` of a native promise. And it never settles, so that it doesn't need to
    // reject to check it is not handled.
    const promise = {
      then: () => void log.push('then'),
      catch: () => void log.push('catch'),
      finally: () => void log.push('finally'),
    };
    const returnsPromiseIf = (name: string) => () => {
      log.push(name);
      return name === callback ? promise : undefined;
    };

    const Comp: React.FC<{ deps: number }> = ({deps}) => {
      useStoreEffect({
        deps,
        onMount: returnsPromiseIf('onMount'),
        onDepsChange: returnsPromiseIf('onDepsChange'),
        onUnmount: returnsPromiseIf('onUnmount'),
      });
      return null;
    };

    const renderer = await render(store, React.createElement(Comp, {deps: 1}));
    await update(renderer, store, React.createElement(Comp, {deps: 2}));
    await unmount(renderer);

    expect(log).toEqual(['onMount', 'onDepsChange', 'onUnmount']);
  });

class ErrorBoundary extends React.Component<{ onError: (error: Error) => void, children: React.ReactNode }, { error: Error | null }> {
  state = {error: null as Error | null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

function createStore() {
  return new Store<number>({initialState: 0, logger: () => {}});
}

function wrap(store: Store<number>, child: React.ReactElement, strictMode = false) {
  const provider = React.createElement(StoreProvider<number>, {store, children: child});
  return strictMode ? React.createElement(React.StrictMode, null, provider) : provider;
}

async function render(store: Store<number>, child: React.ReactElement, strictMode = false) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(wrap(store, child, strictMode));
  });
  await flush();
  return renderer;
}

async function update(renderer: ReactTestRenderer, store: Store<number>, child: React.ReactElement, strictMode = false) {
  await act(async () => {
    renderer.update(wrap(store, child, strictMode));
  });
  await flush();
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
