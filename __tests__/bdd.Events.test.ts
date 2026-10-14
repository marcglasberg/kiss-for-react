import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { useEffect, useState } from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Evt, EvtState, KissAction, Store, StoreProvider, useEvent, useLayoutEvent, useSelect } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Events (Evt and EvtState)');

// --- The Evt class.

Bdd(feature)
  .scenario('A new event is not spent, and holds its value.')
  .given('A store.')
  .when('A boolean event is created with new Evt(), and an event with a value with new Evt(value).')
  .then('The boolean event has the value true.')
  .and('The other event has the given value.')
  .and('Neither of them is spent.')
  .run(async (_) => {
    const store = createStore();

    const booleanEvt = new Evt();
    expect(booleanEvt.value).toBe(true);
    expect(store.isEventSpent(booleanEvt)).toBe(false);

    const textEvt = new Evt('Hi');
    expect(textEvt.value).toBe('Hi');
    expect(store.isEventSpent(textEvt)).toBe(false);

    const numberEvt = new Evt(0);
    expect(numberEvt.value).toBe(0);
    expect(store.isEventSpent(numberEvt)).toBe(false);
  });

Bdd(feature)
  .scenario('Evt.spent() is an event that was already used, for the initial state.')
  .given('A store.')
  .when('An event is created with Evt.spent().')
  .then('It is spent, in any store.')
  .and('It has no value.')
  .run(async (_) => {
    const store = createStore();
    const otherStore = createStore();

    const evt = Evt.spent<string>();
    expect(store.isEventSpent(evt)).toBe(true);
    expect(otherStore.isEventSpent(evt)).toBe(true);
    expect(evt.value).toBeUndefined();
  });

Bdd(feature)
  .scenario('Reading the value of an event does not spend it.')
  .given('A new event with a value.')
  .when('Its value is read many times.')
  .then('It is still not spent.')
  .run(async (_) => {
    const store = createStore();
    const evt = new Evt('Hi');

    expect(evt.value).toBe('Hi');
    expect(evt.value).toBe('Hi');
    expect(store.isEventSpent(evt)).toBe(false);
  });

Bdd(feature)
  .scenario('Events describe themselves, for the logs.')
  .given('Events of each kind.')
  .when('They are converted to a string.')
  .then('The string shows the kind of event and its value, or that it is spent.')
  .run(async (_) => {
    expect(String(new Evt())).toBe('Evt(true)');
    expect(String(new Evt('Hi'))).toBe('Evt(Hi)');
    expect(String(Evt.spent())).toBe('Evt.spent()');
    expect(String(new EvtState())).toBe('EvtState(true)');
    expect(String(new EvtState(42))).toBe('EvtState(42)');
    expect(String(EvtState.spent())).toBe('EvtState.spent()');
  });

// --- Events in the state, checked by tests.

Bdd(feature)
  .scenario('An action puts a new event in the state, and tests can check it.')
  .given('A state with spent events.')
  .when('An action puts a new boolean event in the state.')
  .and('An async action puts a new event with a value in the state.')
  .then('The state has new, unspent events, different from the previous ones.')
  .and('Tests can read the value of the new event.')
  .run(async (_) => {
    const store = createStore();
    const scrollBefore = store.state.scrollEvt;
    const textBefore = store.state.textEvt;

    await store.dispatchAndWait(new ScrollToTop());
    expect(store.state.scrollEvt).not.toBe(scrollBefore);
    expect(store.state.scrollEvt.value).toBe(true);
    expect(store.isEventSpent(store.state.scrollEvt)).toBe(false);

    await store.dispatchAndWait(new ChangeTextAsync('Hi'));
    expect(store.state.textEvt).not.toBe(textBefore);
    expect(store.state.textEvt.value).toBe('Hi');
    expect(store.isEventSpent(store.state.textEvt)).toBe(false);
  });

// --- useEvent with Evt.

Bdd(feature)
  .scenario('useEvent fires once when an action puts a new event in the state.')
  .given('A component that uses useEvent for a boolean event, and for an event with a value.')
  .when('An action puts a new boolean event in the state.')
  .and('An action puts a new event with a value in the state.')
  .then('Each callback is called once, with the value of its event.')
  .and('The events are now spent.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.scrollEvt, (value) => log.push('scroll:' + value));
      useEvent((state: State) => state.textEvt, (text) => log.push('text:' + text));
      return null;
    };

    await render(store, Comp, strictMode);
    expect(log).toEqual([]);

    act(() => store.dispatch(new ScrollToTop()));
    expect(log).toEqual(['scroll:true']);
    expect(store.isEventSpent(store.state.scrollEvt)).toBe(true);

    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual(['scroll:true', 'text:Hi']);
    expect(store.isEventSpent(store.state.textEvt)).toBe(true);
  });

Bdd(feature)
  .scenario('useEvent fires again for each new event, even with the same value.')
  .given('A component that uses useEvent for an event with a value.')
  .when('An action puts a new event with the same value in the state, twice.')
  .then('The callback is called twice.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, (text) => log.push(text));
      return null;
    };

    await render(store, Comp);
    act(() => store.dispatch(new ChangeText('Hi')));
    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual(['Hi', 'Hi']);
  });

Bdd(feature)
  .scenario('useEvent does not fire again when the component re-renders for other reasons.')
  .given('A component that uses useEvent, and shows a text from the state.')
  .and('An action put a new event in the state, and the callback was called.')
  .when('Another action changes the text, and the component re-renders.')
  .and('The component re-renders because its local state changed.')
  .and('The component re-renders because its props changed.')
  .then('The callback is not called again.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];
    let setLocal!: (value: number) => void;
    let renders = 0;

    const Comp: React.FC<{ label: string }> = ({label}) => {
      renders++;
      const text = useSelect((state: State) => state.text);
      const [local, setLocalState] = useState(0);
      setLocal = setLocalState;
      useEvent((state: State) => state.textEvt, (value) => log.push(value));
      return React.createElement(React.Fragment, null, `${label}:${text}:${local}`);
    };

    const renderer = await render(store, Comp, strictMode, {label: 'A'});
    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual(['Hi']);
    const rendersAfterEvent = renders;

    act(() => store.dispatch(new SetText('other')));
    act(() => setLocal(1));
    await update(renderer, store, Comp, strictMode, {label: 'B'});

    expect(renders).toBeGreaterThan(rendersAfterEvent);
    expect(JSON.stringify(renderer.toJSON())).toBe('"B:other:1"');
    expect(log).toEqual(['Hi']);
  });

Bdd(feature)
  .scenario('An event created before the component mounts fires once, when it mounts.')
  .given('An action put a new event in the state, while no component used it.')
  .when('A component that uses useEvent for that event mounts.')
  .then('The callback is called once, with the value of the event.')
  .and('The event is now spent.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    store.dispatch(new ChangeText('focus'));
    expect(store.isEventSpent(store.state.textEvt)).toBe(false);

    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, (text) => log.push(text));
      return null;
    };

    await render(store, Comp, strictMode);
    expect(log).toEqual(['focus']);
    expect(store.isEventSpent(store.state.textEvt)).toBe(true);
  });

Bdd(feature)
  .scenario('A spent event does not fire again when the component remounts.')
  .given('A component that handled an event with useEvent.')
  .when('The component unmounts, and mounts again, with the same event still in the state.')
  .then('The callback is not called again.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, (text) => log.push(text));
      return null;
    };

    const renderer = await render(store, Comp, strictMode);
    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual(['Hi']);

    await unmount(renderer);
    await render(store, Comp, strictMode);
    expect(log).toEqual(['Hi']);
  });

Bdd(feature)
  .scenario('The events of the initial state do not fire, when they are created with Evt.spent().')
  .given('A store whose initial state has events created with Evt.spent().')
  .when('A component that uses useEvent for them mounts.')
  .then('The callbacks are not called.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.scrollEvt, () => log.push('scroll'));
      useEvent((state: State) => state.textEvt, (text) => log.push('text:' + text));
      return null;
    };

    await render(store, Comp);
    expect(log).toEqual([]);
  });

Bdd(feature)
  .scenario('An initial state with a new Evt() fires when the first component mounts, which is why Evt.spent() should be used.')
  .given('A store whose initial state has an event created with new Evt(), instead of Evt.spent().')
  .when('A component that uses useEvent for it mounts, and then another one.')
  .then('The callback of the first component is called, on mount.')
  .and('The callback of the second one is not, since the event is spent.')
  .run(async (_) => {
    const store = new Store<State>({
      initialState: new State('', new Evt(), Evt.spent(), EvtState.spent()),
      logger: () => {},
    });
    const log: string[] = [];

    const Comp: React.FC<{ label: string }> = ({label}) => {
      useEvent((state: State) => state.scrollEvt, () => log.push(label));
      return null;
    };

    const renderer = await render(store, Comp, false, {label: 'first'});
    expect(log).toEqual(['first']);

    await unmount(renderer);
    await render(store, Comp, false, {label: 'second'});
    expect(log).toEqual(['first']);
  });

Bdd(feature)
  .scenario('Each event is handled by one component only.')
  .given('Two mounted components that use useEvent for the same event.')
  .when('An action puts a new event in the state.')
  .then('Only the first component to run its effect handles it.')
  .and('For two components to react, two events are needed: each component handles its own.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const SameEvent: React.FC<{ label: string }> = ({label}) => {
      useEvent((state: State) => state.textEvt, (text) => log.push(`${label}:${text}`));
      return null;
    };
    const Scroll: React.FC = () => {
      useEvent((state: State) => state.scrollEvt, () => log.push('scroll'));
      return null;
    };
    const Parent: React.FC = () => React.createElement(React.Fragment, null,
      React.createElement(SameEvent, {key: 1, label: 'first'}),
      React.createElement(SameEvent, {key: 2, label: 'second'}),
      React.createElement(Scroll, {key: 3}));

    await render(store, Parent);

    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual(['first:Hi']);

    act(() => store.dispatch(new ScrollToTop()));
    expect(log).toEqual(['first:Hi', 'scroll']);
  });

Bdd(feature)
  .scenario('Handling an event does not change the state or the event.')
  .given('A component that uses useEvent.')
  .when('An action puts a new event in the state, and the component handles it.')
  .then('The state is the same object the action created.')
  .and('The event still has its value, and is marked as spent in the store, not in the event.')
  .and('Another store that gets the same state has not spent it.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, (text) => log.push(text));
      return null;
    };

    await render(store, Comp);
    act(() => store.dispatch(new ChangeText('Hi')));
    const stateAfterAction = store.state;
    const evt = stateAfterAction.textEvt;
    expect(log).toEqual(['Hi']);

    expect(store.state).toBe(stateAfterAction);
    expect(evt.value).toBe('Hi');
    expect(evt._spentAtCreation).toBe(false);
    expect(store.isEventSpent(evt)).toBe(true);

    // Another store (another test, for example) with the same state object.
    const otherStore = new Store<State>({initialState: stateAfterAction, logger: () => {}});
    expect(otherStore.isEventSpent(evt)).toBe(false);

    await render(otherStore, Comp);
    expect(log).toEqual(['Hi', 'Hi']);
    expect(otherStore.isEventSpent(evt)).toBe(true);
  });

Bdd(feature)
  .scenario('useEvent calls the callback of the latest render.')
  .given('A component that uses useEvent with a callback that uses a prop.')
  .when('The prop changes, and then an action puts a new event in the state.')
  .then('The callback sees the new prop.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC<{ label: string }> = ({label}) => {
      useEvent((state: State) => state.textEvt, (text) => log.push(`${label}:${text}`));
      return null;
    };

    const renderer = await render(store, Comp, false, {label: 'A'});
    await update(renderer, store, Comp, false, {label: 'B'});

    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual(['B:Hi']);
  });

Bdd(feature)
  .scenario('useEvent does nothing when the selector returns null or undefined.')
  .given('A component whose useEvent selector returns null or undefined.')
  .when('The component mounts, and the state changes.')
  .then('The callback is not called, and nothing throws.')
  .example(val('Selected', 'null'))
  .example(val('Selected', 'undefined'))
  .run(async (ctx) => {
    const selected = ctx.example.val('Selected') === 'null' ? null : undefined;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((_state: State): Evt<string> | null | undefined => selected, (text) => log.push(text));
      return null;
    };

    await render(store, Comp);
    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual([]);
  });

Bdd(feature)
  .scenario('An event that the selector starts returning later fires once.')
  .given('A component whose useEvent selector returns an event only when the state has a text.')
  .and('An action put a new event in the state, and the component ignored it.')
  .when('An action sets the text, so the selector returns the event.')
  .then('The callback is called once.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.text === '' ? null : state.textEvt, (text) => log.push(text));
      return null;
    };

    await render(store, Comp);
    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual([]);

    act(() => store.dispatch(new SetText('shown')));
    expect(log).toEqual(['Hi']);

    act(() => store.dispatch(new SetText('again')));
    expect(log).toEqual(['Hi']);
  });

Bdd(feature)
  .scenario('After logOut, the spent events of the initial state do not fire.')
  .given('A component that handled an event with useEvent.')
  .when('The store logs out, going back to the initial state, whose events are Evt.spent().')
  .then('The callback is not called again.')
  .and('A new event after the logOut fires normally.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, (text) => log.push(text));
      return null;
    };

    await render(store, Comp);
    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log).toEqual(['Hi']);

    await act(async () => {
      await store.logOut({initialState: State.initialState, throttle: 10, actionsThrottle: 10});
    });
    expect(store.state).toBe(State.initialState);
    expect(log).toEqual(['Hi']);

    act(() => store.dispatch(new ChangeText('Again')));
    expect(log).toEqual(['Hi', 'Again']);
  });

Bdd(feature)
  .scenario('useEvent must be used within a StoreProvider.')
  .given('A component that uses useEvent, rendered without a StoreProvider.')
  .when('The component renders.')
  .then('It throws.')
  .run(async (_) => {
    const Comp: React.FC = () => {
      useEvent((state: State) => state.textEvt, () => {});
      return null;
    };

    const errors = silenceReactErrors();
    try {
      expect(() => act(() => {
        TestRenderer.create(React.createElement(Comp));
      })).toThrow('useStore must be used within a StoreProvider');
    } finally {
      errors.restore();
    }
  });

// --- useLayoutEvent.

Bdd(feature)
  .scenario('useLayoutEvent fires in the layout phase, before the passive effects.')
  .given('A component that uses useLayoutEvent, and a useEffect that runs on every render.')
  .when('An action puts a new event in the state.')
  .then('The callback is called once, before the useEffect of that render.')
  .and('The event is spent.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      const text = useSelect((state: State) => state.text);
      useEffect(() => {
        log.push('effect:' + text);
      });
      useLayoutEvent((state: State) => state.textEvt, (value) => log.push('layout-event:' + value));
      return null;
    };

    await render(store, Comp, strictMode);
    log.length = 0;

    act(() => store.dispatch(new ChangeText('Hi')));
    expect(log.filter(e => e.startsWith('layout-event'))).toEqual(['layout-event:Hi']);
    expect(log[0]).toBe('layout-event:Hi');
    expect(log.indexOf('effect:')).toBeGreaterThan(0);
    expect(store.isEventSpent(store.state.textEvt)).toBe(true);
  });

Bdd(feature)
  .scenario('useLayoutEvent behaves like useEvent: it fires once, including for events created before the mount, and not on remount.')
  .given('An action put a new event in the state, while no component used it.')
  .when('A component that uses useLayoutEvent for that event mounts, unmounts, and mounts again.')
  .then('The callback is called once, when it first mounts.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];
    store.dispatch(new ChangeText('Hi'));

    const Comp: React.FC = () => {
      useLayoutEvent((state: State) => state.textEvt, (text) => log.push(text));
      return null;
    };

    const renderer = await render(store, Comp, true);
    expect(log).toEqual(['Hi']);

    await unmount(renderer);
    await render(store, Comp, true);
    expect(log).toEqual(['Hi']);
  });

// --- EvtState.

Bdd(feature)
  .scenario('A new EvtState holds its value, and each instance is unique.')
  .given('Nothing.')
  .when('Two EvtState are created with the same value, and one without a value.')
  .then('They hold their values, and the one without a value has the value true.')
  .and('The two with the same value are different objects.')
  .and('They are not spent, but EvtState.spent() is.')
  .run(async (_) => {
    const store = createStore();
    const a = new EvtState('x');
    const b = new EvtState('x');
    expect(a.value).toBe('x');
    expect(b.value).toBe('x');
    expect(a).not.toBe(b);
    expect(new EvtState().value).toBe(true);
    expect(store.isEventSpent(a)).toBe(false);
    expect(store.isEventSpent(EvtState.spent())).toBe(true);
    expect(EvtState.spent().value).toBeUndefined();
  });

Bdd(feature)
  .scenario('useEvent with an EvtState fires in all the mounted components that use it, each time a new one is put in the state.')
  .given('Two mounted components that use useEvent for the same EvtState.')
  .when('An action puts a new EvtState in the state, twice, with the same value.')
  .then('Both callbacks are called each time, with the value.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Child: React.FC<{ label: string }> = ({label}) => {
      useEvent((state: State) => state.pulseEvt, (value) => log.push(`${label}:${value}`));
      return null;
    };
    const Parent: React.FC = () => React.createElement(React.Fragment, null,
      React.createElement(Child, {key: 1, label: 'first'}),
      React.createElement(Child, {key: 2, label: 'second'}));

    await render(store, Parent, strictMode);
    expect(log).toEqual([]);

    act(() => store.dispatch(new Pulse('go')));
    expect(log).toEqual(['first:go', 'second:go']);

    act(() => store.dispatch(new Pulse('go')));
    expect(log).toEqual(['first:go', 'second:go', 'first:go', 'second:go']);
  });

Bdd(feature)
  .scenario('An EvtState does not fire when the component mounts, nor when it remounts, nor on unrelated re-renders.')
  .given('An action put a new EvtState in the state, while no component used it.')
  .when('A component that uses useEvent for it mounts.')
  .and('Another action changes the text, and the component re-renders.')
  .and('The component unmounts and mounts again.')
  .then('The callback is never called.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];
    store.dispatch(new Pulse('before'));

    const Comp: React.FC = () => {
      const text = useSelect((state: State) => state.text);
      useEvent((state: State) => state.pulseEvt, (value) => log.push(value));
      return React.createElement(React.Fragment, null, text);
    };

    const renderer = await render(store, Comp, strictMode);
    act(() => store.dispatch(new SetText('other')));
    expect(JSON.stringify(renderer.toJSON())).toBe('"other"');

    await unmount(renderer);
    await render(store, Comp, strictMode);
    expect(log).toEqual([]);
  });

Bdd(feature)
  .scenario('After logOut, an EvtState in the initial state fires unless it was created with EvtState.spent().')
  .given('A store whose initial state has an EvtState, created with EvtState.spent() or with new EvtState().')
  .and('A mounted component that uses useEvent for it, which handled a new EvtState put by an action.')
  .when('The store logs out, going back to the initial state.')
  .then('With EvtState.spent(), the callback is not called again.')
  .and('With new EvtState(), the callback is called again, with the value of the initial state.')
  .example(val('Initial', 'spent'), val('Log', ['go']))
  .example(val('Initial', 'new'), val('Log', ['go', 'initial']))
  .run(async (ctx) => {
    const initialEvt = ctx.example.val('Initial') === 'spent' ? EvtState.spent<string>() : new EvtState('initial');
    const initialState = new State('', Evt.spent(), Evt.spent(), initialEvt);
    const store = new Store<State>({initialState, logger: () => {}});
    const log: string[] = [];

    const Comp: React.FC = () => {
      useEvent((state: State) => state.pulseEvt, (value) => log.push(value));
      return null;
    };

    await render(store, Comp);
    act(() => store.dispatch(new Pulse('go')));
    expect(log).toEqual(['go']);

    await act(async () => {
      await store.logOut({initialState, throttle: 10, actionsThrottle: 10});
    });
    expect(log).toEqual(ctx.example.val('Log'));
  });

Bdd(feature)
  .scenario('useLayoutEvent also works with an EvtState.')
  .given('A mounted component that uses useLayoutEvent for an EvtState.')
  .when('An action puts a new EvtState in the state.')
  .then('The callback is called with the value.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useLayoutEvent((state: State) => state.pulseEvt, (value) => log.push(value));
      return null;
    };

    await render(store, Comp, true);
    act(() => store.dispatch(new Pulse('go')));
    expect(log).toEqual(['go']);
  });

// --- Helpers.

class State {
  constructor(
    readonly text: string,
    readonly scrollEvt: Evt,
    readonly textEvt: Evt<string>,
    readonly pulseEvt: EvtState<string>,
  ) {}

  copy(changes: { text?: string, scrollEvt?: Evt, textEvt?: Evt<string>, pulseEvt?: EvtState<string> }): State {
    return new State(
      changes.text ?? this.text,
      changes.scrollEvt ?? this.scrollEvt,
      changes.textEvt ?? this.textEvt,
      changes.pulseEvt ?? this.pulseEvt,
    );
  }

  static initialState = new State('', Evt.spent(), Evt.spent(), EvtState.spent());
}

class SetText extends KissAction<State> {
  constructor(readonly text: string) {
    super();
  }

  reduce() {
    return this.state.copy({text: this.text});
  }
}

class ScrollToTop extends KissAction<State> {
  reduce() {
    return this.state.copy({scrollEvt: new Evt()});
  }
}

class ChangeText extends KissAction<State> {
  constructor(readonly text: string) {
    super();
  }

  reduce() {
    return this.state.copy({textEvt: new Evt(this.text)});
  }
}

class ChangeTextAsync extends KissAction<State> {
  constructor(readonly text: string) {
    super();
  }

  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 1));
    return (state: State) => state.copy({textEvt: new Evt(this.text)});
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

function createStore() {
  return new Store<State>({initialState: State.initialState, logger: () => {}});
}

function element<P extends object>(store: Store<State>, Comp: React.FC<P>, props: P, strictMode: boolean) {
  const provider = React.createElement(StoreProvider<State>, {store, children: React.createElement(Comp, props)});
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

async function update<P extends object>(
  renderer: ReactTestRenderer, store: Store<State>, Comp: React.FC<P>, strictMode: boolean, props: P) {
  await act(async () => {
    renderer.update(element(store, Comp, props, strictMode));
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

// React logs the errors thrown during render to the console. Silences them during the test.
function silenceReactErrors() {
  const error = console.error;
  console.error = () => {};
  return {restore: () => (console.error = error)};
}
