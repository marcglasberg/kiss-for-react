Feature: Rendering on the server

  Scenario: Every hook renders on the server, with no DOM and no missing server snapshot.
    Given A store, and a component using useSelect, useObject, useAllState, useIsWaiting, useIsFailed, useExceptionFor and useIsStoreReady.
    When The component is rendered to a string, in an environment with no window or document.
    Then The HTML shows the state, no waiting or failed action, and the store as ready.
    And No error or warning is logged.

  Scenario: The server renders the state given as serverState, or the initial state of the store if none is given.
    Given A store created with the name Mary, where an action then changed the name to Anna before rendering.
    When The component is rendered to a string with serverState={store.state}, and again without serverState.
    Then With serverState, the HTML shows Anna, the state at render time.
    And Without it, the HTML shows Mary, the initial state the store was created with.

  Scenario: Two requests with their own stores do not share state, status or readiness.
    Given Store 1 with name Mary, a failed action and a running action; and store 2 with name Bob and a persistor still reading.
    When Each store is rendered to a string, one after the other, and then store 1 again.
    Then Each HTML shows its own state.
    And The server HTML never shows a waiting or failed action, and always shows the store as ready, as documented.

  Scenario: A class-based state with a Map can be rendered on the server, transferred, and restored with its methods.
    Given A server store whose state is a class instance with a Map of class instances.
    When The server renders it, serializes the state, and a client store is created from the restored state.
    Then The server HTML uses the class methods.
    And The restored state is a State instance whose Map holds Tag instances, and a client store renders the same HTML.

  Scenario: A server render leaves nothing behind: no subscription, no effect, no dispatched action.
    Given A store, and a component using the state, status and readiness hooks, plus useStoreEffect with onMount.
    When The component is rendered to a string, and the result is discarded.
    Then The store has no state, status or readiness subscription.
    And onMount was not called, and no action was dispatched.
