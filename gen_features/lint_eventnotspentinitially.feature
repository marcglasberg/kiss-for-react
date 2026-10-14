Feature: Lint: event-not-spent-initially

  Scenario Outline: Spent events in the initial state, and new events in reducers, are fine.
    Given A state class whose static initialState uses Evt.spent() and EvtState.spent().
    And An action whose reducer puts a new Evt in the state.
    And A store created with the static initialState.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: New events in a static initialState property are a warning, with a suggestion to use spent events.
    Given A state class whose static initialState property creates new events, one with type arguments.
    When The code is linted, with or without type information.
    Then There is a warning on each new event.
    And The suggestion replaces it with Evt.spent() (or EvtState.spent()), keeping the type arguments.
    And The code with all the suggestions applied compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: New events in a static initialState getter or method are a warning.
    Given A state class whose static initialState is a getter or a method, and creates a new event.
    When The code is linted.
    Then There is a warning on the new event.
    Examples: 
      | Initial state                                                                                                       |
      | static get initialState(): State { return new State(new Evt(), Evt.spent(), EvtState.spent()); }                    |
      | static initialState(): State { return new State(new Evt(), Evt.spent(), EvtState.spent()); }                        |
      | static initialState(): State { const scroll = new Evt(); return new State(scroll, Evt.spent(), EvtState.spent()); } |

  Scenario Outline: New events in the initialState given to createStore, new Store or logOut are a warning.
    Given A store created (or logged out) with an initial state that creates a new event.
    When The code is linted, with or without type information.
    Then There is a warning on the new event, with a suggestion.
    Examples: 
      | Type information | Code                                                                                                                                                                                         |
      | true             | export const store = createStore<State>({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) });                                                                              |
      | false            | export const store = createStore({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) });                                                                                     |
      | true             | export const store = new Store<State>({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) });                                                                                |
      | true             | export const store = createStore<State>({ initialState: State.initialState });
export const loggedOut = store.logOut({ initialState: new State(new Evt(), Evt.spent(), EvtState.spent()) }); |

  Scenario: New events outside the initial state are fine.
    Given New events created in a reducer, in a plain function, and in an unrelated static field.
    When The code is linted.
    Then There are no warnings.

  Scenario: A class named Evt that is not from Kiss is not reported, and nothing is reported in tests.
    Given A local class named Evt, created in a static initialState.
    And A test file with a new Kiss Evt in a static initialState.
    When The code is linted.
    Then There are no warnings.
