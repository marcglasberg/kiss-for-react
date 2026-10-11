Feature: LogOut and dispatchWhen

  Scenario Outline: A dispatchWhen met by the state that logOut applies is not dispatched.
    Given A store with a persistor, and the user "bob" logged in.
    And A dispatchWhen, to log in "bob" again when there is no user.
    And The store [Shut down].
    When logOut runs, and changes the state to the initial-state, with no user.
    Then The dispatchWhen action is not dispatched.
    And The state is the initial-state of logOut.
    And The persisted state is the initial-state of logOut.
    Examples: 
      | Shut down                   |
      | is not shut down            |
      | was shut down before logOut |

  Scenario Outline: Actions dispatched by the [Observer] while logOut applies its state are not dispatched.
    Given A [Observer] that dispatches an action to log in "bob", when logOut applies its state.
    When logOut runs, and changes the state to the initial-state, with no user.
    Then The action dispatched by the [Observer] is not dispatched.
    And The state is the initial-state of logOut.
    Examples: 
      | Observer       |
      | stateObserver  |
      | actionObserver |

  Scenario: A dispatchWhen called before logOut is cancelled by logOut.
    Given A dispatchWhen, called before logOut, to dispatch an action when n is 5.
    And It has a timeout of 50 ms, and an onTimeout.
    When logOut runs and finishes, and then the state changes to n = 5.
    Then The dispatchWhen action is not dispatched.
    And The onTimeout is not called, even after the timeout.

  Scenario: A dispatchWhen called after logOut works normally.
    Given A logOut that already finished.
    And A dispatchWhen, to dispatch an action when n is 5.
    When The state changes to n = 5.
    Then The dispatchWhen action is dispatched.
