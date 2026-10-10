Feature: Abort when there is no internet

  Scenario: An action with checkInternet abort is aborted silently when there is no internet.
    Given An ASYNC action with checkInternet set to abort.
    And There is no internet.
    When The action is dispatched.
    Then The reduce method does not run, and the state does not change.
    And The after method runs.
    And The dispatch is aborted, and the action does not fail.
    And No error is shown to the user.

  Scenario: An action with checkInternet abort runs normally when there is internet.
    Given An ASYNC action with checkInternet set to abort.
    And There is internet.
    When The action is dispatched.
    Then The action runs, and changes the state.

  Scenario Outline: Only one of dialog and abort can be used in checkInternet.
    Given An action whose checkInternet has both a dialog and abort.
    When The action is dispatched.
    Then It throws a StoreException.
    Examples: 
      | dialog |
      | true   |
      | false  |

  Scenario: A sequential action aborted for having no internet releases the queue.
    Given An ASYNC sequential action with checkInternet set to abort.
    And There is no internet.
    When It is dispatched, followed by another sequential action.
    Then The first action is aborted, and the second action runs normally.

  Scenario: An OptimisticCommand with checkInternet abort does nothing when there is no internet.
    Given An OptimisticCommand with checkInternet set to abort.
    And There is no internet.
    When The command is dispatched.
    Then The optimistic value is not applied, and the command is not sent.
    And The dispatch is aborted.
