Feature: Optimistic updates across server replies, cancellation and restarts

  Scenario: A save triggered by an applied server response reaches the server.
    Given A save request is running, and another save waits for the server-normalized state.
    And The server normalizes the first value to 10, and keeps the other values.
    When The server response causes the second save to be dispatched.
    Then The second value is sent to the server.
    And Both saves complete successfully, with the second value in the state.

  Scenario: An aborted optimistic command does not apply its later server response.
    Given An optimistic command is waiting for the server.
    When The command is aborted before the server response arrives.
    Then The response does not change the state.
    And The command finishes as aborted, without a failure or a running request.

  Scenario: An aborted optimistic save does not send a follow-up or apply its response.
    Given Two local values are coalesced while the first save request runs.
    When The running save is aborted and its response later arrives.
    Then No further server request runs, and the response does not overwrite the local value.
    And The running save finishes as aborted, without a failure.

  Scenario: A confirmed server revision remains available after the store is recreated.
    Given A local save succeeds before the server sends the echo of the save.
    When The echo arrives, and a new store starts with the saved state.
    And An older server update arrives in the new store.
    Then The older update cannot overwrite the confirmed value.
    And The restarted state keeps the server revision of the successful save.

  Scenario: An old self echo cannot make a follow-up send an outdated pushed value.
    Given Two local saves are followed by a remote push that is older than the first request.
    When The first request echo arrives before its response.
    Then The follow-up sends the latest local value.
    And Both local saves finish successfully, and no save remains in progress.

  Scenario: Without the old self echo the latest local value reaches the server.
    Given Two local saves are followed by a remote push that is older than the first request.
    When The first request response arrives without the echo arriving first.
    Then The follow-up sends the latest local value.
    And The local state returns to the latest local value, and both saves finish successfully.

  Scenario: An optimistic save with push sends a value dispatched when its server response is applied.
    Given A save request runs and a second save waits for the normalized response.
    When The server response causes the second save to be dispatched.
    Then The second value is sent to the server.
    And Both saves complete successfully, with the second value in the state.

  Scenario: An aborted optimistic save with push does not send a follow-up or apply its response.
    Given Two local values are coalesced while the first save request runs.
    When The store aborts the save and its response later arrives.
    Then No further server request runs, and the response does not overwrite the local value.
    And The running save finishes as aborted, without a failure.

  Scenario: An aborted optimistic command does not roll back or reload when its request fails.
    Given An optimistic command, which can reload from the server, is waiting for the server.
    When The command is aborted, and then its server request fails.
    Then The state keeps the optimistic value, and nothing is reloaded.
    And The command finishes as aborted, without a failure.

  Scenario: An aborted optimistic command with retry does not send its command again.
    Given An optimistic command with retry, whose request is cancelled by the abort signal of the command.
    When The command is aborted while its request runs.
    Then The command is not sent again, and the state keeps the optimistic value.
    And The command finishes as aborted, with the abort message of the command.

  Scenario: An aborted optimistic save does not run onFinish when its request is cancelled.
    Given An optimistic save whose request is cancelled by the abort signal of the save.
    And Its onFinish rolls back the value when the request fails.
    When The save is aborted while its request runs.
    Then onFinish does not run, and the state keeps the optimistic value.
    And The save finishes as aborted, without a failure.
    And A new save of the same value sends its request.

  Scenario: A late echo of an older request does not overwrite a newer local value.
    Given A local save finished, and its server response had revision 11.
    And A newer local save is waiting for the server.
    When The echo of the first save arrives, also with revision 11.
    Then The echo is not applied, and the state keeps the newer local value.
    And The newer local save finishes with its value in the state.

  Scenario: An echo whose server revision is already in the state is not applied again.
    Given The state already has the server revision of the latest local save.
    When The echo of that save arrives.
    Then The echo is not applied again.
