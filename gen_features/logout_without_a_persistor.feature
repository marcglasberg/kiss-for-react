Feature: LogOut without a persistor

  Scenario: Without a persistor, logOut returns the store state to the given initial-state.
    Given A store without a persistor, and a state that was changed by actions.
    When We call logOut with a new initial-state.
    Then When logOut returns, the store state is the initial-state.

  Scenario: Without a persistor, logOut waits for the throttle before returning.
    Given A store without a persistor.
    When We await logOut with some throttle.
    Then It returns only after the throttle, and the state is the initial-state.

  Scenario: Without a persistor, during logOut the store does not accept new actions. After logOut it does.
    Given A store without a persistor.
    When We dispatch an action while logOut is running.
    Then The action is ignored.
    And Actions dispatched after logOut returns are accepted.

  Scenario: Without a persistor, logOut waits for running actions to finish before resetting the state.
    Given A store without a persistor, and an async action that is running.
    When We call logOut with a short throttle and a long actionsThrottle.
    Then logOut returns only after the action finishes.
    And The final store state is the initial-state, not the state the action created.

  Scenario: Without a persistor, logOut does not wait for running actions longer than actionsThrottle.
    Given A store without a persistor, and an async action that takes very long.
    When We call logOut with a short actionsThrottle.
    Then logOut returns without waiting for the action, and the state is the initial-state.

  Scenario: Without a persistor, logOut clears the internal action props, so fresh actions run again.
    Given A store without a persistor.
    And An action with fresh, that was dispatched, and whose data is still fresh.
    When We call logOut.
    And The action with fresh is dispatched again.
    Then It runs again, even though its fresh period has not ended.
