Feature: useIsStoreReady

  Scenario: A store without a persistor is ready from the first render.
    Given A store without a persistor.
    When A component uses useIsStoreReady.
    Then It is true from the first render, and the component renders only once.

  Scenario Outline: While the persisted state is being read, the store is not ready. When it is read, it is.
    Given A store whose persisted state is still being read.
    When A component uses useIsStoreReady.
    And Later, the persisted state finishes being read.
    Then It is false while reading, and the component re-renders with true when reading finishes.
    Examples: 
      | Persisted state |
      | none            |
      | some            |
      | read fails      |

  Scenario: A component mounted after the store is ready is ready from the first render.
    Given A store whose persisted state was already read.
    When A component that uses useIsStoreReady is mounted.
    Then It is true from the first render, and the component renders only once.

  Scenario: When the store is ready, actions can be dispatched.
    Given A store whose persisted state is still being read.
    And A component that dispatches an action only if useIsStoreReady is true.
    When The persisted state finishes being read.
    Then The action is dispatched, and no error is thrown.
