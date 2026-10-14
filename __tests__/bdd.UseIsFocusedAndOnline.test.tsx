import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Store, StoreProvider, useIsFocused, useIsOnline } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useIsFocused and useIsOnline');

type Signal = 'focus' | 'online';

Bdd(feature)
  .scenario('A component shows whether the app is focused or online, and re-renders when it changes.')
  .given('A component that uses useIsFocused or useIsOnline.')
  .when('The app loses focus or goes offline, and then is focused or online again.')
  .then('The component re-renders with the new value each time.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const store = createStore();
    const renders: boolean[] = [];
    const useSignal = signal === 'focus' ? useIsFocused : useIsOnline;

    const Comp: React.FC = () => {
      const value = useSignal();
      renders.push(value);
      return <span>{value ? 'yes' : 'no'}</span>;
    };

    const renderer = await render(store, Comp);
    expect(renders).toEqual([true]);
    expect(renderer.toJSON()).toEqual({ type: 'span', props: {}, children: ['yes'] });

    await set(store, signal, false);
    expect(renders).toEqual([true, false]);
    expect(renderer.toJSON()).toEqual({ type: 'span', props: {}, children: ['no'] });

    await set(store, signal, true);
    expect(renders).toEqual([true, false, true]);
    expect(renderer.toJSON()).toEqual({ type: 'span', props: {}, children: ['yes'] });

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('A change in one signal does not re-render a component that uses only the other.')
  .given('A component that uses useIsFocused only.')
  .when('The app goes offline.')
  .then('The component does not re-render.')
  .run(async (_) => {
    const store = createStore();
    let renders = 0;

    const Comp: React.FC = () => {
      useIsFocused();
      renders++;
      return null;
    };

    const renderer = await render(store, Comp);
    expect(renders).toBe(1);

    await set(store, 'online', false);
    expect(renders).toBe(1);

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('On the server, the app is always focused and online.')
  .given('A store that says the app is not focused and not online.')
  .when('A component that uses useIsFocused and useIsOnline is rendered to a string.')
  .then('Both are true in the HTML.')
  .run(async (_) => {
    const store = createStore();
    store.setFocused(false);
    store.setOnline(false);

    const Comp: React.FC = () => {
      const focused = useIsFocused();
      const online = useIsOnline();
      return <span>{String(focused)}-{String(online)}</span>;
    };

    const html = renderToString(<StoreProvider store={store}><Comp /></StoreProvider>);
    expect(html).toContain('true');
    expect(html).not.toContain('false');

    await store.dispose();
  });

// ---------------------------------------------------------------------------------------------

function createStore() {
  return new Store<number>({ initialState: 0, logger: () => {} });
}

async function set(store: Store<number>, signal: Signal, value: boolean) {
  await act(async () => {
    if (signal === 'focus') store.setFocused(value);
    else store.setOnline(value);
  });
}

async function render(store: Store<number>, Comp: React.FC) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<StoreProvider store={store}><Comp /></StoreProvider>);
  });
  return renderer;
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
}
