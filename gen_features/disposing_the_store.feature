Feature: Disposing the store

  Scenario: A disposed store does not accept new actions.
    Given A store.
    When The store is disposed.
    And An action is dispatched.
    Then The action is aborted, and the state does not change.
    And The store knows it is disposed.

  Scenario: Disposing the store stops the action features, like polling.
    Given A store with a polling action running.
    When The store is disposed.
    Then The polling stops, and the count does not grow anymore.

  Scenario: Disposing the store disposes all its props, and removes them.
    Given A store with disposable props, and props that cannot be disposed.
    When The store is disposed.
    Then The disposable props are disposed.
    And All props are removed.

  Scenario: Disposing the store stops a timer kept in a prop, so that it does not keep running after the test.
    Given An action that starts an interval and keeps it in a prop, with clearInterval as its dispose.
    When The store is disposed.
    Then The interval is cleared.

  Scenario: Disposing the store waits for the async disposals of the props.
    Given A store with props whose disposals are asynchronous: one with Symbol.asyncDispose, and one with a dispose option that returns a promise.
    When The store is disposed, and the returned promise is awaited.
    Then All the async disposals have finished.

  Scenario: Disposing the store twice disposes the props only once.
    Given A store with a disposable prop.
    When The store is disposed twice.
    Then The prop is disposed once.
    And Both calls finish without errors.

  Scenario: A prop set after the store was disposed is disposed right away, and not kept.
    Given A disposed store.
    When A prop is set, for example by an async action that was still running.
    Then The value is disposed right away.
    And The prop is not kept.

  Scenario: Disposing the store cancels the dispatchWhens that are still waiting.
    Given A store with a dispatchWhen waiting for a condition, with a timeout.
    When The store is disposed.
    Then The onTimeout is not called, even after the timeout.

  Scenario: Disposing the store pauses the persistor, and cancels its pending save.
    Given A store with a persistor with a throttle.
    And The state changed twice, so that the second change is waiting for the throttle to be saved.
    When The store is disposed.
    Then The pending save is cancelled, and the state is not saved after the throttle.

  Scenario: A disposal error does not make dispose fail, and the other props are still disposed.
    Given A store with an errorObserver, and a prop whose dispose throws, followed by a disposable prop.
    When The store is disposed.
    Then The returned promise resolves.
    And The error is given to the errorObserver, with a null action.
    And The other prop is disposed.

  Scenario: An async disposal that fails does not make dispose fail.
    Given A store with an errorObserver, and a prop with Symbol.asyncDispose that rejects.
    When The store is disposed.
    Then The returned promise resolves.
    And The error is given to the errorObserver, with a null action.

  Scenario: The store can be disposed with the explicit resource management protocol.
    Given A store with a disposable prop.
    When The store is disposed with Symbol.dispose, or with Symbol.asyncDispose.
    Then The store is disposed, and so is the prop.

  Scenario: A store declared with `await using` is disposed at the end of the block.
    Given A block that creates a store with `await using`, and sets a disposable prop.
    When The block ends.
    Then The store is disposed, and so is the prop.
