Feature: Lint: dispatch-before-store-ready

  Scenario Outline: Dispatching right after creating a store with a persistor is an error.
    Given A store created with {Creation}, with a persistor, at the top level of a module.
    When An action is dispatched with {Method}, without waiting for store.ready().
    Then There is an error, saying to wait for store.ready().
    And The suggestion adds "await store.ready();" before the dispatch.
    Examples: 
      | Creation    | Method          |
      | createStore | dispatch        |
      | new Store   | dispatchSync    |
      | createStore | dispatchAndWait |

  Scenario Outline: Inside a function, the suggestion is only offered when the function is async.
    Given A function that creates a store with a persistor, and dispatches right away.
    When The function is {Kind}.
    Then There is an error.
    And There is a suggestion: {Suggestion}.
    Examples: 
      | Kind      | Suggestion |
      | async     | true       |
      | not async | false      |

  Scenario Outline: Dispatching after waiting for the store, or without a persistor, is fine.
    Given {Given}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Given                                                      | Code                                                                                                                                                                      |
      | A dispatch after await store.ready()                       | 
const store = createStore<State>({ initialState: State.initialState, persistor });
await store.ready();
store.dispatch(new InitApp());                                   |
      | A dispatch after awaiting a Promise.all with store.ready() | 
const store = createStore<State>({ initialState: State.initialState, persistor });
await Promise.all([store.ready(), Promise.resolve()]);
store.dispatch(new InitApp()); |
      | A dispatch in a callback of store.ready()                  | 
const store = createStore<State>({ initialState: State.initialState, persistor });
store.ready().then(() => store.dispatch(new InitApp()));                              |
      | A store without a persistor                                | 
const store = createStore<State>({ initialState: State.initialState });
store.dispatch(new InitApp());                                                                   |
      | A store with an undefined persistor                        | 
const store = createStore<State>({ initialState: State.initialState, persistor: undefined });
store.dispatch(new InitApp());                                             |

  Scenario: Only dispatches before the first wait for store.ready() are reported.
    Given A store with a persistor, dispatched once before and once after await store.ready().
    When The code is linted.
    Then Only the first dispatch is reported.

  Scenario: Stores that are not Kiss stores are not reported.
    Given A function called createStore that is not imported from Kiss.
    When It creates a store with a persistor, and dispatches right away.
    Then There are no errors.
