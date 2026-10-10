Feature: Optimistic sync with push actions

  Scenario: The optimistic value is applied right away, and sent to the server with its revision and device.
    Given An item that is not liked.
    When The like is toggled.
    Then The item is liked right away, before the server responds.
    And The value is sent to the server, with local-revision 1, and the device ID.
    And When the server responds, onFinish is called.

  Scenario: Each dispatch increments the local-revision of its key.
    Given The like of an item was toggled, and its request finished.
    When The like is toggled again.
    Then The new request is sent with local-revision 2.

  Scenario: Changes made while a request is in flight are sent in a single follow-up request, even if the value is the same.
    Given An item that is not liked.
    When The like is toggled 3 times, before the first request finishes.
    Then Only the first toggle sends a request, with local-revision 1.
    And When the first request finishes, a single follow-up request sends the latest value, with local-revision 3.
    And The follow-up is sent even though the latest value is the same as the value that was sent.
    And onFinish is called only once, after the follow-up request finishes.

  Scenario: Different keys can have concurrent requests, each with its own local-revision.
    Given Two items, A and B, that are not liked.
    When Both likes are toggled.
    Then Both requests are sent right away, both with local-revision 1.

  Scenario: If the latest change came from a push, no follow-up request is needed.
    Given An item that is not liked.
    And The like was toggled twice, and the first request is in flight.
    When A push from another device arrives, with the item liked.
    And The first request finishes.
    Then The pushed value is applied to the state, with its server revision.
    And There is no follow-up request.

  Scenario: A local change made after a push is sent in a follow-up request.
    Given An item that is not liked.
    And The like was toggled, and its request is in flight.
    And A push from another device arrived, with the item not liked.
    When The like is toggled again.
    And The first request finishes.
    Then A follow-up request sends the latest local value.

  Scenario Outline: Stale and out-of-order pushes are ignored.
    Given A push with server revision 20 was applied, with the item liked.
    When A push with server revision {Revision} arrives, with the item not liked.
    Then The push is ignored.
    Examples: 
      | Revision |
      | 20       |
      | 15       |

  Scenario: Pushes older than the server revision saved in the state are ignored.
    Given A state that has the item liked, with server revision 20 (for example, a persisted state).
    And No action was dispatched yet.
    When A push with server revision 15 arrives, with the item not liked.
    Then The push is ignored.

  Scenario: The echo of an older request of this device is not applied, and does not cancel the follow-up.
    Given An item that is not liked.
    And The like was toggled twice, and the first request is in flight.
    When The push of the first request arrives, from this device, with local-revision 1.
    Then The push is not applied, since the state has a newer local value.
    And When the first request finishes, a follow-up request sends the latest local value.

  Scenario: The echo of the latest request of this device is applied.
    Given An item that is not liked.
    And The like was toggled, and its request is in flight.
    When The push of that request arrives, from this device, with local-revision 1.
    Then The push is applied, with its server revision.
    And When the request finishes, there is no follow-up request.

  Scenario: A push ignored by applyServerPushToState still records its server revision.
    Given A server push action whose applyServerPushToState returns null.
    When A push with server revision 20 arrives.
    And Then a push with server revision 15 arrives, applied by the regular server push action.
    Then The second push is ignored, since server revision 20 is already known.

  Scenario: A server push uses the key of its associated action.
    Given A server push associated with another optimistic sync class.
    And The like was toggled twice, and the first request is in flight.
    When That push arrives.
    And The first request finishes.
    Then The push does not count as a push for the toggled key, so a follow-up request is sent.

  Scenario: The server response is applied to the state, when the state stabilizes.
    Given An optimistic sync with push that applies the server response to the state.
    When The like is toggled twice, before the first request finishes.
    And Each request returns a response.
    Then The response of the first request is not applied, since a follow-up request is needed.
    And The response of the last request is applied.

  Scenario: A stale server response is not applied.
    Given An optimistic sync with push that applies the server response to the state.
    And The like was toggled, and its request is in flight.
    When A push from another device arrives, with server revision 20, and the item not liked.
    And The request finishes with server revision 10, and the item liked.
    Then The response is not applied, since the push is newer.

  Scenario: A server response newer than a push is applied.
    Given An optimistic sync with push that applies the server response to the state.
    And The like was toggled, and its request is in flight.
    When A push from another device arrives, with server revision 20, and the item not liked.
    And The request finishes with server revision 30, and the item liked.
    Then The response is applied, since it is newer than the push.

  Scenario: The server revision can be informed as a Date.
    Given An optimistic sync with push that applies the server response to the state.
    And A push with server revision 20 was applied.
    When The like is toggled, and the server responds with a Date as the server revision.
    Then The Date is used as its milliseconds since the epoch, which is newer than 20.
    And So, the response is applied.

  Scenario: If sendValueToServer does not inform the server revision, the action fails.
    Given An item that is not liked.
    When The like is toggled, and the request finishes without informing the server revision.
    Then The action fails with a StoreException.
    And onFinish is called with the error.

  Scenario: When a request fails, the optimistic value stays, onFinish gets the error, the action fails, and the key is released.
    Given An item that is not liked.
    When The like is toggled twice, and the first request fails.
    Then The state keeps the latest optimistic value.
    And There is no follow-up request.
    And onFinish is called with the error, and the action fails with the error.
    And A new toggle sends its own request right away.

  Scenario: The number of follow-up requests is limited.
    Given An optimistic sync with push with maxFollowUpRequests 2.
    When The like keeps being toggled while each request is in flight.
    Then After 2 follow-up requests, the action fails with a StoreException, instead of sending another.
    And onFinish is called with the error, and the key is released.

  Scenario: The device ID is the same during the app run, and can be changed.
    Given The default device ID.
    When It is read twice.
    Then It returns the same number.
    And When it is changed, the requests send the new device ID.

  Scenario: clearInternalActionProps releases the keys, removes the revisions, and stops the actions with a request in flight.
    Given The like was toggled twice, and the first request is in flight.
    When The internal action props are cleared.
    And The like is toggled again.
    Then The new toggle sends its own request right away, with local-revision 1.
    And When the old request finishes, the old action is aborted, without a follow-up request, and without calling onFinish.

  Scenario: After clearInternalActionProps, the server revision saved in the state is still used.
    Given A push with server revision 20 was applied, and saved in the state.
    When The internal action props are cleared.
    And A push with server revision 15 arrives.
    Then The push is ignored.

  Scenario: With checkInternet, when there is no internet, nothing is applied or sent.
    Given An optimistic sync with push that checks for internet.
    And There is no internet.
    When The like is toggled.
    Then No optimistic value is applied, no request is sent, and the action fails.

  Scenario Outline: An optimistic sync with push cannot use some features.
    Given An optimistic sync with push that uses {Feature}.
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

  Scenario Outline: A server push cannot use any feature.
    Given A server push action that uses {Feature}.
    When It is dispatched.
    Then The dispatch throws a StoreException.
    And The state does not change.
    Examples: 
      | Feature                     |
      | checkInternet               |
      | nonReentrant                |
      | retry                       |
      | unlimitedRetryCheckInternet |
      | debounce                    |
      | throttle                    |
      | fresh                       |
      | sequential                  |
      | poll                        |
