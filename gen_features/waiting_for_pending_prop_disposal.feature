Feature: Waiting for pending prop disposal

  Scenario Outline: Disposing the store waits for resource cleanup that has already started.
    Given A store has an injected dependency and a resource with asynchronous cleanup.
    And The resource cleanup started through <Operation>, but has not finished.
    When The store is disposed before the resource cleanup finishes.
    Then The store disposal stays pending, and the injected dependency stays open.
    And After the resource cleanup finishes, the dependency closes and the store disposal completes.
    And The resource cleanup runs only once.
    Examples: 
      | Operation                 |
      | store.disposeProp         |
      | store.disposeProps        |
      | store.setProp replacement |

  Scenario: Disposing the store waits for cleanup of a resource that is still in its props.
    Given A store has an injected dependency and a resource with asynchronous cleanup.
    And The resource is still in the store props, and its cleanup has not started.
    When The store is disposed.
    Then The resource cleanup starts, and the store waits while the dependency stays open.
    And After the resource cleanup finishes, the dependency closes and the store disposal completes.
    And The resource cleanup runs only once, and the store props are empty.

  Scenario: Disposing the store waits for all the resource cleanups that have already started.
    Given A store has an injected dependency and two resources with asynchronous cleanup.
    And Both resources were removed, and neither cleanup has finished.
    When The store is disposed, and the cleanups finish in the reverse order of their start.
    Then The dependency closes only after the last cleanup finishes, and then the store disposal completes.

  Scenario Outline: Disposing the store waits for a resource cleanup that another cleanup started.
    Given A store has an injected dependency and two resources with asynchronous cleanup.
    And The cleanup of the first resource disposes the second resource, which starts its own cleanup.
    When The first resource cleanup starts through <Operation>, and the store disposal runs before the cleanups finish.
    Then The store disposal waits for both cleanups.
    And The dependency closes only after the second cleanup finishes, and then the store disposal completes.
    Examples: 
      | Operation                               |
      | store.disposeProp, before store.dispose |
      | store.dispose                           |

  Scenario: Disposing the store waits for the resource cleanup that logOut started.
    Given A store has an injected dependency and a resource with asynchronous cleanup.
    And A logOut that disposes the props started the resource cleanup, which has not finished.
    When The store is disposed before the resource cleanup finishes.
    Then The store disposal stays pending, and the dependency stays open.
    And After the resource cleanup finishes, the dependency closes and the store disposal completes.

  Scenario: Disposing the store waits for a resource cleanup that fails, and reports its error.
    Given A store has an errorObserver, an injected dependency, and a resource whose asynchronous cleanup fails.
    And The resource was removed, and its cleanup has not failed yet.
    When The store is disposed before the resource cleanup fails.
    Then The store disposal stays pending, and the dependency stays open.
    And After the cleanup fails, the error is given to the errorObserver with a null action, the dependency closes, and the store disposal completes.

  Scenario: A prop set while the store is being disposed is disposed right away, and the store disposal waits for it.
    Given A store has an injected dependency and a resource with asynchronous cleanup.
    And The store disposal started, and is waiting for the resource cleanup.
    When Another resource with asynchronous cleanup is set as a prop, as an action that is still running may do.
    Then The new resource is not kept, and its cleanup starts right away.
    And The dependency closes only after both cleanups finish, and then the store disposal completes.

  Scenario: The store forgets a resource cleanup that has finished, and does not wait for it again.
    Given A store has an injected dependency and a resource with asynchronous cleanup.
    And The resource was removed, and its cleanup finished.
    When The store is disposed.
    Then The store keeps no record of the finished cleanup.
    And The dependency closes and the store disposal completes without waiting.
