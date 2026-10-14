import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { ClassPersistor, Evt, EvtState, KissAction, Store, StoreProvider, useEvent } from '../src';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Events are persisted as spent');

Bdd(feature)
  .scenario('An event is serialized and deserialized as a spent event.')
  .given('An unspent Evt with a value, a spent Evt, an EvtState with a value, and a spent EvtState.')
  .when('They are serialized and deserialized.')
  .then('The deserialized events are of the same class, but spent, and without a value.')
  .run(async (_) => {
    const store = new Store<State>({initialState: State.initialState, logger: () => {}});
    const original = new State(new Evt('Hi'), Evt.spent(), new EvtState('pulse'), EvtState.spent());

    const serialized = ESSerializer.serialize(original);
    const restored: State = ESSerializer.deserialize(serialized, [State]);

    expect(restored).toBeInstanceOf(State);
    expect(restored.textEvt).toBeInstanceOf(Evt);
    expect(restored.spentEvt).toBeInstanceOf(Evt);
    expect(restored.pulseEvt).toBeInstanceOf(EvtState);
    expect(restored.spentPulseEvt).toBeInstanceOf(EvtState);

    for (const evt of [restored.textEvt, restored.spentEvt, restored.pulseEvt, restored.spentPulseEvt]) {
      expect(store.isEventSpent(evt)).toBe(true);
      expect(evt._spentAtCreation).toBe(true);
      expect(evt.value).toBeUndefined();
    }
  });

Bdd(feature)
  .scenario('The value of an event is not saved, so events can hold values that can\'t be serialized.')
  .given('An Evt and an EvtState whose values are a function and an object with a circular reference.')
  .when('They are serialized.')
  .then('It doesn\'t throw, and the saved text doesn\'t contain the values.')
  .run(async (_) => {
    const circular: any = {name: 'circular'};
    circular.self = circular;
    const original = new State(new Evt<string>((() => 'secret') as any), Evt.spent(), new EvtState(circular), EvtState.spent());

    const serialized = ESSerializer.serialize(original);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('circular');
    expect(serialized).toContain('@Evt');
    expect(serialized).toContain('@EvtState');

    const restored: State = ESSerializer.deserialize(serialized, [State]);
    expect(restored.textEvt).toBeInstanceOf(Evt);
    expect(restored.pulseEvt).toBeInstanceOf(EvtState);
  });

Bdd(feature)
  .scenario('Events saved by the ClassPersistor are restored spent, so they don\'t fire when the app restarts.')
  .given('A store with a ClassPersistor, whose classes to serialize don\'t include Evt and EvtState.')
  .and('An action put new events in the state, which were saved.')
  .when('The app restarts, with a new store that reads the saved state.')
  .and('A component that uses useEvent for the events mounts.')
  .then('The restored events are spent, and the callbacks are not called.')
  .and('A new event put in the state by an action fires normally.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const store = new Store<State>({initialState: State.initialState, persistor: storage.persistor(), logger: () => {}});
    await store.ready();

    await store.dispatchAndWait(new ChangeText('Hi'));
    await store.dispatchAndWait(new Pulse('go'));
    expect(storage.serialized).toContain('@Evt');
    expect(store.isEventSpent(store.state.textEvt)).toBe(false);

    // The app restarts.
    const restartedStore = new Store<State>({
      initialState: State.initialState,
      persistor: storage.persistor(),
      logger: () => {},
    });
    await restartedStore.ready();
    expect(restartedStore.state).not.toBe(State.initialState);
    expect(restartedStore.state.textEvt).toBeInstanceOf(Evt);
    expect(restartedStore.isEventSpent(restartedStore.state.textEvt)).toBe(true);
    expect(restartedStore.isEventSpent(restartedStore.state.pulseEvt)).toBe(true);

    const log: string[] = [];
    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, (text) => log.push('text:' + text));
      useEvent((state: State) => state.pulseEvt, (value) => log.push('pulse:' + value));
      return null;
    };

    await render(restartedStore, Comp);
    expect(log).toEqual([]);

    act(() => restartedStore.dispatch(new ChangeText('New')));
    act(() => restartedStore.dispatch(new Pulse('new pulse')));
    expect(log).toEqual(['text:New', 'pulse:new pulse']);
  });

Bdd(feature)
  .scenario('Restored events don\'t fire in a component that mounted before the store was ready.')
  .given('A ClassPersistor with a saved state with events, that takes a while to read.')
  .and('A component that uses useEvent for the events, mounted while the store is not ready.')
  .when('The saved state finishes being read, and replaces the initial state.')
  .then('The callbacks are not called.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const saved = new State(new Evt('Hi'), Evt.spent(), new EvtState('pulse'), EvtState.spent());
    await storage.persistor().saveInitialState(saved);

    storage.gate = new Promise(resolve => storage.openGate = resolve);
    const store = new Store<State>({initialState: State.initialState, persistor: storage.persistor(), logger: () => {}});

    const log: string[] = [];
    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, (text) => log.push('text:' + text));
      useEvent((state: State) => state.pulseEvt, (value) => log.push('pulse:' + value));
      return null;
    };

    await render(store, Comp);
    expect(store.state).toBe(State.initialState);

    await act(async () => {
      storage.openGate();
      await store.ready();
    });
    await flush();

    expect(store.state).not.toBe(State.initialState);
    expect(store.state.textEvt).toBeInstanceOf(Evt);
    expect(store.state.pulseEvt).toBeInstanceOf(EvtState);
    expect(log).toEqual([]);
  });

// --- Helpers.

class State {
  constructor(
    readonly textEvt: Evt<string>,
    readonly spentEvt: Evt<string>,
    readonly pulseEvt: EvtState<string>,
    readonly spentPulseEvt: EvtState<string>,
  ) {}

  copy(changes: { textEvt?: Evt<string>, pulseEvt?: EvtState<string> }): State {
    return new State(
      changes.textEvt ?? this.textEvt,
      this.spentEvt,
      changes.pulseEvt ?? this.pulseEvt,
      this.spentPulseEvt,
    );
  }

  static initialState = new State(Evt.spent(), Evt.spent(), EvtState.spent(), EvtState.spent());
}

class ChangeText extends KissAction<State> {
  constructor(readonly text: string) {
    super();
  }

  reduce() {
    return this.state.copy({textEvt: new Evt(this.text)});
  }
}

class Pulse extends KissAction<State> {
  constructor(readonly value: string) {
    super();
  }

  reduce() {
    return this.state.copy({pulseEvt: new EvtState(this.value)});
  }
}

class MemoryStorage {
  serialized: string | null = null;

  /** While set, `loadSerialized` waits for it. */
  gate: Promise<void> | null = null;
  openGate: () => void = () => {};

  persistor(): ClassPersistor<State> {
    return new ClassPersistor<State>(
      async () => {
        if (this.gate) await this.gate;
        return this.serialized;
      },
      async (serialized) => {
        this.serialized = serialized;
      },
      async () => {
        this.serialized = null;
      },
      [State], // Note: `Evt` and `EvtState` don't need to be listed.
    );
  }
}

async function render(store: Store<State>, Comp: React.FC) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(StoreProvider<State>, {store, children: React.createElement(Comp)}));
  });
  await flush();
  return renderer;
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
