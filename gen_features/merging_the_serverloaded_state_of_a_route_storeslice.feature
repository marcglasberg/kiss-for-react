Feature: Merging the server-loaded state of a route (StoreSlice)

  Scenario: On the server, the components inside the slice render the merged state, and the slice is merged into the request store.
    Given A request store (created with server: true) with the root state, and a page whose route content is inside a StoreSlice with the user Ann.
    When The page is rendered to a string.
    Then The HTML of the route shows Ann.
    And The layout, outside the slice, shows the root server state (it rendered before the slice).
    And The request store has the merged state, and the merge was a MergeServerStateAction.

  Scenario: Hydrating a page with a slice produces no mismatch, and the live store gets the slice before the route renders.
    Given The server HTML of a page with the user Ann in a slice, and a client store created with the root state (no slice).
    When The client hydrates the HTML.
    Then There is no recoverable hydration error, and no warning.
    And The route shows Ann from its first commit, and the live store has Ann.
    And The layout catches up with the merged store right after the commit.
    And A later action still works, and the slice is kept.

  Scenario: When the client store changed before hydration, the route hydrates against the merged server state, then shows the slice.
    Given The server HTML of a page with the user Ann in a slice.
    And A client store where an action changed the clicks to 1, and the user to Bob, before hydrating.
    When The client hydrates the HTML, with the root state as serverState.
    Then There is no recoverable hydration error.
    And After hydration, the route shows Ann (the server slice wins), and the clicks are 1 (kept).

  Scenario: On the client, a slice that mounts (client-side navigation) renders its route with the slice in its first commit.
    Given A mounted page showing the layout, and a client store with the root state.
    When A route with a StoreSlice with the user Ann mounts.
    Then The first commit of the route shows Ann: no empty or stale frame.
    And The layout shows Ann after the commit, and no warning is logged.

  Scenario: In StrictMode, the slice is merged once: the state observer sees one change, and nothing is published twice.
    Given A store with a state observer, and StrictMode, which calls the initializers twice and runs the effects twice.
    When A page with a slice mounts.
    Then The state observer saw one state change, and the store dispatched one action.
    And No warning is logged.

  Scenario: A new key merges the new slice and keeps the rest of the state; the same key with a new state prop does nothing.
    Given A mounted page with a slice with the user Ann, where the clicks were then changed to 2.
    When The page re-renders with the same key and the user Bob in the state prop.
    Then Nothing changes: the slice is merged once per mount.
    And When the page re-renders with a new key and the user Bob, the route shows Bob, and the clicks are still 2.

  Scenario: The mergeServerState option of createStore decides how a slice is merged, which class-based states need.
    Given A store whose state is a class instance, created with a mergeServerState option that builds the new instance.
    When A slice is merged.
    Then The option is used, and the state is a new instance of the class.
    And Without the option, merging into a class-based state throws a StoreException explaining it.

  Scenario: A slice merged while the persistor is still reading is merged again into the persisted state when it arrives.
    Given A client store with a persistor still reading, whose persisted state has 5 clicks and no user.
    When A page with a slice with the user Ann mounts, before the store is ready.
    Then The route shows Ann right away, with 0 clicks.
    And When the persistor finishes reading, the state has the 5 persisted clicks and the user Ann: the route data was not lost.
    And The slice merged after the store is ready is persisted.

  Scenario: Under concurrent rendering, a route with a slice rendered in a transition, with a sibling that suspends, shows no tearing.
    Given A mounted page on route 1 (user One), and a client store.
    When A transition switches to route 2, whose slice has the user Two, and whose sibling suspends until later.
    Then While the transition is pending, the page still shows route 1 with the user One everywhere, and the live store still has the user One.
    And When the sibling resolves, the page shows route 2 with the user Two, in the layout and in the route, and no warning is logged.

  Scenario: A transition to a route that suspends, and is then abandoned, leaves nothing of its slice in the live store.
    Given A mounted page on route 1 (user One), and a client store.
    When A transition switches to route 2, whose slice has the user Two and whose content suspends, and before it resolves, another transition goes back to route 1.
    And An unrelated action is dispatched.
    Then The page shows route 1 with the user One everywhere, with the result of the action, and the live store has the user One.
    And The route committed only once, with One, and no warning is logged.

  Scenario: A route that suspends outside a transition merges its slice when its content commits, not while the fallback shows.
    Given A mounted page on route 1 (user One), and a client store.
    When The page switches (not in a transition) to route 2, whose slice has the user Two and whose content suspends, so the fallback shows.
    Then While the fallback shows, the layout still shows the user One, and the live store has the user One.
    And When the content resolves, the page shows route 2 with the user Two, in the layout and in the route, and the first commit of route 2 shows Two.

  Scenario: A slice inside a Suspense boundary that streams after the shell is in the streamed HTML, and hydrates without mismatch.
    Given A request store (created with server: true), and a page whose route (with a slice with the user Ann) is a lazy component inside Suspense.
    When The page is streamed with renderToPipeableStream, and the complete HTML is hydrated by a client store with the root state.
    Then The streamed HTML has the layout with the root state and the route with Ann.
    And Hydration produces no mismatch, and the page then shows Ann everywhere.

  Scenario: mergeServerState can be called directly, and merging the same slice again publishes nothing.
    Given A store with a state listener.
    When A slice is merged twice.
    Then The state has the slice, the listener was called once, and the action is a MergeServerStateAction.
