Feature: Subscriptions follow the lifetime of the components and providers

  Scenario Outline: A parent catches up with a change its child made before the parent subscribed.
    Given A component that shows the count, whose child increments the count in a [Effect] effect when it mounts.
    When The component is rendered.
    Then The child effect runs before the parent subscribes to the store, so the first commit shows the old count.
    And The parent then catches up, committing the new count, with no further dispatch.
    Examples: 
      | Effect  |
      | layout  |
      | passive |

  Scenario: Rendering a consumer many times with new inline selectors does not churn its subscription.
    Given A mounted component that selects with an inline selector (a new function on every render).
    When Its parent renders it 5 more times.
    Then The component subscribed to the store exactly once, and has exactly one active subscription.

  Scenario: An unmounted consumer stops listening, and a remounted one reads the latest state.
    Given A mounted component that shows the count.
    When It is unmounted, the count changes, it is mounted again, and the count changes again.
    Then After the unmount, no subscription is left, and the change does not render it.
    And When mounted again, it shows the latest count from its first render, and renders once for the last change.

  Scenario: In StrictMode, the subscription survives the simulated unmount, and a real unmount removes it.
    Given A component that shows the count, mounted inside React.StrictMode.
    When React simulates an unmount and mount of its effects, and later it is really unmounted.
    Then After mounting, exactly one subscription is active, and store changes update the component.
    And After the real unmount, no subscription is active, and store changes cause no warning or render.

  Scenario: A component that suspends before committing does not leave a subscription behind.
    Given A component that selects the count and suspends until some data arrives.
    When It is rendered inside a Suspense boundary, the count changes, and later the data arrives.
    Then While suspended, no subscription is active.
    And After it resumes and commits, exactly one subscription is active, and it shows the current count.

  Scenario: Sibling and nested providers keep their stores apart.
    Given An outer provider with store A, and inside it a nested provider with store B, plus a sibling provider with store C.
    And Each provider has a component that shows its count and can dispatch to its store.
    When Each component dispatches an increment to its own store.
    Then Each component shows the count of its own store, and no other component renders.

  Scenario Outline: Replacing the store of a provider moves its components to the new store.
    Given A provider with store 1, whose component shows the count, dispatches, shows readiness and uses useStoreEffect.
    When The provider is given store 2 ([How]).
    Then Store 1 has no active subscription left, and its useStoreEffect onUnmount ran.
    And The component reads store 2 right away, dispatches to store 2, and onMount ran for store 2.
    And The readiness of store 2 is shown, and updates when store 2 becomes ready.
    Examples: 
      | How                     |
      | with a new key          |
      | changing the store prop |

  Scenario: Listeners added or removed during a notification follow a defined order.
    Given A store with state listeners A, B and C, where A removes B and adds D when it is notified.
    When The state changes once, and then once more.
    Then On the first change, A and C are notified, but not B (removed before its turn) nor D (added during the notification).
    And On the second change, A, C and D are notified.
    And Unsubscribing twice does not remove another listener.

  Scenario: A listener that dispatches during a notification sees the newest state in every notification.
    Given A store with a state listener that dispatches a sync action the first time it is notified.
    And A second listener that records the state it reads on every notification.
    When The state changes.
    Then Both notifications read the newest state, and the second listener never reads an obsolete state.
