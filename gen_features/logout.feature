Feature: LogOut

  Scenario: After logOut, the store state is the given initial-state.
    Given A store with a persistor, and a state that was changed by actions.
    When We call logOut with a new initial-state.
    Then When logOut returns, the store state is the initial-state.

  Scenario: logOut deletes the persisted state, and then persists the initial-state.
    Given A store with a persistor, and a persisted state.
    When We call logOut.
    Then The persisted state is deleted.
    And The initial-state is persisted afterwards.

  Scenario: logOut waits until all the logout work is done before returning.
    Given A store with a slow persistor.
    When We await logOut.
    Then It returns only after the throttle, the deletion, and the persistence of the initial-state.

  Scenario: After logOut, the persistor keeps persisting new state changes.
    Given A store with a persistor.
    When We call logOut.
    And Then dispatch an action that changes the state.
    Then The new state is persisted.
    And The persistor is not paused.

  Scenario: During logOut the store does not accept new actions. After logOut it does.
    Given A store with a persistor.
    When We dispatch an action while logOut is running.
    Then The action is ignored.
    And Actions dispatched after logOut returns are accepted.

  Scenario: logOut waits for running actions to finish before deleting the state.
    Given A store with a persistor, and an async action that is running.
    When We call logOut with a short throttle and a long actionsThrottle.
    Then The state is only deleted after the action finishes.
    And The final store state is the initial-state, not the state the action created.

  Scenario: logOut does not wait for running actions longer than actionsThrottle.
    Given A store with a persistor, and an async action that takes very long.
    When We call logOut with a short actionsThrottle.
    Then The state is deleted and logOut returns, without waiting for the action.

  Scenario: logOut cancels a pending throttled persistence.
    Given A store with a persistor that has a throttle.
    And A state change that is waiting for the throttle to persist.
    When We call logOut.
    Then The pending state is never persisted.

  Scenario: logOut called while the state is being persisted waits for that persistence to finish.
    Given A store with a slow persistor.
    And A state change that is currently being persisted.
    When We call logOut and await it.
    Then The state is only deleted after the ongoing persistence finishes.
    And logOut only returns after the whole logout is done.

  Scenario: logOut restores the store and the persistor even if deleting the state fails.
    Given A store with a persistor whose deleteState throws.
    When We call logOut.
    Then logOut rejects with the error.
    And The store accepts actions again, and the persistor is not paused.

  Scenario: logOut without a persistor does nothing.
    Given A store without a persistor.
    When We call logOut.
    Then It returns without error.
