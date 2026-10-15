Feature: Abort

  Scenario: The store aborts the actions of a type that are in progress.
    Given Two actions of the same type, dispatched with "A" and "B", with requests that use the abortSignal.
    When The store aborts that action type.
    Then Both requests are cancelled, and both actions finish aborted: dispatchAndWait resolves, and their status says it was aborted.
    And Their isAborted is true, and their abortSignal is aborted.
    And The state is unchanged, the action type is not waiting anymore, and did not fail.

  Scenario: The store aborts the actions of the subtypes too.
    Given An action type, and a subtype of it, both with an action in progress.
    When The store aborts the supertype.
    Then Both actions are aborted.

  Scenario: The store aborts only the actions with the given statusKey.
    Given An action type with a statusKey, dispatched with "A" and "B".
    When The store aborts that action type, with the statusKey of "A".
    Then "A" is aborted, but "B" is not: it finishes, and changes the state.
    And The action type is still waiting for "B", but not for "A".

  Scenario: Aborting an action type with no action in progress does nothing.
    Given An action type with no action in progress.
    When The store aborts that action type.
    And Then the action is dispatched.
    Then The action runs normally, and changes the state.

  Scenario: Aborting an action type does not affect the other action types.
    Given Two different action types, each with an action in progress.
    When The store aborts one of the types.
    Then The action of the other type is not aborted, and changes the state.

  Scenario: The result of an aborted action is ignored, even if its request does not use the abortSignal.
    Given An action in progress, whose request does not use the abortSignal.
    When The store aborts the action type.
    Then The action is still waiting, since its request cannot be cancelled.
    And When the request finishes, the result is ignored: the state is unchanged, and the action finishes aborted.

  Scenario: The error of an aborted action is ignored.
    Given An action in progress, whose request will fail with some error.
    When The store aborts the action type, and then the request fails.
    Then The error is ignored: the action finishes aborted, and does not count as failed.

  Scenario: Work that checks the abortSignal between its steps stops at the check.
    Given An action in progress, with two steps, that calls abortSignal.throwIfAborted() between them.
    When The store aborts the action type during the first step.
    Then The second step does not run, and the action finishes aborted.

  Scenario: An action instance can be aborted by itself, without affecting the others of its type.
    Given Two actions of the same type in progress, "A" and "B".
    When The action "A" is aborted with its abort() method.
    Then "A" is aborted, but "B" is not: it finishes, and changes the state.

  Scenario: An action aborted before it is dispatched does not run.
    Given An action that was not dispatched yet.
    When The action is aborted with its abort() method, and then dispatched.
    Then Its reducer does not run, and the action finishes aborted.

  Scenario: Aborting an action that already finished has no effect.
    Given An action that finished, and changed the state.
    When The action is aborted with its abort() method.
    Then Its isAborted is still false, and its abortSignal is not aborted.

  Scenario: An action aborted during its before method does not run its reducer.
    Given An action with an ASYNC before method, which is in progress.
    When The store aborts the action type, while the before method is still running.
    Then The reducer does not run, and the action finishes aborted.

  Scenario: An action aborted while waiting to retry stops retrying right away.
    Given An action with retry, with a long retry delay, whose first attempt failed, so it waits to retry.
    When The store aborts the action type.
    Then The action stops waiting, and finishes aborted, without retrying.

  Scenario: An action aborted during an attempt is not retried when the attempt fails.
    Given An action with retry, whose first attempt is running.
    When The store aborts the action type, and then the attempt fails.
    Then The action is not retried, and finishes aborted.

  Scenario: The abortSignal of an aborted action has an AbortError as its reason, like a cancelled fetch.
    Given An action in progress.
    When The store aborts the action type.
    Then The reason of its abortSignal is an AbortError, and a fetch that rejects with it is aborted silently.

  Scenario: A component can abort the action it started, when it unmounts.
    Given A component that dispatches an action on mount, and aborts the action type on unmount.
    When The component unmounts while the action is in progress.
    Then The request is cancelled, and the action finishes aborted, without changing the state.

  Scenario: A component can abort an action type with the abort function from useStore.
    Given A component that gets the abort function from useStore, destructured.
    And An action of some type in progress.
    When The component calls abort with that action type.
    Then The action is aborted.
