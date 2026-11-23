Feature: Selector errors are handled by React, and never break the store

  Scenario: A selector that throws for a removed item does not fail the action, and the item disappears.
    Given A list showing its items, where each item component selects its item by index, and throws if it is gone.
    When An action removes the last item.
    Then The dispatch does not throw, and the action completes with no error.
    And The list no longer shows the removed item.

  Scenario: A selector that throws for a removed item does not stop the rest of the state change processing.
    Given The same list, plus a healthy sibling showing the count, a persistor, a state observer, a recorder, and code waiting for the change.
    When An action removes the last item.
    Then The sibling shows the new state, the observer and the recorder saw the change with no error.
    And The new state is persisted, and the waiting code is released.

  Scenario: A selector that keeps throwing after a state change reaches the error boundary, without faking a stale value.
    Given A mounted item component for index 0, inside an error boundary, plus a healthy sibling showing the count.
    When An action empties the items, so the selector of the item throws from now on.
    Then The error boundary shows the selector error.
    And The action completed with no error, and the sibling still updates for later changes.

  Scenario: A selector that throws when the component mounts reaches the error boundary, and leaves no subscription.
    Given An item component for an index that does not exist, inside an error boundary.
    When It is mounted.
    Then The error boundary shows the selector error.
    And No subscription to the store was left behind.

  Scenario: A component whose selector changes in the same batch as a state change uses the new selector.
    Given A mounted item component for index 1, inside an error boundary.
    When In the same batch, it is rendered again for index 0, and an action removes item 1.
    Then It shows item 0, and the old selector (which would throw for item 1) does not reach the error boundary.

  Scenario: An error thrown while comparing selected objects is handled by rendering, and the store keeps working.
    Given A component using useObject whose selected object throws when its values are read after the count is 1, inside an error boundary.
    And A healthy sibling showing the count.
    When An action increments the count to 1, and then another increments it to 2.
    Then The error boundary shows the error, both actions complete with no error, and the sibling shows 2.

  Scenario Outline: After the error boundary is reset and the data is valid again, the component subscribes and shows fresh data.
    Given An item component for index 0 that failed, because the items were emptied, inside an error boundary.
    When An action restores the items, and the error boundary is reset [When].
    Then The component shows the current item, and has exactly one subscription to the store.
    And A later change of the item is shown too.
    Examples: 
      | When               |
      | after the restore  |
      | before the restore |
