Feature: Store slices follow their provider and include parent state

  Scenario: Replacing a provider store changes the state read inside an existing slice.
    Given A store with count one and a mounted slice, and a second store with count ten.
    And The slice data and its component identity remain unchanged.
    When The provider switches to the second store and a component dispatches an increment.
    Then The component reads count eleven from the second store.
    And The increment changes only the second store.

  Scenario: Replacing a provider store merges the slice data into the new store.
    Given A mounted slice with the profile route, and a second store with no route.
    When The provider switches to the second store.
    Then Every render with the second store reads the profile route.
    And The second store contains the profile route, and keeps its own count.

  Scenario: The replacement store gets the current slice data of the mounted slice.
    Given A mounted slice that merged the profile route into the first store.
    When The provider switches to a second store, and the slice now has the settings route.
    Then The second store contains the settings route.
    And The first store keeps the profile route.

  Scenario: Switching back to a store that the slice already used does not merge the slice again.
    Given A mounted slice merged the profile route into the first store.
    And A component changed the route of the first store to edited.
    When The provider switches to a second store, and then back to the first store.
    Then The first store keeps the edited route, and the component reads it.

  Scenario: A nested slice reads data from its parent slice on the first render.
    Given A store with no user and nested slices that provide a user and a route.
    When The nested slices mount together.
    Then Every render inside the inner slice reads the user supplied by the outer slice.
    And The committed store contains both the loaded user and the route.

  Scenario: Nested slices can use the user that their parent supplied.
    Given The store has no user and an outer slice supplies a loaded user.
    When An inner slice reads the name of the loaded user.
    Then The loaded user is available and rendering succeeds.
    And No error boundary replaces the loaded route.

  Scenario: Replacing a provider without a slice switches state reads and dispatches together.
    Given A component reads a store with count one, and another store has count ten.
    When The provider switches to the second store and the component dispatches an increment.
    Then The component reads count eleven and only the second store changes.
    And Later changes to the first store do not affect the component.

  Scenario: An inner slice can read a parent slice that has already committed.
    Given An outer slice has already supplied the user Ann to the store.
    When An inner slice with the profile route mounts later.
    Then The first inner render can read Ann without a missing value.
    And The store keeps both the parent user and the inner route.

  Scenario: Nested slices include their parent data when the server renders them.
    Given A server store with no user and nested slices that supply Ann and the profile route.
    When The server renders the nested route.
    Then The route reads Ann and the profile route in the same render.
    And The server store contains both slices after rendering.

  Scenario: Three nested slices that mount together are all read by the innermost component in every render.
    Given A store with no team, user or route.
    And Three nested slices supply the team Red, the user Ann and the profile route, and a component outside the slices reads the store.
    When The three slices mount in the same render.
    Then Every render of the innermost component reads Red, Ann and profile.
    And The component outside the slices first reads the store without the slices, and then reads all three after the commit.
    And The store contains the three slices, and no warning is logged.

  Scenario: Each component reads the slices that contain it, until the slices commit.
    Given An outer slice with the user Ann that contains a component and an inner slice with the profile route.
    When Both slices mount in the same render.
    Then The first render of the component in the outer slice reads Ann, without the profile route.
    And Every render of the component in the inner slice reads Ann and the profile route.
    And After the commit, both components read Ann and the profile route.

  Scenario: When nested slices supply the same key, the inner slice wins.
    Given An outer slice with the users route, and an inner slice with the profile route.
    When Both slices mount in the same render.
    Then Every render of the component in the inner slice reads the profile route.
    And The store has the profile route after the commit.

  Scenario: After nested slices commit, the inner components read later store changes, and the slices are not merged again.
    Given Nested slices with the user Ann and the profile route are mounted.
    When An action increments the count, and another action changes the user to Bob.
    Then The component in the inner slice reads the count one and the user Bob.

  Scenario: Navigating to another user remounts the nested slices, and the inner component never reads the previous user.
    Given An outer slice with the user Ann (with the key Ann) contains an inner slice with the posts route.
    When The page navigates to the user Bob, so the outer slice gets the key Bob.
    Then Every render of the inner component after the navigation reads Bob.
    And The store has the user Bob.

  Scenario: An inner slice with a new key, inside an outer slice that stays mounted, reads the outer data and its new data.
    Given An outer slice with the user Ann contains an inner slice with the profile route (with the key profile).
    When The inner slice gets the settings route, with the key settings.
    Then Every render of the inner component after the change reads Ann and the settings route.

  Scenario: Nested slices in a transition whose content suspends commit both slices when the content resolves.
    Given A page shows route 1, whose nested slices have the team A and the user One.
    When A transition goes to route 2, whose nested slices have the team B and the user Two, and whose content suspends.
    And While the transition is pending, an action increments the count.
    Then While pending, the page and the store still have the team A and the user One.
    And Every render of the route 2 component reads the team B and the user Two.
    And After the content resolves, the page shows team B, user Two and count one, and the store has them.

  Scenario: Nested slices in an abandoned transition leave nothing in the store.
    Given A page shows route 1, whose nested slices have the team A and the user One.
    When A transition goes to route 2, whose nested slices have the team B and the user Two, and whose content never resolves.
    And Another transition goes back to route 1, and an action increments the count.
    Then The page shows the team A, the user One and the count one.
    And The store has nothing from the slices of route 2.

  Scenario: In StrictMode, nested slices that mount together are read in every render and merged once each.
    Given A store with a state observer, and StrictMode.
    When Nested slices with the user Ann and the profile route mount together.
    Then Every render of the inner component reads Ann and the profile route.
    And The state observer saw two changes, one for each slice, and no warning is logged.

  Scenario: Hydrating nested slices produces no mismatch, and the live store gets both slices.
    Given The server HTML of nested slices with the user Ann and the profile route.
    And A client store without the slices.
    When The client hydrates the HTML.
    Then There is no hydration error, and every render of the inner component reads Ann and the profile route.
    And The live store has both slices.

  Scenario: Nested slices merged while the persistor is still reading are merged again into the persisted state.
    Given A store whose persistor is still reading a persisted state with the count five.
    When Nested slices with the user Ann and the profile route mount before the store is ready.
    Then Every render of the inner component before the store is ready reads Ann and the profile route.
    And When the persistor finishes reading, the state has the count five, the user Ann and the profile route.

  Scenario: Nested slices use the mergeServerState option of a class-based state.
    Given A store whose state is a class, created with a mergeServerState option.
    When Nested slices with the team Red and the user Ann mount together.
    Then Every render of the inner component reads Red and Ann.
    And The store state is an instance of the class, with Red and Ann.

  Scenario: When the provider switches stores, nested slices are merged into the new store, and the inner component reads both.
    Given Nested slices with the user Ann and the profile route are mounted with a first store.
    And A second store has the count ten, and no user or route.
    When The provider switches to the second store.
    Then Every render of the inner component with the second store reads Ann, the profile route and the count ten.
    And The second store has both slices, and the first store does not change.
