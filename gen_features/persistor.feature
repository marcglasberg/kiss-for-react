Feature: Persistor  

  Scenario: There is no persisted state. State changes are persisted by a SYNC persistor.
    Given There is no persisted state when the store is created.
    And The persistor works SYNC when called (like localStorage).
    And An action that changes the state.
    When The store is created.
    And The action is dispatched.
    Then The initial-state is initially in the store.
    And The initial-state in the store is persisted.
    And The new state created by the dispatched action is persisted.

  Scenario: The persisted state is read when the Store is created. State changes are persisted by a SYNC persistor.
    Given There is some state already persisted when the store is created.
    And The persistor works SYNC when called (like localStorage).
    And An action that changes the state.
    When The store is created.
    And The action is dispatched.
    Then The initial-state is initially in the store.
    And The persisted state is read into the store.
    And The new state created by the dispatched action is persisted.

  Scenario: There is no persisted state. State changes are persisted by an ASYNC persistor.
    Given There is no persisted state when the store is created.
    And The persistor works SYNC when called (like localStorage).
    And An action that changes the state.
    When The store is created.
    And The action is dispatched.
    Then The initial-state is initially in the store.
    And The initial-state in the store is persisted.
    And The new state created by the dispatched action is persisted.

  Scenario: The persisted state is read when the Store is created. State changes are persisted by an ASYNC persistor.
    Given There is some state already persisted when the store is created.
    And The persistor works SYNC when called (like localStorage).
    And An action that changes the state.
    When The store is created.
    And The action is dispatched.
    Then The initial-state is initially in the store.
    And The persisted state is read into the store.
    And The new state created by the dispatched action is persisted.

  Scenario: State changes are only persisted when the previous state finished persisting.
    Given The persistor is async and slow, taking 150 millis to read/write/delete the state.
    And An action that changes the state.
    When The action is dispatched twice.
    Then The second state is only persisted when the first one finishes.

  Scenario Outline: Dispatching an action while the persisted state is being read throws, and changes nothing.
    Given The persistor is async and slow, taking 150 millis to read/write/delete the state.
    And The store was just created, and is still reading the persisted state.
    When An action is dispatched with dispatch, dispatchSync or dispatchAndWait.
    Then The dispatch throws a StoreException.
    And The state does not change, and the action is not dispatched.
    And After the store is ready, the store has the persisted state.
    Examples: 
      | Persisted |
      | NULL      |
      | 42        |

  Scenario: persistAndPausePersistor can be awaited, and the current state is persisted when it returns.
    Given The persistor is async and slow, taking 150 millis to read/write/delete the state.
    And The store finished reading the persisted state.
    And The persistor has a long throttle, so a state change is waiting to be persisted.
    When We await persistAndPausePersistor.
    Then When it returns, the current state is persisted.
    And Later state changes are not persisted, until the persistor is resumed.

  Scenario: persistAndPausePersistor called while a state is being persisted also persists the newest state.
    Given The persistor is async and slow, taking 150 millis to read/write/delete the state.
    And A state change is currently being persisted.
    And Another state change happened after that.
    When We await persistAndPausePersistor.
    Then It waits for the current persistence to finish.
    And Then it persists the newest state, before returning.

  Scenario: persistAndPausePersistor called while the persisted state is being read waits for the reading to finish.
    Given There is no persisted state when the store is created.
    And The persistor is async and slow, taking 150 millis to read/write/delete the state.
    When We await persistAndPausePersistor, before the reading finishes.
    Then The initial-state is saved before persistAndPausePersistor returns.
    And The persistor stays paused.

  Scenario: Logging out while the persisted state is still being read throws, and changes nothing.
    Given A store whose persisted state is still being read.
    When logOut is called before the read finishes.
    Then logOut throws a StoreException.
    And After the read finishes, the store has the state that was read, and it is still persisted.
