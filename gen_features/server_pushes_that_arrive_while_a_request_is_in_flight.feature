Feature: Server pushes that arrive while a request is in flight

  Scenario: A push ignored by applyServerPushToState does not cancel the follow-up of a newer local change.
    Given An item that is not liked.
    And The like was toggled twice, so the item is not liked, and the first request is in flight.
    When A push from another device arrives, and applyServerPushToState ignores it.
    And The first request finishes.
    Then The state is not changed by the push.
    And A follow-up request sends the latest local value.

  Scenario: A push ignored by applyServerPushToState does not cancel an earlier push.
    Given An item that is not liked.
    And The like was toggled twice, and the first request is in flight.
    And A push from another device arrived, with the item liked, and was applied.
    When A newer push arrives, and applyServerPushToState ignores it.
    And The first request finishes.
    Then The item is still liked, as in the applied push.
    And There is no follow-up request, since the latest change applied came from a push.

  Scenario: A push ignored by applyServerPushToState still records its server revision, so older pushes are ignored.
    Given An item that is not liked.
    And The like was toggled twice, so the item is not liked, and the first request is in flight.
    And A push from another device arrived, with server revision 20, and applyServerPushToState ignored it.
    When An older push from another device arrives, with server revision 15, and the item liked.
    And The first request finishes.
    Then The older push is ignored, so the item is still not liked.
    And A follow-up request sends the latest local value.

  Scenario: A push older than the request in flight does not overwrite a newer local change.
    Given An item that is not liked, with server revision 5.
    And The like was toggled twice, so the item is not liked, and the first request is in flight.
    When A push from another device arrives, with server revision 10, and the item liked.
    And The first request finishes with server revision 11.
    Then The push is applied while the request is in flight.
    And When the request finishes, the push turns out to be older than the request.
    And So the latest local value is back in the state, and a follow-up request sends it.

  Scenario: A push older than the request in flight does not overwrite the value of that request.
    Given An item that is not liked, with server revision 5.
    And The like was toggled once, so the item is liked, and the request is in flight.
    When A push from another device arrives, with server revision 10, and the item not liked.
    And The request finishes with server revision 11, and no server response.
    And Then the push of that request arrives, from this device, with server revision 11.
    Then When the request finishes, the item is liked again, since the server has the value of the request.
    And There is no follow-up request.
    And The item stays liked after the push of the request.

  Scenario: A push older than the request in flight does not keep the server response from being applied.
    Given An optimistic sync with push that applies the server response to the state.
    And The like was toggled once, so the item is liked, and the request is in flight.
    When A push from another device arrives, with server revision 10, and the item not liked.
    And The request finishes with server revision 11, and the item liked.
    Then The server response is applied, so the item is liked.

  Scenario: A push newer than the request in flight still wins, even after an older push.
    Given An item that is not liked, with server revision 5.
    And The like was toggled twice, so the item is not liked, and the first request is in flight.
    When A push from another device arrives, with server revision 10, and the item liked.
    And Another push from another device arrives, with server revision 12, and the item liked.
    And The first request finishes with server revision 11.
    Then The item is still liked, as in the newest push.
    And There is no follow-up request.

  Scenario: A local change made after a push older than the request in flight is sent in a follow-up request.
    Given An item that is not liked, with server revision 5.
    And The like was toggled once, so the item is liked, and the request is in flight.
    And A push from another device arrived, with server revision 10, and the item not liked.
    When The like is toggled again, so the item is liked.
    And The first request finishes with server revision 11.
    Then A follow-up request sends the latest local value.

  Scenario: A push older than the follow-up request in flight does not overwrite the latest local change.
    Given An item that is not liked, with server revision 5.
    And The like was toggled twice, so the item is not liked.
    And The first request finished with server revision 11, so a follow-up request is in flight.
    When A push from another device arrives, with server revision 12, and the item liked.
    And The follow-up request finishes with server revision 13.
    Then The push is applied while the follow-up request is in flight.
    And When the follow-up request finishes, the latest local value is back in the state.
    And There is no other follow-up request.

  Scenario: A push that arrives during a request that fails is kept.
    Given An item that is not liked, with server revision 5.
    And The like was toggled once, so the item is liked, and the request is in flight.
    When A push from another device arrives, with server revision 10, and the item not liked.
    And The request fails, so it never informs its server revision.
    Then The item is still not liked, as in the push, since the server did not save the request.
    And There is no follow-up request, and the action fails.
