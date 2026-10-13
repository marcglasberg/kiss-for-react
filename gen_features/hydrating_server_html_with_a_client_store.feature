Feature: Hydrating server HTML with a client store

  Scenario: Hydrating with the same state as the server produces no mismatch and no extra render.
    Given HTML rendered by a server store with the name Mary, and a client store created with the same state.
    When The client hydrates the HTML.
    Then There is no recoverable hydration error, and the component rendered and committed once.
    And A later state change updates the hydrated component.

  Scenario: When the client store changed before hydration, hydration uses the server state, then catches up.
    Given HTML rendered with the name Mary, and a client store created with Mary, where an action changed the name to Anna before hydrating.
    When The client hydrates the HTML, giving the server state as serverState.
    Then There is no recoverable hydration error: the first commit shows Mary, as the HTML.
    And The component then catches up, showing Anna.

  Scenario: A Suspense boundary hydrated later still matches the server HTML, and then catches up with the store.
    Given HTML with a name outside a Suspense boundary and a name inside it, both Mary.
    And On the client, the component inside the boundary is lazy, so the boundary cannot hydrate right away.
    When The client hydrates, the store changes the name to Anna while the boundary waits, and then the lazy component arrives.
    Then The outside name shows Anna before the boundary hydrates.
    And The boundary hydrates with no recoverable error, and then shows Anna too.

  Scenario: Readiness and status hydrate as the server rendered them, and then follow the client store.
    Given HTML rendered by a server store without a persistor: ready, no action waiting or failed.
    And A client store with a persistor still reading, where a Load action is running and a Fail action failed.
    When The client hydrates the HTML, and later the persistor finishes reading and the Load action finishes.
    Then Hydration matches the HTML, with no recoverable error.
    And The component then shows the client values: not ready, waiting, failed with its exception.
    And When the store is ready and Load finishes, it shows ready and not waiting, still failed.
