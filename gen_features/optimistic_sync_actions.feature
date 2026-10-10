Feature: Optimistic sync actions

  Scenario: The optimistic value is applied right away, and sent to the server.
    Given An item that is not liked.
    When The like is toggled.
    Then The item is liked right away, before the server responds.
    And The value is sent to the server.
    And The action is in progress until the server responds.
    And When the server responds, onFinish is called.

  Scenario: Changes made while a request is in flight are sent in a single follow-up request.
    Given An item that is not liked.
    When The like is toggled 4 times, before the first request finishes.
    Then Every toggle changes the state right away.
    And Only the first toggle sends a request.
    And When the first request finishes, a single follow-up request sends the latest value.
    And onFinish is called only once, after the follow-up request finishes.

  Scenario: Follow-up requests are sent until the state stabilizes.
    Given An item that is not liked.
    And The like was toggled, and its request is in flight.
    When The like is toggled again while each request is in flight.
    Then When each request finishes, a follow-up request sends the latest value.
    And When a request finishes and the state did not change, there are no more requests.

  Scenario: If the state goes back to the sent value, no follow-up request is needed.
    Given An item that is not liked.
    When The like is toggled 3 times, before the first request finishes.
    Then Only one request is sent, since the state ends with the same value that was sent.

  Scenario: Only the dispatch that sends the requests waits for them.
    Given An item that is not liked.
    When The like is toggled twice with dispatchAndWait, before the first request finishes.
    Then The second dispatch applies its value, and finishes right away, without sending a request.
    And The first dispatch only finishes after the follow-up request finishes.

  Scenario: The optimistic value of each dispatch is kept in the action.
    Given An item that is not liked.
    When The like is toggled twice.
    Then The optimisticValue of each action is the value it applied.

  Scenario: Different keys can have concurrent requests.
    Given Two items, A and B, that are not liked.
    When Both likes are toggled.
    Then Both requests are sent right away.
    And Each one finishes on its own.

  Scenario: By default, actions of different classes have different keys.
    Given Two optimistic sync classes for the same item, that do not override computeOptimisticSyncKey.
    When Both are dispatched.
    Then Both send their requests right away.

  Scenario: Different action classes can share the same key.
    Given Two optimistic sync classes for the same item, that override computeOptimisticSyncKey to return the item.
    When Both are dispatched.
    Then Only the first one sends a request right away.
    And The other change is sent by the first action, in a follow-up request.

  Scenario: The server response is applied to the state, when the state stabilizes.
    Given An optimistic sync that applies the server response to the state.
    When The like is toggled twice, before the first request finishes.
    And Each request returns a response.
    Then The response of the first request is not applied, since a follow-up request is needed.
    And The response of the last request is applied.

  Scenario: By default, the server response is not applied to the state.
    Given An optimistic sync that does not say how to apply the server response.
    When The like is toggled, and the server returns a different value.
    Then The state keeps the optimistic value.

  Scenario: The state returned by onFinish is applied.
    Given An optimistic sync whose onFinish returns a new state.
    When The like is toggled, and the request succeeds.
    Then The state returned by onFinish is applied.

  Scenario: The key is released before onFinish runs.
    Given An optimistic sync whose onFinish takes some time.
    And The like was toggled, and its request finished.
    When The like is toggled again while onFinish is running.
    Then The new toggle sends its own request right away.

  Scenario: When a request fails, the optimistic value stays, onFinish gets the error, and the action fails.
    Given An item that is not liked.
    When The like is toggled twice, and the first request fails.
    Then The state keeps the latest optimistic value.
    And There is no follow-up request.
    And onFinish is called with the error.
    And The action fails with the error, and the error is shown to the user.

  Scenario: After a request fails, the key is released.
    Given The like was toggled, and its request failed.
    When The like is toggled again.
    Then The new toggle sends its own request right away.

  Scenario: onFinish can roll back the optimistic value when the request fails.
    Given An optimistic sync whose onFinish rolls back to the initial value, if the state still has its optimistic value.
    And An item that is not liked.
    When The like is toggled, and the request fails.
    Then The item is not liked again.

  Scenario Outline: If onFinish throws, its error becomes the action error.
    Given An optimistic sync whose onFinish throws an error.
    When The like is toggled, and the request {Result}.
    Then The action fails with the error thrown by onFinish.
    Examples: 
      | Result   |
      | succeeds |
      | fails    |

  Scenario: The number of follow-up requests is limited.
    Given An optimistic sync with maxFollowUpRequests 2.
    When The like keeps being toggled while each request is in flight.
    Then After 2 follow-up requests, the action fails with a StoreException, instead of sending another.
    And onFinish is called with the error.

  Scenario: The comparison that decides the follow-up requests can be customized.
    Given An optimistic sync whose ifShouldSendAnotherRequest always returns false.
    When The like is toggled twice, before the first request finishes.
    Then There is no follow-up request.

  Scenario: clearInternalActionProps releases the keys, and stops the actions with a request in flight.
    Given The like was toggled twice, and the first request is in flight.
    When The internal action props are cleared.
    And The like is toggled again.
    Then The new toggle sends its own request right away.
    And When the old request finishes, the old action is aborted.
    And It does not send a follow-up request, and does not call onFinish.

  Scenario: With checkInternet, when there is no internet, nothing is applied or sent.
    Given An optimistic sync that checks for internet.
    And There is no internet.
    When The like is toggled.
    Then No optimistic value is applied.
    And No request is sent.
    And The action fails.

  Scenario Outline: An optimistic sync cannot use some features.
    Given An optimistic sync that uses {Feature}.
    When It is dispatched.
    Then The dispatch throws a StoreException.
    And The state does not change.
    Examples: 
      | Feature                     |
      | nonReentrant                |
      | retry                       |
      | unlimitedRetryCheckInternet |
      | debounce                    |
      | throttle                    |
      | fresh                       |
      | sequential                  |
      | poll                        |
