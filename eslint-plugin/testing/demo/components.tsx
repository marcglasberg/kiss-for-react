/* eslint-disable kiss-for-react/no-new-object-in-use-select */
/* eslint-disable kiss-for-react/new-values-in-use-object */
/* eslint-disable kiss-for-react/avoid-use-all-state */
/* eslint-disable kiss-for-react/store-in-selector */
/* eslint-disable kiss-for-react/dispatch-in-render */
/* eslint-disable kiss-for-react/dispatch-in-effect */
/* eslint-disable kiss-for-react/store-state-in-render */
/* eslint-disable kiss-for-react/then-on-dispatch-and-wait */

// Demonstrates the "Components and hooks" rules of the Kiss ESLint plugin
// (eslint-plugin-kiss-for-react). Each warning is marked with a comment right above the line it
// underlines: the rule name, then what the problem is (in parentheses, when needed), then its
// quick fixes, if any. Each variant of a rule is shown separately.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule in the IDE, delete its
// line. This file is not meant to run. See README.md in this directory.

import { memo, useEffect } from 'react';
import * as kiss from 'kiss-for-react';
import {
  useAllState,
  useDispatch,
  useDispatchAndWait,
  useDispatchWhen,
  useIsStoreReady,
  useObject,
  useSelect,
  useSelector,
  useStore,
} from 'kiss-for-react';
import { Action, Increment, LoadUser, SaveUser, State, store } from './state';

function navigate(_path: string): void {}

// ---------------------------------------------------------------------------------------------
// no-new-object-in-use-select

function NewObjectInUseSelect() {
  // kiss-for-react/no-new-object-in-use-select
  // (The selector returns a new object, so the component re-renders on every state change)
  // Fix (automatic): Will replace `useSelect` with `useObject`.
  const user = useSelect((state: State) => ({ name: state.name, age: state.user.age }));

  // kiss-for-react/no-new-object-in-use-select
  // (A new array)
  // Fix (automatic): Will replace `useSelect` with `useObject`.
  const pair = useSelect((state: State) => [state.name, state.counter]);

  // kiss-for-react/no-new-object-in-use-select
  // (A new object, returned from a block)
  // Fix (automatic): Will replace `useSelect` with `useObject`.
  const info = useSelect((state: State) => {
    return { name: state.name, counter: state.counter };
  });

  // kiss-for-react/no-new-object-in-use-select
  // (`useSelector` is the same as `useSelect`)
  // Fix (automatic): Will replace `useSelector` with `useObject`.
  const counters = useSelector((state: State) => ({ counter: state.counter }));

  // kiss-for-react/no-new-object-in-use-select
  // (With `import * as kiss`)
  // Fix (automatic): Will replace `kiss.useSelect` with `kiss.useObject`.
  const names = kiss.useSelect((state: State) => [state.name, state.user.name]);

  // When `useObject` is not imported yet, the fix also imports it.

  // OK: `useObject` compares the values inside the object.
  const sameUser = useObject((state: State) => ({ name: state.name, age: state.user.age }));

  // OK: selects a part of the state.
  const name = useSelect((state: State) => state.name);

  return <p>{user.name} {pair} {info.name} {counters.counter} {names} {sameUser.name} {name}</p>;
}

// ---------------------------------------------------------------------------------------------
// new-values-in-use-object

function NewValuesInUseObject() {
  const data = useObject((state: State) => ({
    // kiss-for-react/new-values-in-use-object
    // (`filter` creates a new array each time the selector runs)
    nonEmpty: state.items.filter((item) => item.length > 0),
    //
    // kiss-for-react/new-values-in-use-object
    // (`map` creates a new array)
    upper: state.items.map((item) => item.toUpperCase()),
    //
    // kiss-for-react/new-values-in-use-object
    // (A new object)
    user: { ...state.user },
    //
    // kiss-for-react/new-values-in-use-object
    // (A new array)
    tags: [],
    //
    // kiss-for-react/new-values-in-use-object
    // (A new function)
    onClick: () => navigate('/user'),
    //
    // kiss-for-react/new-values-in-use-object
    // (`new` creates a new object)
    date: new Date(),
    //
    // kiss-for-react/new-values-in-use-object
    // (In a branch of `?:`)
    items: state.counter > 0 ? state.items : [],
    //
    // kiss-for-react/new-values-in-use-object
    // (`Object.keys` creates a new array)
    keys: Object.keys(state.user),
  }));

  const pair = useObject((state: State) => {
    const sorted = state.items.toSorted();
    // kiss-for-react/new-values-in-use-object
    // (In a returned array. And `sorted`, declared in the selector, is a new array)
    return [state.name, sorted];
  });

  const ok = useObject((state: State) => ({
    items: state.items, // OK: a part of the state.
    user: state.user, // OK: a part of the state.
    count: state.items.length, // OK: numbers are compared by value.
    hasItems: state.items.length > 0, // OK: booleans too.
    initials: state.name.slice(0, 2), // OK: a string (known with type information).
  }));

  // OK: the selector returns the filtered array itself, and `useObject` compares its items.
  const nonEmpty = useObject((state: State) => state.items.filter((item) => item.length > 0));

  return <p>{data.upper} {pair} {ok.count} {nonEmpty}</p>;
}

// ---------------------------------------------------------------------------------------------
// avoid-use-all-state

function UseAllState() {
  // kiss-for-react/avoid-use-all-state
  // (It re-renders the component on every state change, even when the user didn't change)
  // Fix (automatic): Will replace it with
  // `const userName = useSelect((state: State) => state.user.name);` and
  // `const userAge = useSelect((state: State) => state.user.age);`, and use them.
  const state = useAllState<State>();
  return <p>{state.user.name + state.user.age}</p>;
}

function SelectWholeState() {
  // kiss-for-react/avoid-use-all-state
  // (A `useSelect` that selects the whole state)
  // Fix (automatic): Will replace it with
  // `const counter = useSelect((state: State) => state.counter);`, and use it.
  const state = useSelect((state: State) => state);
  return <p>{state.counter}</p>;
}

function ObjectWholeState() {
  // kiss-for-react/avoid-use-all-state
  // (A `useObject` that selects the whole state)
  // Fix (automatic): Will replace it with `const name = useSelect((state: State) => state.name);`,
  // and use it.
  const all = useObject((state: State) => state);
  return <p>{all.name}</p>;
}

function DestructuredState() {
  // kiss-for-react/avoid-use-all-state
  // (Destructured)
  // Fix (automatic): Will replace it with `const user = useSelect((state: State) => state.user);`
  // and `const items = useSelect((state: State) => state.items);`.
  const { user, items } = useAllState<State>();
  return <p>{user.name} {items.length}</p>;
}

function WholeStateUsed() {
  // kiss-for-react/avoid-use-all-state
  // (The component uses the state itself, so there's no fix)
  const state = useAllState<State>();
  console.log(state);
  return <p>{state.name}</p>;
}

function NameAlreadyUsed() {
  const userName = 'Guest';
  // kiss-for-react/avoid-use-all-state
  // (The name `userName` is already used, so there's no fix)
  const state = useAllState<State>();
  return <p>{state.user.name} {userName}</p>;
}

function PrimitiveState() {
  // OK: the state is a number, so the component needs all of it (known with type information).
  const count = useAllState<number>();
  return <p>{count}</p>;
}

// ---------------------------------------------------------------------------------------------
// store-in-selector

function StateVariableInSelector() {
  // kiss-for-react/avoid-use-all-state
  // (Fixing this one also fixes the selector below)
  // Fix (automatic): Will replace it with
  // `const items = useSelect((state: State) => state.items);`, and use it.
  const state = useAllState<State>();
  // kiss-for-react/store-in-selector
  // (`state` has the state of the last render, which may be outdated when the selector runs)
  // Fix (automatic): Will replace `state` with `s`.
  const list = useSelect((s: State) => state.items);
  return <p>{list.length}</p>;
}

function StoreStateInSelector() {
  // kiss-for-react/store-in-selector
  // (Reads `store.state` instead of its parameter)
  // Fix (automatic): Will replace `store.state` with `s`.
  const items = useSelect((s: State) => store.state.items);

  // kiss-for-react/store-in-selector
  // (A selector without a parameter, so there's no fix)
  const name = useObject(() => store.state.name);

  return <p>{items.length} {name}</p>;
}

function DispatchInSelector() {
  const dispatch = useDispatch();
  const items = useSelect((s: State) => {
    // kiss-for-react/store-in-selector
    // (A selector must not dispatch)
    dispatch(new Increment());
    return s.items;
  });
  return <p>{items.length}</p>;
}

function WholeStateFromSelector() {
  // kiss-for-react/avoid-use-all-state
  // Fix (automatic): Will replace it with `const counter = useSelect((s: State) => s.counter);`,
  // and use it.
  const all = useSelect((s: State) => s);
  // kiss-for-react/store-in-selector
  // (`all` has the whole state of the last render, from another selector)
  // Fix (automatic): Will replace `all` with `s`.
  const count = useSelect((s: State) => all.counter);
  return <p>{count}</p>;
}

function ConditionsReadTheStore() {
  const dispatchWhen = useDispatchWhen();
  const onClick = () => {
    const timeout = { timeoutMillis: 1000 };
    // kiss-for-react/store-in-selector
    // (In the condition of `dispatchWhen`)
    // Fix (automatic): Will replace `store.state` with `state`.
    store.dispatchWhen(new Increment(), (state) => store.state.counter < 10, timeout);

    dispatchWhen(new Increment(), (state: State) => {
      // kiss-for-react/store-in-selector
      // (In the condition of `useDispatchWhen`, which must not dispatch)
      store.dispatch(new LoadUser());
      return state.counter < 10;
    }, timeout);
  };
  return <button onClick={onClick}>Increment</button>;
}

class WaitForName extends Action {
  async reduce() {
    // kiss-for-react/store-in-selector
    // (In the condition of `waitCondition`, in an action)
    // Fix (automatic): Will replace `this.state` with `state`.
    await this.waitCondition((state) => this.state.name !== '', { timeoutMillis: 1000 });
    return null;
  }
}

function SelectorsOnlyUseTheirParameter({ minimum }: { minimum: number }) {
  const ready = useSelect((s: State) => s.counter > 0);
  // OK: `ready` was selected by another selector. Using it is like using a prop.
  const count = useSelect((s: State) => (ready ? s.items.length : 0));
  // OK: props and local values are fine too.
  const isBig = useSelect((s: State) => s.counter > minimum);
  return <p>{count} {isBig}</p>;
}

// ---------------------------------------------------------------------------------------------
// dispatch-in-render

function DispatchInRender() {
  const dispatch = useDispatch();
  // kiss-for-react/dispatch-in-render
  // (It dispatches again on every render, and loops forever if the action changes the state)
  dispatch(new LoadUser());

  // OK: in the `onMount` option of `useDispatch`.
  useDispatch({ onMount: (store) => store.dispatch(new LoadUser()) });

  // OK: in an effect, in a callback that runs later.
  useEffect(() => {
    const timer = setInterval(() => dispatch(new LoadUser()), 1000);
    return () => clearInterval(timer);
  }, [dispatch]);

  // OK: in an event handler.
  return <button onClick={() => dispatch(new LoadUser())}>Load</button>;
}

const ArrowComponent = () => {
  // kiss-for-react/dispatch-in-render
  // (In an arrow function component, with the store imported from another file)
  store.dispatch(new LoadUser());
  return <p>User</p>;
};

const MemoComponent = memo(() => {
  const { dispatch } = useStore();
  // kiss-for-react/dispatch-in-render
  // (In a `memo` component, with `dispatch` from `useStore()`)
  dispatch(new LoadUser());
  return <p>User</p>;
});

function useLoadUser() {
  const dispatchAndWait = useDispatchAndWait();
  // kiss-for-react/dispatch-in-render
  // (In a custom hook, which runs while the component renders)
  void dispatchAndWait(new LoadUser());
}

function loadUserNow() {
  store.dispatch(new LoadUser()); // OK: not a component or hook.
}

// ---------------------------------------------------------------------------------------------
// dispatch-in-effect

function DispatchInEffect({ userId }: { userId: string }) {
  const dispatch = useDispatch();
  const { dispatch: dispatchFromStore } = useStore();
  const isReady = useIsStoreReady();

  useEffect(() => {
    // kiss-for-react/dispatch-in-effect
    // (The effect runs when the component mounts. If the store is still reading the persisted
    // state, dispatching throws a `StoreException`)
    // Fix (suggestion): Will replace the effect with `useDispatch({ onMount: (store) => ... })`.
    dispatch(new LoadUser());
  }, []);

  // kiss-for-react/dispatch-in-effect
  // (An effect with deps, and `dispatch` from `useStore()`)
  // Fix (suggestion): Will replace the effect with
  // `useDispatch({ deps: userId, onMount: ..., onDepsChange: ... })`.
  useEffect(() => dispatchFromStore(new LoadUser()), [userId]);

  useEffect(() => {
    // kiss-for-react/dispatch-in-effect
    // (No quick fix, since the cleanup runs every time `userId` changes, with its old value)
    dispatch(new LoadUser());
    return () => console.log(`Stopped ${userId}`);
  }, [userId]);

  // OK: in the `onMount` option of `useDispatch`, which waits for the store to be ready.
  useDispatch({ onMount: (store) => store.dispatch(new LoadUser()) });

  // OK: the effect checks if the store is ready.
  useEffect(() => {
    if (isReady) dispatch(new LoadUser());
  }, [isReady]);

  return <button onClick={() => dispatch(new LoadUser())}>Load</button>;
}

// ---------------------------------------------------------------------------------------------
// store-state-in-render

function StoreStateInRender() {
  // kiss-for-react/store-state-in-render
  // (It reads the state only once, so the component doesn't re-render when it changes)
  // Fix (suggestion): Will replace `store.state.user.name` with
  // `useSelect((state: State) => state.user.name)`.
  const name = store.state.user.name;

  // OK: in an event handler.
  const onClick = () => console.log(store.state.user.name);

  // OK: in an effect.
  useEffect(() => console.log(store.state.counter), []);

  return <button onClick={onClick}>{name}</button>;
}

function StoreStateInIf({ show }: { show: boolean }) {
  if (show) {
    // kiss-for-react/store-state-in-render
    // (Inside an `if`, where a hook can't be called, so there's no suggestion)
    return <p>{store.state.name}</p>;
  }
  return null;
}

function StoreStateOfUseStore() {
  const { store } = useStore();
  // kiss-for-react/store-state-in-render
  // (The store of `useStore()`)
  // Fix (suggestion): Will replace `store.state.name` with
  // `useSelect((state: typeof store.state) => state.name)`.
  return <p>{store.state.name}</p>;
}

// ---------------------------------------------------------------------------------------------
// then-on-dispatch-and-wait

function ThenOnDispatchAndWait() {
  const dispatchAndWait = useDispatchAndWait();
  const { dispatchAndWait: dispatchAndWaitFromStore } = useStore();

  const onSave = () => {
    // kiss-for-react/then-on-dispatch-and-wait
    // (The callback runs even when the action fails with a `UserException`)
    // Fix (suggestion): Will change the callback to
    // `(status) => { if (status.isCompletedOk) navigate('/home'); }`.
    dispatchAndWait(new SaveUser()).then(() => navigate('/home'));
  };

  const onSaveWithStore = () => {
    // kiss-for-react/then-on-dispatch-and-wait
    // (The `dispatchAndWait` of the store)
    // Fix (suggestion): Will change the callback to
    // `(status) => { if (status.isCompletedOk) navigate('/home'); }`.
    store.dispatchAndWait(new SaveUser()).then(() => navigate('/home'));
  };

  const onSaveWithUseStore = () => {
    // kiss-for-react/then-on-dispatch-and-wait
    // (The `dispatchAndWait` of `useStore()`. The callback has a parameter, but doesn't read it)
    // Fix (suggestion): Will wrap the body in `if (result.isCompletedOk) { ... }`.
    dispatchAndWaitFromStore(new SaveUser()).then((result) => {
      console.log('Saved');
      navigate('/home');
    });
  };

  const onSaveOk = () => {
    // OK: the callback checks the status.
    dispatchAndWait(new SaveUser()).then((status) => {
      if (status.isCompletedOk) navigate('/home');
    });

    // OK: the `_` says the status is ignored on purpose.
    dispatchAndWait(new SaveUser()).then((_status) => console.log('Done'));

    // OK: `finally` always runs.
    dispatchAndWait(new SaveUser()).finally(() => console.log('Done'));
  };

  return (
    <div>
      <button onClick={onSave}>Save</button>
      <button onClick={onSaveWithStore}>Save</button>
      <button onClick={onSaveWithUseStore}>Save</button>
      <button onClick={onSaveOk}>Save</button>
    </div>
  );
}

class SaveAndLog extends Action {
  async reduce() {
    // kiss-for-react/then-on-dispatch-and-wait
    // (The `dispatchAndWait` of an action)
    // Fix (suggestion): Will change the callback to
    // `(status) => { if (status.isCompletedOk) console.log('Saved'); }`.
    await this.dispatchAndWait(new SaveUser()).then(() => console.log('Saved'));
    return null;
  }
}
