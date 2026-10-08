Feature: Store constructor

  Scenario: Creating a store with only the initial state.
    Given Only the `initialState` is provided.
    When The store is created with `createStore` or `new Store`.
    Then It compiles, and the store works with the initial state.

  Scenario: The default logger prints state changes to the console.
    Given Neither `logger` nor `logStateChanges` is provided.
    When An action changes the state.
    Then The state change is printed with `console.log`.

  Scenario: A custom logger receives the state changes.
    Given A `logger` is provided, but `logStateChanges` is not.
    When An action changes the state.
    Then The state change is sent to the custom logger (`logStateChanges` defaults to true).

  Scenario: State changes are not logged when `logStateChanges` is false.
    Given A `logger` is provided, and `logStateChanges` is false.
    When An action changes the state.
    Then The state change is not sent to the logger.
