Feature: LogOut with no time to wait for running actions

  Scenario Outline: logOut does not wait for running actions when actionsThrottle is zero or negative.
    Given A store with an action that never finishes.
    When We call logOut with no throttle, and an actionsThrottle of [Actions throttle] ms.
    Then logOut finishes right away, without waiting for the action.
    And The store state is the initial-state.
    Examples: 
      | Actions throttle |
      | 0                |
      | -1               |

  Scenario: An action can call logOut with an actionsThrottle of zero, and wait for it.
    Given An action that calls logOut with no throttle and an actionsThrottle of 0 ms, and waits for it.
    When The action is dispatched, and we wait for it.
    Then logOut finishes right away, even though the action calling it is still running.
    And The action finishes (as aborted, since it was dispatched before logOut).
    And The store state is the initial-state.

  Scenario: logOut still waits for running actions when actionsThrottle is positive, but at most actionsThrottle.
    Given A store with an action that never finishes.
    When We call logOut with no throttle, and an actionsThrottle of 100 ms.
    Then logOut finishes after about 100 ms.
    And The store state is the initial-state.
