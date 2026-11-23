Feature: Server safety: a per-request store leaves nothing behind

  Scenario: Creating a store, dispatching and awaiting async actions, and rendering, leaves no live timers.
    Given Fake timers that count the pending timers, and a store created for a request.
    When Async actions are dispatched and awaited, the component is rendered to a string, and the store is disposed.
    Then The HTML shows the state after the actions.
    And No timer is pending after the actions, after the render, or after the disposal.

  Scenario Outline: The timers of the action features are cleared when the server store is disposed.
    Given Fake timers that count the pending timers, and a store where <Feature> left a timer pending.
    When The store is disposed.
    Then No timer is pending anymore.
    And The feature does not run after the disposal, even after its time passes.
    Examples: 
      | Feature                            |
      | polling                            |
      | debounce                           |
      | retry                              |
      | dispatchWhen with a timeout        |
      | waitCondition with a timeout       |
      | waitActionCondition with a timeout |
      | a persistor with a throttle        |

  Scenario Outline: A wait still pending when the store is disposed is rejected, so that the server code does not hang.
    Given A store with an action still running, and <Wait> still waiting, with a timeout.
    When The store is disposed.
    Then The wait rejects with an AbortDispatchException, right away.
    And Its timeout is cancelled, so no timer is pending.
    Examples: 
      | Wait                |
      | waitCondition       |
      | waitActionCondition |
      | waitAllActions      |
      | waitActionType      |

  Scenario: Inside an action, a wait aborted by the disposal aborts the action, which does not fail.
    Given An action whose reducer awaits a waitCondition, and an errorObserver.
    When The store is disposed while the action waits.
    Then The action finishes as aborted, not as failed.
    And The errorObserver is not called.

  Scenario: A persistor that throws on the server does not break the render, and the readiness hook still renders true.
    Given A store created with a persistor that reads window.localStorage, in an environment with no window.
    And An errorObserver.
    When A component using useIsStoreReady and useSelect is rendered to a string.
    Then The HTML shows the store as ready, with the initial state.
    And The error of the persistor is given to the errorObserver, with a null action, and the store becomes ready.

  Scenario: Disposing the server store after the render leaves no timers, even if actions were dispatched during it.
    Given A component that dispatches a polling action and a debounced action from its body, which is a mistake on the server.
    When The component is rendered to a string, and the store is disposed.
    Then The HTML shows the state the server rendered with, since nothing re-renders.
    And No timer is pending after the disposal.
