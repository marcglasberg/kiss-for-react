Feature: Hooks subscribing to the store

  Scenario: useSelect sees a state change made before it subscribed to the store.
    Given A component that shows the count.
    And Its child changes the count when it mounts, before the parent subscribes to the store.
    When The component is rendered.
    Then It shows the new count.

  Scenario: A selector that throws for a removed item does not make the action fail.
    Given A list that shows its items, where each item component selects its item by id.
    And The selector of an item throws if its item no longer exists.
    When An action removes the last item.
    Then The action does not fail, and the dispatch does not throw.
    And The state changes, and the list no longer shows the removed item.

  Scenario: A selector that throws for a removed item does not stop the rest of the state change processing.
    Given A list that shows its items, where each item component selects its item by id.
    And The store has a persistor and a state observer.
    And Some code is waiting for the list to have a single item.
    When An action removes the last item.
    Then The state observer sees the change, with no error.
    And The new state is persisted.
    And The waiting code is released.
