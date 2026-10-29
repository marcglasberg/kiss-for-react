Feature: Check internet without calling super

  Scenario: An action that overrides before without calling super still checks the internet.
    Given An action with checkInternet set to dialog: true.
    And The action overrides before, and does not call super.before.
    And There is no internet.
    When The action is dispatched.
    Then The action fails with the default no-internet UserException, which opens a dialog.
    And The before and reduce methods do not run, and the state does not change.
    And The after method runs.

  Scenario: When there is internet, the internet check runs before the before method.
    Given An action with checkInternet set to dialog: true.
    And The action overrides before, and does not call super.before.
    And There is internet.
    When The action is dispatched.
    Then The internet is checked first, then before, reduce and after run.
    And The state is changed by the reducer.

  Scenario: An action that overrides before without calling super is aborted when there is no internet.
    Given An action with checkInternet set to abort: true.
    And The action overrides before, and does not call super.before.
    And There is no internet.
    When The action is dispatched.
    Then The dispatch is aborted, and the action does not fail.
    And The before and reduce methods do not run, and the after method runs.

  Scenario Outline: The action can change the no-internet error with noInternetException.
    Given An action with checkInternet set to the given dialog option.
    And The action overrides noInternetException, to return its own UserException, which opens a dialog.
    And There is no internet.
    When The action is dispatched.
    Then The action fails with the UserException of noInternetException.
    And The exception opens a dialog only if the dialog option is true.
    Examples: 
      | dialog |
      | true   |
      | false  |

  Scenario: When there is internet, noInternetException is not called.
    Given An action with checkInternet, which overrides noInternetException.
    And There is internet.
    When The action is dispatched.
    Then The action completes successfully, and noInternetException is not called.

  Scenario: With abort: true, noInternetException is not called.
    Given An action with checkInternet set to abort: true, which overrides noInternetException.
    And There is no internet.
    When The action is dispatched.
    Then The dispatch is aborted, and noInternetException is not called.

  Scenario: The no-internet error goes to wrapError, like the errors of before.
    Given An action with checkInternet set to dialog: true, which overrides wrapError.
    And There is no internet.
    When The action is dispatched.
    Then The wrapError method receives the no-internet UserException.
    And The action fails with the error that wrapError returned.

  Scenario: A sequential action that overrides before without calling super checks the internet on its turn.
    Given A sequential action with checkInternet set to dialog: true.
    And The action overrides before, and does not call super.before.
    And There is no internet.
    When The action is dispatched.
    Then The action fails with the no-internet UserException.
    And The before and reduce methods do not run.

  Scenario: An action with checkInternet is async, even if its before and reduce are sync.
    Given An action with checkInternet, and a sync before and a sync reduce.
    And There is internet.
    When The action is dispatched with dispatchSync.
    Then The dispatchSync throws a StoreException, which says the action uses checkInternet.
    And When the action is dispatched with dispatchAndWait, it completes successfully.

  Scenario: An action without checkInternet whose before and reduce are sync stays sync.
    Given An action without checkInternet, with a sync before and a sync reduce.
    When The action is dispatched with dispatchSync.
    Then The state changes before dispatchSync returns.
