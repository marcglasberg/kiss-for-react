Feature: Lint: dispatch-in-effect

  Scenario: Dispatching in an effect when the component mounts is a warning, with a suggestion to use onMount.
    Given A store with a persistor, created in another file.
    And A component that gets dispatch from useDispatch(), and dispatches in useEffect with empty deps.
    When The code is linted.
    Then There is a warning in the dispatch, saying the store may not be ready.
    And The suggestion replaces the effect with useDispatch({ onMount }), and removes the unused dispatch.
    And The code with the suggestion compiles, and has no warnings.

  Scenario Outline: The dispatch functions of the component are recognized.
    Given A component that dispatches in {Effect}, with {Dispatch}.
    When The code is linted.
    Then There is a warning in {Callee}.
    And The suggestion dispatches with {Replacement}, and compiles.
    Examples: 
      | Effect          | Dispatch                                     | Callee              | Replacement           |
      | useEffect       | const dispatch = useDispatch()               | dispatch            | store.dispatch        |
      | useLayoutEffect | const dispatchAndWait = useDispatchAndWait() | dispatchAndWait     | store.dispatchAndWait |
      | React.useEffect | const store = useStore()                     | store.dispatch      | store.dispatch        |
      | useEffect       | const { dispatch } = useStore()              | dispatch            | store.dispatch        |
      | useEffect       | const kiss = useStore()                      | kiss.store.dispatch | store.dispatch        |

  Scenario Outline: The deps of the effect become deps, onMount and onDepsChange.
    Given A component that dispatches in an effect with deps {Deps}.
    When The code is linted.
    Then There is a warning.
    And The suggestion is useDispatch({ {Options} }), with deps {NewDeps}.
    And The code with the suggestion compiles.
    Examples: 
      | Deps               | Options                     | NewDeps          |
      | [userId]           | deps, onMount, onDepsChange | userId           |
      | [userId, filter]   | deps, onMount, onDepsChange | [userId, filter] |
      | [dispatch, userId] | deps, onMount, onDepsChange | userId           |
      | [dispatch]         | onMount                     | (none)           |

  Scenario: The cleanup function of the effect becomes onUnmount.
    Given A component that dispatches in an effect with empty deps, and a cleanup that dispatches too.
    When The code is linted.
    Then There is a warning.
    And The suggestion is useDispatch({ onMount, onUnmount }), and compiles.

  Scenario Outline: Effects that can't be converted are reported without a suggestion.
    Given A component that dispatches in an effect {Effect}.
    When The code is linted.
    Then There is a warning, without a suggestion.
    Examples: 
      | Effect                                            | Code                                                                                                                                                       |
      | with deps that change, and a cleanup              | 
  useEffect(() => {
    dispatch(new LoadUser(userId));
    return () => dispatch(new StopListening());
  }, [userId]);                                   |
      | with a cleanup that uses a variable of the effect | 
  useEffect(() => {
    const timer = setInterval(() => {}, 1000);
    dispatch(new FetchCards());
    return () => clearInterval(timer);
  }, []);       |
      | that returns a cleanup in the middle              | 
  useEffect(() => {
    dispatch(new FetchCards());
    if (userId === '') return () => dispatch(new StopListening());
    console.log(userId);
  }, []); |

  Scenario Outline: Effects that don't dispatch when the component mounts are fine.
    Given {Given}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Given                                         | Code                                                                                                                                                                  |
      | A dispatch in a callback inside the effect    | 
  useEffect(() => {
    const timer = setTimeout(() => dispatch(new FetchCards()), 1000);
    return () => clearTimeout(timer);
  }, []);                            |
      | An effect without a deps array                | 
  useEffect(() => dispatch(new FetchCards()));                                                                                                                       |
      | An effect that checks useIsStoreReady()       | 
  const isReady = useIsStoreReady();
  useEffect(() => {
    if (isReady) dispatch(new FetchCards());
  }, [isReady]);                                               |
      | An effect that waits for store.ready()        | 
  const { store } = useStore();
  useEffect(() => {
    store.ready().then(() => store.dispatch(new FetchCards()));
  }, []);                                        |
      | A dispatchWhen, which waits for its condition | 
  const dispatchWhen = useDispatchWhen();
  useEffect(() => {
    dispatchWhen(new FetchCards(), (state: State) => state.count > 0, { timeoutMillis: 0 });
  }, []); |
      | The onMount option of useDispatch             | 
  useDispatch({ onMount: (store) => store.dispatch(new FetchCards()) });                                                                                             |

  Scenario Outline: Effects outside components and hooks, or not from React, are not reported.
    Given {Given}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Given                                                   | Code                                                                                                                                                                                                                                                                                                                                                                  |
      | An effect in a function that is not a component or hook | import React, { useEffect, useLayoutEffect } from 'react';
import { useDispatch, useDispatchAndWait, useDispatchWhen, useIsStoreReady, useStore } from 'kiss-for-react';
import { FetchCards, LoadUser, State, StopListening } from './state';

export function setUp(dispatch: (action: FetchCards) => void) {
  useEffect(() => dispatch(new FetchCards()), []);
}
 |
      | A useEffect function that is not from React             | import { useDispatch } from 'kiss-for-react';
import { FetchCards } from './state';

function useEffect(effect: () => void, _deps: unknown[]) { effect(); }

export function Cards() {
  const dispatch = useDispatch();
  useEffect(() => dispatch(new FetchCards()), []);
  return <p>Cards</p>;
}
                                                                 |

  Scenario Outline: With type information, it's only reported if the project creates a store with a persistor.
    Given A component that dispatches in an effect with empty deps.
    And The project {Persistor} a store with a persistor.
    When The code is linted {Types} type information.
    Then There is a warning: {Reported}.
    Examples: 
      | Persistor       | Types   | Reported |
      | creates         | with    | true     |
      | does not create | with    | false    |
      | does not create | without | true     |
