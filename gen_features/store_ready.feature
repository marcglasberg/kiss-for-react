Feature: Store ready

  Scenario: Waiting for the store to be ready waits until the persisted state is loaded.
    Given There is some state already persisted.
    And Reading the persisted state takes some time.
    When The store is created, and we wait for it to be ready.
    Then Before it is ready, the store has the initial-state.
    And After it is ready, the store has the persisted state.
    And The persisted state was read only once.

  Scenario: Actions dispatched after the store is ready are not overwritten by the persisted state.
    Given There is some state already persisted.
    When The store is created, we wait for it to be ready, and then an action is dispatched.
    Then The action changes the persisted state, and the change is kept.

  Scenario: A store without a persistor is ready right away.
    Given A store without a persistor.
    When We wait for the store to be ready.
    Then It is ready, and has the initial-state.

  Scenario: The store is ready even when reading the persisted state fails.
    Given Reading the persisted state throws an error.
    When We wait for the store to be ready.
    Then The wait does not fail, and the store keeps the initial-state.

  Scenario: Waiting for the store to be ready many times does not read the persisted state again.
    Given There is some state already persisted.
    When We wait for the store to be ready, twice.
    Then Both waits return the same promise.
    And The persisted state was read only once.
