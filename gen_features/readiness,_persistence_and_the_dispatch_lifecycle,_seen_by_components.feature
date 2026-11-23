Feature: Readiness, persistence and the dispatch lifecycle, seen by components

  Scenario: A store without a persistor is ready from the first render, and onMount runs right away.
    Given A store without a persistor.
    When A component that shows readiness and uses useStoreEffect mounts.
    Then It shows ready from its first and only commit.
    And onMount ran once, when it mounted.

  Scenario: While the persisted state loads, the initial state is shown; then the restored state and readiness appear.
    Given A store with a persistor that is still reading a saved state with count 42.
    And A mounted component that shows readiness and the state, with an effect that runs when ready.
    When The persistor finishes reading.
    Then The component first committed not-ready with the initial state.
    And It then commits ready with the restored state, and the effect sees the restored state.

  Scenario: With no saved state, the store is ready only after the initial state was saved.
    Given A store with a persistor that has no saved state, and whose saving of the initial state is delayed.
    And A mounted component that shows readiness.
    When The persistor finishes reading (with nothing), and later finishes saving the initial state.
    Then The component still shows not-ready after the read, since initialization is not complete.
    And It shows ready after the initial state was saved.

  Scenario Outline: When initialization fails, the error is reported, the initial state is kept, and the store still becomes ready.
    Given A store with a persistor where [Failure].
    And A mounted component that shows readiness and the state.
    When The persistor finishes reading.
    Then The errors are given to the errorObserver, with no action.
    And The component shows ready, with the initial state, and nothing stays pending.
    Examples: 
      | Failure                        | Errors | Deletes | Initial saves |
      | reading fails                  | 1      | 1       | 1             |
      | reading and deleting fail      | 2      | 1       | 1             |
      | saving the initial state fails | 1      | 0       | 0             |

  Scenario: Readiness is shown even when the restored state is the same object as the initial state.
    Given A store whose persistor returns the very same initial state object.
    And A mounted component that shows readiness.
    When The persistor finishes reading.
    Then The state object does not change, but the component still commits ready.

  Scenario Outline: Readiness that settles before the mount, during the mount, or after the unmount is handled.
    Given A store with a persistor, and a component that shows readiness.
    When The store becomes ready [When].
    Then The component shows the right value, with no missed update, no update after unmount, and no subscription left.
    Examples: 
      | When                                 |
      | before the component mounts          |
      | while the component is being mounted |
      | after the component unmounts         |

  Scenario: In StrictMode, a component mounted while the store is not ready shows readiness later, and onMount runs once.
    Given A store with a persistor that is still reading.
    And A component inside React.StrictMode that shows readiness and uses useStoreEffect.
    When The persistor finishes reading.
    Then The component shows ready with the restored state.
    And onMount ran exactly once, with the restored state, and onUnmount did not run.

  Scenario Outline: onMount uses the callbacks of the latest render when it finally runs, and nothing runs after an early unmount.
    Given A store with a persistor that is still reading.
    And A component with useStoreEffect whose deps and onMount change with a prop, [Case].
    When The prop changes before the store is ready, and then the store becomes ready.
    Then [Outcome].
    Examples: 
      | Case                                      | Outcome                                                                |
      | and it stays mounted                      | onMount runs once, with the latest prop, and onDepsChange does not run |
      | and it unmounts before the store is ready | neither onMount nor onUnmount runs                                     |

  Scenario: onDepsChange and onUnmount see the right deps while store updates also render the component.
    Given A component that selects the count, and uses useStoreEffect with deps from a prop.
    When The count changes (a store-driven render), then the prop changes, then the count changes again, then it unmounts.
    Then onDepsChange runs only for the prop change, with the old deps.
    And onUnmount runs with the latest prop, and the callbacks ran in order: mount, deps, unmount.

  Scenario: Restoring the state does not persist it again, and dispatching before ready is an error.
    Given A store with a persistor that is still reading a saved state.
    And A mounted component that dispatches with useDispatch.
    When The component dispatches before the store is ready, and the persistor then finishes reading.
    Then The early dispatch throws a StoreException, and the state is unchanged.
    And The restored state is shown, but not persisted again, and the initial state was not saved.

  Scenario Outline: Mounted components see the state reset by logOut.
    Given A store [Persistor], with a mounted component that shows the state, after some actions changed it.
    When logOut is called with a new initial state.
    Then The component shows the new initial state.
    And With a persistor, the saved state is deleted and the new initial state is persisted; a failure to delete is still thrown.
    Examples: 
      | Persistor                             |
      | without a persistor                   |
      | with a persistor                      |
      | with a persistor that fails to delete |

  Scenario: A state change seen by a component is also persisted and releases the code waiting for it.
    Given A ready store with a persistor, a mounted component that shows the count, and code waiting for count 1 and for the action to finish.
    When An action increments the count.
    Then The component shows 1, the new state is persisted once, and both waits are released.

  Scenario: A component mounted before the store is ready can dispatch as soon as it is ready.
    Given A store with a persistor that is still reading.
    And A mounted component that dispatches an action in an effect when readiness becomes true.
    When The persistor finishes reading.
    Then The action is dispatched once, after the restored state was applied, and no error is thrown.
