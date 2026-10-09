Feature: Optimistic command actions

  Scenario: The optimistic value is applied right away, before the command is sent to the server.
    Given An optimistic command whose server call takes some time.
    When The command is dispatched.
    Then The state has the optimistic value right away.
    And The server call sees the optimistic value in the state.
    And While the command runs, the action is in progress.

  Scenario: When the command succeeds, the optimistic value is kept, and there is no reload.
    Given An optimistic command whose server call succeeds with no response.
    And The command can reload from the server.
    When The command is dispatched.
    Then The state keeps the optimistic value.
    And There is no reload, since by default it only reloads on error.
    And The action completes OK.

  Scenario: When the server returns a response, it can be applied to the state.
    Given An optimistic command that applies the server response to the state.
    And Its server call returns a response.
    When The command is dispatched.
    Then The state has the server response.

  Scenario: By default, the server response is not applied to the state.
    Given An optimistic command that does not say how to apply the server response.
    And Its server call returns a response.
    When The command is dispatched.
    Then The state keeps the optimistic value.

  Scenario: When the server returns no response, the server response is not applied.
    Given An optimistic command that applies the server response to the state.
    And Its server call returns null or undefined.
    When The command is dispatched.
    Then The state keeps the optimistic value.

  Scenario: When the server response is applied, the action can choose to not change the state.
    Given An optimistic command whose method to apply the server response returns null.
    And Its server call returns a response.
    When The command is dispatched.
    Then The state keeps the optimistic value.

  Scenario: When the command fails, the state is rolled back, and the action fails with the command error.
    Given An optimistic command whose server call throws a UserException.
    And The command does not reload from the server.
    When The command is dispatched.
    Then The state goes back to the value it had when the command was dispatched.
    And The action fails with the command error.
    And The action is marked as failed in the store.
    And The error is shown to the user.

  Scenario: When the command fails, but the value was changed meanwhile, there is no rollback.
    Given An optimistic command whose server call fails.
    And While the server call runs, another action changes the same value.
    When The command is dispatched.
    Then The state keeps the value set by the other action.
    And The action fails with the command error.

  Scenario: When the command fails, the rollback happens before the reload, so the reloaded value wins.
    Given An optimistic command whose server call fails.
    And The command reloads the value from the server.
    When The command is dispatched.
    Then The state is rolled back before reloading.
    And The final state has the reloaded value.
    And The action fails with the command error.

  Scenario: When the command fails, and the reload also fails, the action fails with the command error.
    Given An optimistic command whose server call fails.
    And Its reload also fails.
    When The command is dispatched.
    Then The action fails with the command error, not with the reload error.
    And The state is rolled back.

  Scenario: The action can choose to reload also when the command succeeds.
    Given An optimistic command whose server call succeeds.
    And The command always reloads the value from the server.
    When The command is dispatched.
    Then The reload runs after the server call.
    And The final state has the reloaded value.

  Scenario: When the command succeeds, but the reload fails, the action fails with the reload error.
    Given An optimistic command whose server call succeeds.
    And The command always reloads the value from the server.
    And Its reload fails.
    When The command is dispatched.
    Then The action fails with the reload error.
    And The state keeps the optimistic value.

  Scenario: The action can choose to not apply the reloaded value.
    Given An optimistic command whose server call fails.
    And The command reloads from the server, but does not apply the reload when the value changed meanwhile.
    And While reloading, another action changes the same value.
    When The command is dispatched.
    Then The reloaded value is not applied.
    And The state keeps the value set by the other action.

  Scenario: The reload result can have a different shape than the value.
    Given An optimistic command whose server call fails.
    And Its reload returns an object, which the command knows how to apply to the state.
    When The command is dispatched.
    Then The final state has the value from the reloaded object.

  Scenario: Applying the reload result can be skipped by returning no state.
    Given An optimistic command whose server call fails.
    And Its method to apply the reload result returns null.
    When The command is dispatched.
    Then The state stays rolled back.

  Scenario: The rollback can be customized.
    Given An optimistic command whose server call fails.
    And Its rollback keeps the optimistic value, but marks it as failed.
    When The command is dispatched.
    Then The state keeps the optimistic value, marked as failed.
    And The rollback receives the initial value, the optimistic value, and the command error.

  Scenario: The rollback can be skipped by returning no state.
    Given An optimistic command whose server call fails.
    And Its rollback returns null.
    When The command is dispatched.
    Then The state keeps the optimistic value.
    And The action fails with the command error.

  Scenario: The decision to roll back can be customized.
    Given An optimistic command whose server call fails.
    And The command always rolls back, even if the value was changed meanwhile.
    And While the server call runs, another action changes the same value.
    When The command is dispatched.
    Then The state is rolled back anyway.
    And The decision receives the current value, the initial value, the optimistic value, and the command error.

  Scenario: The decision to reload gets the values applied by the command, and the command error.
    Given An optimistic command that records what its reload decision receives.
    When The command succeeds with a server response that is applied to the state.
    And Another command fails and is rolled back.
    Then On success, the last applied value is the server response, there is no rollback value, and no error.
    And On failure, the last applied value is the rollback value, and the error is the command error.

  Scenario: The decision to apply the reload gets the reload result.
    Given An optimistic command whose server call fails.
    And The command records what its decision to apply the reload receives.
    When The command is dispatched.
    Then The decision receives the current value, the applied values, the reload result, and the command error.

  Scenario: An optimistic command is non-reentrant.
    Given An optimistic command is running.
    When The same command is dispatched again, before the first one finishes.
    Then The second dispatch is aborted.
    And The server call runs only once.
    And After the first command finishes, the command can be dispatched again.

  Scenario: An optimistic command can be dispatched again after it fails.
    Given An optimistic command failed.
    When The same command is dispatched again.
    Then It runs.

  Scenario: Optimistic commands with different key params run at the same time.
    Given An optimistic command that uses the item id as its non-reentrant key params.
    When The command is dispatched for item A, and again for item A, and for item B, while the first one is running.
    Then The second command for item A is aborted.
    And The command for item B runs.

  Scenario: Key params that are arrays or plain objects are compared by their contents.
    Given An optimistic command that uses an object as its non-reentrant key params.
    When The command is dispatched twice, with different objects with the same contents.
    And Then dispatched with an object with different contents.
    Then The second command is aborted.
    And The third command runs.

  Scenario: Different optimistic commands with the same key block each other.
    Given Two different optimistic commands, that compute the same non-reentrant key for the same user.
    When The first command is dispatched for a user.
    And The second command is dispatched for the same user, and then for another user, while the first one is running.
    Then The second command for the same user is aborted.
    And The second command for the other user runs.

  Scenario: By default, different optimistic command classes do not block each other.
    Given Two different optimistic command classes.
    When Both are dispatched at the same time.
    Then Both run.

  Scenario: An optimistic command can also abort its own dispatch.
    Given An optimistic command whose abortDispatch returns true.
    When The command is dispatched.
    Then It does not run, and the state does not change.

  Scenario: An optimistic command cannot use the nonReentrant property.
    Given An optimistic command that sets nonReentrant to true.
    When The command is dispatched.
    Then The dispatch throws a StoreException.
    And The state does not change.

  Scenario: With retry, only the server call is retried, while the optimistic value stays in the state.
    Given An optimistic command with retry on.
    And Its server call fails twice, then succeeds.
    When The command is dispatched.
    Then The server call runs 3 times.
    And The optimistic value is applied only once, and is never rolled back.
    And The action completes OK, after 2 retry attempts.

  Scenario: With retry, the rollback happens only after all attempts fail.
    Given An optimistic command with retry on, and 2 retries at most.
    And Its server call always fails.
    When The command is dispatched.
    Then The server call runs 3 times.
    And The state is rolled back only once, at the end.
    And The action fails with the last command error.

  Scenario: With retry, the server call waits for the retry delays between attempts.
    Given An optimistic command with retry options "initialDelay: 100", "multiplier: 2", "maxRetries: 3" and "maxDelay: 300".
    And Its server call always fails.
    When The command is dispatched.
    Then The server call waits 100, 200 and 300 millis between attempts.
    And While it waits to retry, the command is in progress.

  Scenario: With retry, a command that succeeds the first time is not retried.
    Given An optimistic command with retry on.
    And Its server call succeeds the first time.
    When The command is dispatched.
    Then The server call runs once, with no retry attempts.

  Scenario: An optimistic command cannot use unlimited retries.
    Given An optimistic command with unlimited retries (maxRetries -1, or unlimitedRetries true).
    When The command is dispatched.
    Then The dispatch throws a StoreException.
    And The state does not change.

  Scenario: With checkInternet, when there is no internet, nothing is applied or sent.
    Given An optimistic command that checks for internet.
    And There is no internet.
    When The command is dispatched.
    Then No optimistic value is applied.
    And The server call does not run.
    And The action fails.
    And When the internet is back, the command can be dispatched again.
