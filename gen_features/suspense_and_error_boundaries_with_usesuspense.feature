Feature: Suspense and error boundaries with useSuspense

  Scenario: While the action runs, the component suspends and the nearest Suspense shows its fallback.
    Given A mounted component that calls useSuspense(LoadUser) and then shows the user, inside a Suspense boundary.
    When A LoadUser action starts, waits, and then finishes with the loaded user.
    Then The boundary shows the fallback while the action runs, and the code after the hook does not run.
    And When the action finishes, the component shows the loaded user.

  Scenario: A component mounted while the action is already running suspends until it finishes.
    Given A LoadUser action in progress.
    When A component that calls useSuspense(LoadUser) mounts inside a Suspense boundary, and later the action finishes.
    Then The boundary shows the fallback at first, and then the loaded user.

  Scenario: With a statusKey, only the component whose key is running suspends.
    Given Two mounted components, for users 1 and 2, each inside its own Suspense boundary, each calling useSuspense with its own statusKey.
    When A LoadUser action for user 2 starts, waits, and finishes.
    Then Only the boundary of user 2 shows the fallback. The component of user 1 keeps showing its content.

  Scenario: Without a statusKey, the component suspends while any action of the type runs, including subclasses.
    Given A mounted component that calls useSuspense(BaseLoad) without a statusKey, where BaseLoad is an abstract class.
    When A SubLoadUser action (a subclass of LoadUser, which extends BaseLoad) starts and finishes.
    Then The component suspends while it runs, and shows the user when it finishes.

  Scenario: An action of another type does not make the component suspend.
    Given A mounted component that calls useSuspense(LoadUser).
    When An Other action starts and stays in progress.
    Then The component keeps showing its content.

  Scenario: Only the nearest Suspense boundary shows its fallback.
    Given A Suspense boundary around a header and an inner Suspense boundary, which holds the component that calls useSuspense.
    When The action runs.
    Then The inner boundary shows its fallback, and the header outside it stays visible.

  Scenario: The promise thrown while the action runs is the same object on every render, and is released when the action finishes.
    Given A LoadUser action in progress.
    When The store is asked twice for the suspense value of LoadUser, for that key, and then the action finishes.
    Then Both answers are the same promise, which resolves when the action finishes, and the store then keeps no promise.
    And A new run of the action gets a new promise.

  Scenario: A store whose components never call useSuspense keeps no promises.
    Given A mounted component that uses useIsWaiting, and never useSuspense.
    When A LoadUser action starts and finishes.
    Then The store never creates a suspense promise.

  Scenario: When the action failed, the component throws the error to the nearest error boundary.
    Given A mounted component that calls useSuspense(LoadUser), inside an error boundary and a Suspense boundary.
    When A LoadUser action for that key fails with a UserException.
    Then The error boundary shows the error, and the failure is still recorded in the store (isFailed is true).
    And When the action is dispatched again, the failure is cleared, the Suspense boundary shows the fallback, and then the user.

  Scenario: Any error is thrown to the error boundary, not only a UserException.
    Given A mounted component that calls useSuspense(LoadUser), inside an error boundary.
    When A LoadUser action for that key fails with a plain Error.
    Then The error boundary shows that error.

  Scenario: A failure of the same type with another statusKey is not thrown.
    Given A mounted component that calls useSuspense(LoadUser, { statusKey: 1 }), inside an error boundary.
    When A LoadUser action for user 2 fails.
    Then The component keeps showing its content.

  Scenario: With throwErrors false, a failed action is not thrown, and the component can use useIsFailed instead.
    Given A mounted component that calls useSuspense(LoadUser, { statusKey, throwErrors: false }) and useIsFailed.
    When A LoadUser action for that key fails.
    Then The component renders, and shows the failure with useIsFailed.

  Scenario: On the server, useSuspense never suspends and never throws.
    Given A server store where a LoadUser action is in progress for user 1, and a LoadUser action failed for user 2.
    When Components for users 1 and 2 that call useSuspense are rendered to a string.
    Then The HTML shows the state, with no fallback and no error.

  Scenario: While hydrating, useSuspense renders what the server rendered, and then follows the client store.
    Given HTML rendered by a server store with user 1 = Ann, and a client store where a LoadUser action for user 1 is running.
    When The client hydrates the HTML, and later the action finishes.
    Then Hydration matches the HTML, with no recoverable error.
    And After hydration, the component suspends (the boundary shows the fallback), and then shows the loaded user.
