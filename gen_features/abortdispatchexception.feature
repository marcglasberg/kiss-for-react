Feature: AbortDispatchException

  Scenario: An action that throws an AbortDispatchException from its before method is aborted.
    Given An ASYNC action whose before method throws an AbortDispatchException after an async check.
    When The action is dispatched with dispatchAndWait.
    Then The reduce method does not run, and the state does not change.
    And The after method runs.
    And The dispatchAndWait resolves with a status that says the dispatch was aborted.

  Scenario: A sync action that throws an AbortDispatchException from its reduce method is aborted silently.
    Given A SYNC action whose reduce method throws an AbortDispatchException.
    When The action is dispatched with dispatch and with dispatchSync.
    Then No error is thrown.
    And The action status says the dispatch was aborted.

  Scenario: An AbortDispatchException is not processed as an error.
    Given A store with a globalWrapError and an errorObserver.
    And An action with a wrapError, that throws an AbortDispatchException.
    When The action is dispatched.
    Then The wrapError, globalWrapError and errorObserver are not called.
    And The action does not count as failed, and no error is shown to the user.

  Scenario: An action with retry is not retried when it throws an AbortDispatchException.
    Given An ASYNC action with retry, whose reduce method throws an AbortDispatchException.
    When The action is dispatched.
    Then The reduce method runs only once.
    And The dispatch is aborted.

  Scenario: An OptimisticCommand is not retried when its command throws an AbortDispatchException.
    Given An OptimisticCommand with retry, whose sendCommandToServer throws an AbortDispatchException.
    When The command is dispatched.
    Then The command is sent only once.
    And The optimistic value is rolled back.
    And The dispatch is aborted.

  Scenario: An action that throws an AbortDispatchException does not keep its data fresh.
    Given An ASYNC action with fresh, whose before method throws an AbortDispatchException.
    When The action is dispatched, and then dispatched again within the fresh period, without aborting.
    Then The second dispatch runs.

  Scenario: A dispatch aborted before running also says it was aborted.
    Given Actions whose dispatch is aborted before they run.
    And They are aborted by abortDispatch, nonReentrant, throttle, fresh, a null mock, and a shut down store.
    When The actions are dispatched with dispatchAndWait.
    Then The returned status says the dispatch was aborted, and the action was not dispatched.

  Scenario: A dispatch that is not aborted does not say it was aborted.
    Given An action that succeeds, and an action that fails with a UserException.
    When The actions are dispatched with dispatchAndWait.
    Then Their status does not say the dispatch was aborted.
