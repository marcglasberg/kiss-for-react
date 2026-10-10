Feature: useIsWaiting after an action fails

  Scenario: The spinner shows while an action runs, and hides when it fails.
    Given A component that shows a spinner while an action is in progress.
    And Another component that shows an error message if that action failed.
    When The action is dispatched, and later fails.
    Then The spinner shows while the action is in progress.
    And The spinner hides when the action fails, and the error message shows.

  Scenario Outline: The spinner shows when an action that failed is dispatched again.
    Given A component that shows a spinner while an action is in progress.
    And Another component that uses {Hook} to show an error message if that action failed.
    And The action was dispatched and failed.
    When The action is dispatched again, and this time it succeeds.
    Then The spinner shows while the action is in progress, and the error message hides.
    And The spinner hides when the action finishes, and the error message stays hidden.
    Examples: 
      | Hook            |
      | useIsFailed     |
      | useExceptionFor |

  Scenario: The spinner shows when an action that failed is dispatched again, and fails again.
    Given A component that shows a spinner while an action is in progress.
    And Another component that shows an error message if that action failed.
    And The action was dispatched and failed.
    When The action is dispatched again, and fails again.
    Then The spinner shows while the action is in progress, and the error message hides.
    And The spinner hides when the action fails, and the error message shows again.

  Scenario: The spinner shows when an action that failed with an error that is not a UserException is dispatched again.
    Given A component that shows a spinner while an action is in progress.
    And Another component that shows an error message if that action failed.
    And The action was dispatched and failed with an error that is not a UserException.
    When The action is dispatched again.
    Then The spinner shows while the action is in progress.
    And The spinner hides when the action finishes.

  Scenario: A spinner for a base class shows when a subclass action that failed is dispatched again.
    Given A component that shows a spinner while an action of a base class is in progress.
    And Another component that shows an error message if a subclass action failed.
    And The subclass action was dispatched and failed.
    When The subclass action is dispatched again.
    Then The spinner shows while the subclass action is in progress.
    And The spinner hides when the subclass action finishes.

  Scenario: The spinner shows when an action that failed is dispatched again, if nothing shows the error.
    Given A component that shows a spinner while an action is in progress.
    And No component shows if that action failed.
    And The action was dispatched and failed.
    When The action is dispatched again.
    Then The spinner shows while the action is in progress.
    And The spinner hides when the action finishes.

  Scenario: The spinner shows when an action that failed is dispatched again, if the same component shows the error.
    Given A component that shows a spinner while an action is in progress.
    And The same component also shows an error message if that action failed.
    And The action was dispatched and failed.
    When The action is dispatched again.
    Then The spinner shows while the action is in progress, and the error message hides.
    And The spinner hides when the action finishes.

  Scenario: The spinner shows when an action that failed is dispatched again, after its error was cleared.
    Given A component that shows a spinner while an action is in progress.
    And Another component that shows an error message if that action failed.
    And The action was dispatched and failed.
    And The error was cleared with clearExceptionFor.
    When The action is dispatched again.
    Then The spinner shows while the action is in progress.
    And The spinner hides when the action finishes.

  Scenario: The spinner for one action is not affected when a different action that failed is dispatched again.
    Given A component that shows a spinner while action A is in progress.
    And Another component that shows an error message if action B failed.
    And Action B was dispatched and failed.
    When Action B is dispatched again.
    Then The spinner for action A stays hidden.
