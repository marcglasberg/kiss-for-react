Feature: Misconfigured actions whose dispatch would be aborted

  Scenario: An optimistic command with nonReentrant throws, even when its key is already running.
    Given An optimistic command with key "k", whose server call is still running.
    And Another optimistic command with the same key "k", that also sets nonReentrant to true.
    When The second command is dispatched.
    Then The dispatch throws a StoreException, instead of being silently aborted.
    And The state does not change.

  Scenario: An optimistic command with unlimited retries throws, even when its key is already running.
    Given An optimistic command with key "k", whose server call is still running.
    And Another optimistic command with the same key "k", that has unlimited retries.
    When The second command is dispatched.
    Then The dispatch throws a StoreException, instead of being silently aborted.
    And The state does not change.

  Scenario: With dispatchAndWait, a misconfigured optimistic command rejects, even when its key is already running.
    Given An optimistic command with key "k", whose server call is still running.
    And Another optimistic command with the same key "k", that also sets nonReentrant to true.
    When The second command is dispatched with dispatchAndWait.
    Then The promise rejects with a StoreException, instead of resolving as aborted.

  Scenario: A misconfigured optimistic command throws, even when it aborts its own dispatch.
    Given An optimistic command that sets nonReentrant to true.
    And Its abortDispatch returns true.
    When The command is dispatched.
    Then The dispatch throws a StoreException, instead of being silently aborted.
    And The state does not change.

  Scenario: Any misconfigured action throws, even when its dispatch would be aborted.
    Given An action with throttle, that also has an invalid retry option.
    And Another action with the same throttle lock just ran.
    When The misconfigured action is dispatched, inside the throttle period.
    Then The dispatch throws a StoreException, instead of being silently aborted.
