Feature: LogOut keeps the persistor paused and the store shut down

  Scenario: A persistor paused before logOut stays paused after logOut.
    Given A store with a persistor, and a state that was changed by actions.
    And The persistor is paused.
    When We call logOut.
    Then The persisted state is deleted, and the initial-state is persisted.
    And After logOut, state changes are not persisted, since the persistor is still paused.

  Scenario: A persistor paused before logOut persists the new state changes when it is resumed after logOut.
    Given A store with a persistor that is paused.
    And We called logOut, and then changed the state.
    When The persistor is resumed.
    Then The new state is persisted.

  Scenario: A store shut down before logOut stays shut down after logOut.
    Given A store with a persistor, and a state that was changed by actions.
    And The store is shut down.
    When We call logOut.
    Then The store state is the initial-state, and it is persisted.
    And After logOut, the store still does not accept new actions.

  Scenario: Without a persistor, a store shut down before logOut stays shut down after logOut.
    Given A store without a persistor, and a state that was changed by actions.
    And The store is shut down.
    When We call logOut.
    Then The store state is the initial-state.
    And After logOut, the store still does not accept new actions.

  Scenario: A persistor paused while logOut is running stays paused after logOut.
    Given A store with a persistor.
    And logOut is running.
    When The persistor is paused.
    Then After logOut, state changes are not persisted, since the persistor is still paused.

  Scenario: A persistor resumed while logOut is running does not persist the old state.
    Given A store with a persistor, and a persisted state.
    And logOut is running, and is deleting the persisted state.
    When The persistor is resumed.
    Then The old state is not persisted again. Only the initial-state is persisted.
    And After logOut, the persistor persists the new state changes.

  Scenario: A store shut down while logOut is running stays shut down after logOut.
    Given A store with a persistor.
    And logOut is running.
    When The store is shut down.
    Then After logOut, the store state is the initial-state.
    And After logOut, the store still does not accept new actions.

  Scenario: A store restarted while logOut is running only accepts new actions after logOut.
    Given A store with a persistor, that is shut down.
    And logOut is running.
    When The store is restarted (it is no longer shut down).
    Then While logOut is running, the store still does not accept new actions.
    And After logOut, the store accepts new actions.

  Scenario: After two logOuts that run at the same time, the store accepts actions and the persistor is not paused.
    Given A store with a persistor, that is not shut down, and whose persistor is not paused.
    When We call logOut twice, without waiting for the first one to finish.
    Then After both finish, the store state is the initial-state of the last logOut.
    And The store accepts new actions, and they are persisted.
