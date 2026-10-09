/* eslint-disable kiss-for-react/user-exception-outside-action */
/* eslint-disable kiss-for-react/user-exception-without-cause */
/* eslint-disable kiss-for-react/throw-in-global-wrap-error */
/* eslint-disable kiss-for-react/after-throws */

// Demonstrates the "Errors" rules of the Kiss ESLint plugin (eslint-plugin-kiss-for-react).
// Each warning is marked with a comment right above the line it underlines: the rule name, then
// what the problem is (in parentheses, when needed), then its quick fixes, if any. Each variant
// of a rule is shown separately.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule in the IDE, delete its
// line. This file is not meant to run. See README.md in this directory.
//
// The components here use `createElement` instead of JSX, so that this file can be a `.ts` file.

import { createElement, useEffect, useState } from 'react';
import {
  createStore,
  Persistor,
  Store,
  useDispatch,
  UserException,
  UserExceptionAction,
} from 'kiss-for-react';
import { Action, fetchName, State } from './state';

function parseNumber(text: string): number {
  const value = Number(text);
  if (isNaN(value)) throw new Error(`Not a number: ${text}`);
  return value;
}

class SetCounter extends Action {
  constructor(readonly counter: number) {
    super();
  }

  reduce() {
    return this.state.copy({ counter: this.counter });
  }
}

// ---------------------------------------------------------------------------------------------
// user-exception-outside-action

export function SaveButton() {
  const dispatch = useDispatch();
  return createElement('div', null,
    createElement('button', {
      onClick: () => {
        // kiss-for-react/user-exception-outside-action
        // (In an event handler, Kiss can't catch it, so the user sees nothing)
        // Fix (suggestion): Will replace it with
        // `dispatch(new UserExceptionAction('Invalid'));`.
        throw new UserException('Invalid');
      },
    }, 'Save'),
    createElement('button', {
      onClick: () => dispatch(new UserExceptionAction('Invalid')), // OK: dispatched.
    }, 'Save'),
  );
}

export function CounterInput({ text }: { text: string }) {
  const dispatch = useDispatch();

  const onSave = () => {
    const counter = Number(text);
    // kiss-for-react/user-exception-outside-action
    // (Not the last statement, so the fix adds a `return`)
    // Fix (suggestion): Will replace it with
    // `{ dispatch(new UserExceptionAction('Please enter a valid number')); return; }`.
    if (isNaN(counter)) throw new UserException('Please enter a valid number');
    dispatch(new SetCounter(counter));
  };

  return createElement('button', { onClick: onSave }, 'Save');
}

export function useCheckCounter(counter: number) {
  const dispatch = useDispatch();
  useEffect(() => {
    if (counter >= 0) return;
    // kiss-for-react/user-exception-outside-action
    // (In an effect of a hook)
    // Fix (suggestion): Will replace it with
    // `dispatch(new UserExceptionAction(`Invalid counter: ${counter}`));`.
    throw new UserException(`Invalid counter: ${counter}`);
  }, [counter, dispatch]);
}

class IncrementAndCheck extends Action {
  reduce() {
    // OK: in `reduce`, Kiss shows it to the user.
    if (this.state.counter < 0) throw new UserException('Negative counter');
    return this.state.copy({ counter: this.state.counter + 1 });
  }

  after() {
    // kiss-for-react/user-exception-outside-action
    // (In `after`, Kiss ignores errors, so the user sees nothing)
    // Fix (suggestion): Will replace it with
    // `{ this.dispatch(new UserExceptionAction('Counter too large')); return; }`.
    //
    // kiss-for-react/after-throws
    // (Any error thrown in `after` is lost. See actions.ts)
    if (this.state.counter > 100) throw new UserException('Counter too large');

    // OK: a function declared in `after`, which may run somewhere else.
    const check = () => {
      throw new UserException('Counter too large');
    };
    console.log(check);
  }
}

export function SaveWithoutDispatch() {
  const [text] = useState('');
  const onSave = () => {
    // kiss-for-react/user-exception-outside-action
    // (No `dispatch` from `useDispatch()` in the component, so there's no fix)
    if (text === '') throw new UserException('Please enter a number');
  };
  return createElement('button', { onClick: onSave }, 'Save');
}

export function CounterView({ counter }: { counter: number }) {
  const dispatch = useDispatch();
  // kiss-for-react/user-exception-outside-action
  // (While rendering. Dispatching here would be wrong too, so there's no fix)
  if (counter < 0) throw new UserException('Invalid counter');
  return createElement('button', { onClick: () => dispatch(new SetCounter(0)) }, counter);
}

export function SaveWithTitle() {
  const dispatch = useDispatch();
  const onSave = () => {
    // kiss-for-react/user-exception-outside-action
    // (It has a title, which `UserExceptionAction` doesn't have, so there's no fix)
    throw new UserException('Please enter a valid number', { title: 'Invalid' });
  };
  return createElement('button', { onClick: onSave, onBlur: () => dispatch(new SetCounter(0)) });
}

export function ParseOnSave() {
  const dispatch = useDispatch();
  const parse = (text: string) => {
    // kiss-for-react/user-exception-outside-action
    // (The function returns a value, so it can't just `return;`, and there's no fix)
    if (text === '') throw new UserException('Please enter a number');
    return Number(text);
  };
  return createElement('button', { onClick: () => dispatch(new SetCounter(parse('1'))) });
}

export function SaveWithTry() {
  const [error, setError] = useState('');
  const onSave = () => {
    try {
      throw new UserException('Please enter a valid number'); // OK: caught below.
    } catch (e) {
      setError(String(e));
    }
  };
  return createElement('button', { onClick: onSave }, error);
}

export function SaveWithError() {
  const [text] = useState('');
  const onSave = () => {
    if (text === '') throw new Error('Unexpected'); // OK: not a `UserException`.
  };
  return createElement('button', { onClick: onSave }, 'Save');
}

class CheckedAction extends Action {
  // OK: in `before`, Kiss shows it to the user.
  before() {
    if (this.state.name === '') throw new UserException('No name');
  }

  reduce() {
    return null;
  }

  // OK: in `wrapError`, Kiss shows it to the user.
  wrapError(error: any) {
    throw new UserException('Failed').withHardCause(error);
  }
}

// OK: plain functions may be called from actions.
function parseCounter(text: string): number {
  const counter = Number(text);
  if (isNaN(counter)) throw new UserException('Please enter a valid number');
  return counter;
}

// OK: the same, for a function in a variable.
const validateCounter = (counter: number) => {
  if (counter < 0) throw new UserException('Invalid counter');
};

// ---------------------------------------------------------------------------------------------
// user-exception-without-cause

class ParseCounter extends Action {
  constructor(readonly text: string) {
    super();
  }

  reduce() {
    try {
      return this.state.copy({ counter: parseNumber(this.text) });
    } catch (error) {
      // kiss-for-react/user-exception-without-cause
      // (In a `catch`, it replaces the error, but loses it)
      // Fix (automatic): Will add `.withHardCause(error)`.
      throw new UserException('Please enter a valid number');
    }
  }
}

class LoadName extends Action {
  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }

  wrapError(e: any) {
    // kiss-for-react/user-exception-without-cause
    // (In the `wrapError` of an action)
    // Fix (automatic): Will add `.withHardCause(e)`.
    return new UserException('Could not load the name', { title: 'Error' });
  }
}

abstract class MyPersistor extends Persistor<State> {
  wrapError(error: any) {
    // kiss-for-react/user-exception-without-cause
    // (In the `wrapError` of a persistor)
    // Fix (automatic): Will add `.withHardCause(error)`.
    return new UserException('Could not save your data.');
  }
}

const storeWithoutCause = createStore<State>({
  initialState: State.initialState,
  globalWrapError: (error: any) =>
    // kiss-for-react/user-exception-without-cause
    // (In the store's `globalWrapError`)
    // Fix (automatic): Will add `.withHardCause(error)`.
    error instanceof TypeError ? new UserException('Something went wrong') : error,
});

function parseAll(texts: string[]): number[] {
  try {
    return texts.map(parseNumber);
  } catch (error) {
    if (texts.length > 1) {
      const error = 'One of the numbers is invalid';
      // kiss-for-react/user-exception-without-cause
      // (`error` is shadowed here, so there's no fix)
      throw new UserException(error);
    }
    throw new UserException('Invalid number').withHardCause(error); // OK: has the cause.
  }
}

function parseWithCause(text: string): number {
  try {
    return parseNumber(text);
  } catch (error) {
    // OK: the `hardCause` option.
    throw new UserException('Please enter a valid number', { hardCause: error });
  }
}

function parseIgnoringTheError(text: string): number {
  try {
    return parseNumber(text);
  } catch {
    throw new UserException('Please enter a valid number'); // OK: no error parameter.
  }
}

function parseIgnoringTheErrorWithUnderscore(text: string): number {
  try {
    return parseNumber(text);
  } catch (_error) {
    throw new UserException('Please enter a valid number'); // OK: `_` says it's on purpose.
  }
}

function parseWithVariable(text: string): number {
  try {
    return parseNumber(text);
  } catch (error) {
    // OK: stored in a variable, which may get the cause later.
    const exception = new UserException('Please enter a valid number');
    throw exception.withHardCause(error);
  }
}

// ---------------------------------------------------------------------------------------------
// throw-in-global-wrap-error

class NetworkError extends Error {}

const storeWithThrow = createStore<State>({
  initialState: State.initialState,
  globalWrapError: (error: any) => {
    // kiss-for-react/throw-in-global-wrap-error
    // (Kiss uses it like a returned error, but returning it makes clear that it replaces the error)
    // Fix (automatic): Will change `throw` to `return`.
    if (error instanceof NetworkError) throw new UserException('Offline').withHardCause(error);
    return error; // OK
  },
});

const storeWithMethod = new Store<State>({
  initialState: State.initialState,
  globalWrapError(error: any) {
    // kiss-for-react/throw-in-global-wrap-error
    // (A method, in `new Store`)
    // Fix (automatic): Will change `throw` to `return`.
    if (error instanceof NetworkError) throw new UserException('Offline').withHardCause(error);
    return error;
  },
});

function globalWrapError(error: any) {
  // kiss-for-react/throw-in-global-wrap-error
  // (A function declared in the same file, and given to the store below)
  // Fix (automatic): Will change `throw` to `return`.
  if (error instanceof NetworkError) throw new UserException('Offline').withHardCause(error);
  return error;
}

const storeWithFunction = createStore<State>({
  initialState: State.initialState,
  globalWrapError,
});

const storeWithReturnType = createStore<State>({
  initialState: State.initialState,
  globalWrapError: (error: any): UserException => {
    if (error instanceof UserException) return error;
    // kiss-for-react/throw-in-global-wrap-error
    // (It declares a return type, which an `Error` doesn't match, so there's no fix)
    throw new Error('Unexpected');
  },
});

const storeWithTry = createStore<State>({
  initialState: State.initialState,
  globalWrapError: (error: any) => {
    try {
      if (error === null) throw new Error('No error'); // OK: caught below.
    } catch (e) {
      return e;
    }
    // OK: a function declared inside `globalWrapError`.
    const check = () => {
      throw new Error('Never called');
    };
    console.log(check);
    return error;
  },
});
