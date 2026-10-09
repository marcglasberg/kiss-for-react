Feature: useDispatch with onMount, onDepsChange and onUnmount

  Scenario Outline: onMount is called once when the component mounts, and onUnmount once when it unmounts.
    Given A store that is ready.
    And A component that uses useDispatch with onMount and onUnmount.
    When The component mounts, re-renders, and then unmounts.
    Then onMount is called once, when it mounts, with the store.
    And onUnmount is called once, when it unmounts, with the store.
    And The actions they dispatch change the state.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: useDispatch with options still returns the dispatch function.
    Given A component that uses useDispatch with onMount.
    When The component dispatches an action with the returned function.
    Then The action changes the state.

  Scenario: onMount waits for the store to be ready.
    Given A store whose persisted state is still being read.
    When A component that uses useDispatch with onMount mounts.
    And Later, the persisted state finishes being read.
    Then onMount is not called before the store is ready.
    And onMount is called when the store is ready, and sees the persisted state.

  Scenario: If the component unmounts before the store is ready, nothing is called.
    Given A store whose persisted state is still being read.
    And A component that uses useDispatch with onMount and onUnmount.
    When The component mounts, and unmounts before the store is ready.
    And Later, the store becomes ready.
    Then Neither onMount nor onUnmount is called.

  Scenario Outline: onDepsChange is called with the old value when a single-value dep changes.
    Given A component that uses useDispatch with deps: userId, onMount and onDepsChange.
    When The component re-renders with the same userId, and then with other userIds.
    Then onMount is called only once.
    And onDepsChange is called only when the userId changes, with the old userId.
    And onDepsChange sees the new userId.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: onDepsChange gets the old array when the deps are an array.
    Given A component that uses useDispatch with deps: [userId, filter].
    When The userId changes, and then the filter changes.
    Then onDepsChange is called for each change, with the old array.

  Scenario: Deps that change before the store is ready don't call onDepsChange.
    Given A store whose persisted state is still being read.
    And A component that uses useDispatch with deps: userId, onMount and onDepsChange.
    When The userId changes before the store is ready.
    And The store becomes ready.
    And Then the userId changes again.
    Then onMount is called once, with the latest userId.
    And onDepsChange is called only for the change after onMount, with the userId onMount saw.

  Scenario: onUnmount sees the values of the latest render.
    Given A component that uses useDispatch with onUnmount.
    When The component re-renders with another userId, and then unmounts.
    Then onUnmount sees the latest userId.

  Scenario: onMount can be async, and wait for actions to finish.
    Given A component whose onMount is async.
    And onMount dispatches an async action with dispatchAndWait, and then dispatches another action.
    When The component mounts.
    Then Both actions run, in order.
