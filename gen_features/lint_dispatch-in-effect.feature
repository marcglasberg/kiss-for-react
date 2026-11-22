Feature: Lint: dispatch-in-effect

  Scenario: Dispatching in an effect when the component mounts is a warning, with a suggestion to use useStoreEffect.
    Given A store with a persistor, created in another file.
    And A component that gets dispatch from useDispatch(), and dispatches in useEffect with empty deps.
    When The code is linted.
    Then There is a warning in the dispatch, saying the store may not be ready.
    And The suggestion replaces the effect with useStoreEffect({ onMount }), and removes the unused dispatch.
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
    And The suggestion is useStoreEffect({ {Options} }), with deps {NewDeps}.
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
    And The suggestion is useStoreEffect({ onMount, onUnmount }), and compiles.

  Scenario Outline: The suggestion imports useStoreEffect, and removes the import of useDispatch when it is not used anymore.
    Given A component that dispatches in an effect, with a dispatch from useDispatch().
    And The import from kiss-for-react is: {Import}.
    And The component {Uses} useDispatch in another place.
    When The suggestion is applied.
    Then The import from kiss-for-react is: {NewImport}.
    And The code with the suggestion compiles, and has no warnings.
    Examples: 
      | Import                          | Uses         | NewImport                       |
      | { useDispatch }                 | does not use | { useStoreEffect }              |
      | { useDispatch, useSelect }      | does not use | { useStoreEffect, useSelect }   |
      | { useDispatch }                 | uses         | { useDispatch, useStoreEffect } |
      | { useDispatch, useStoreEffect } | does not use | { useStoreEffect }              |

  Scenario Outline: Effects that can't be converted are reported without a suggestion.
    Given A component that dispatches in an effect {Effect}.
    When The code is linted.
    Then There is a warning, without a suggestion.
    Examples: 
      | Effect                                            | Code                                                                                                                                                            |
      | with deps that change, and a cleanup              | \n  useEffect(() => {\n    dispatch(new LoadUser(userId));\n    return () => dispatch(new StopListening());\n  }, [userId]);                                    |
      | with a cleanup that uses a variable of the effect | \n  useEffect(() => {\n    const timer = setInterval(() => {}, 1000);\n    dispatch(new FetchCards());\n    return () => clearInterval(timer);\n  }, []);       |
      | that returns a cleanup in the middle              | \n  useEffect(() => {\n    dispatch(new FetchCards());\n    if (userId === '') return () => dispatch(new StopListening());\n    console.log(userId);\n  }, []); |

  Scenario Outline: Effects that don't dispatch when the component mounts are fine.
    Given {Given}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Given                                         | Code                                                                                                                                                                      |
      | A dispatch in a callback inside the effect    | \n  useEffect(() => {\n    const timer = setTimeout(() => dispatch(new FetchCards()), 1000);\n    return () => clearTimeout(timer);\n  }, []);                            |
      | An effect without a deps array                | \n  useEffect(() => dispatch(new FetchCards()));                                                                                                                          |
      | An effect that checks useIsStoreReady()       | \n  const isReady = useIsStoreReady();\n  useEffect(() => {\n    if (isReady) dispatch(new FetchCards());\n  }, [isReady]);                                               |
      | An effect that waits for store.ready()        | \n  const { store } = useStore();\n  useEffect(() => {\n    store.ready().then(() => store.dispatch(new FetchCards()));\n  }, []);                                        |
      | A dispatchWhen, which waits for its condition | \n  const dispatchWhen = useDispatchWhen();\n  useEffect(() => {\n    dispatchWhen(new FetchCards(), (state: State) => state.count > 0, { timeoutMillis: 0 });\n  }, []); |
      | The onMount of useStoreEffect                 | \n  useStoreEffect({ onMount: (store) => store.dispatch(new FetchCards()) });                                                                                             |

  Scenario Outline: Effects outside components and hooks, or not from React, are not reported.
    Given {Given}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Given                                                   | Code                                                                                                                                                                                                                                                                                                                                                                                         |
      | An effect in a function that is not a component or hook | import React, { useEffect, useLayoutEffect } from 'react';\nimport { useDispatch, useDispatchAndWait, useDispatchWhen, useIsStoreReady, useStore, useStoreEffect } from 'kiss-for-react';\nimport { FetchCards, LoadUser, State, StopListening } from './state';\n\nexport function setUp(dispatch: (action: FetchCards) => void) {\n  useEffect(() => dispatch(new FetchCards()), []);\n}\n |
      | A useEffect function that is not from React             | import { useDispatch } from 'kiss-for-react';\nimport { FetchCards } from './state';\n\nfunction useEffect(effect: () => void, _deps: unknown[]) { effect(); }\n\nexport function Cards() {\n  const dispatch = useDispatch();\n  useEffect(() => dispatch(new FetchCards()), []);\n  return <p>Cards</p>;\n}\n                                                                              |

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
