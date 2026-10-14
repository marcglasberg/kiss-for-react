Feature: Store props

  Scenario: A prop set in the store can be read back with its key.
    Given A store.
    When A prop is set with a key and a value.
    Then The prop can be read with the key.
    And Reading a key that was never set returns undefined.

  Scenario: Prop keys are compared by identity, like the keys of a Map.
    Given A store with props with a string key, a symbol key and an object key.
    When The props are read.
    Then Equal strings find the prop.
    And The same symbol or object finds the prop, but a different one does not.

  Scenario: The props of the store can be listed.
    Given A store with some props.
    When The props are listed.
    Then All the props are there, with their keys and values.
    And Setting a prop to undefined keeps its key.

  Scenario: A prop set again with a different value gets the new value.
    Given A store with a prop.
    When The prop is set again with another value.
    Then Reading the prop gives the new value.
    And The props still have one entry with that key.

  Scenario: Actions can set, read and dispose props, with the same methods as the store.
    Given An action that sets a prop, and reads it.
    And An action that lists the props, and another that disposes the prop.
    When The actions are dispatched.
    Then The prop they set is in the store, and the prop the store set is seen by the actions.
    And The prop they dispose is removed from the store.

  Scenario: A timer kept in a prop, with a dispose option, is stopped when the prop is disposed.
    Given An action that starts an interval and keeps it in a prop, with clearInterval as its dispose.
    And The interval dispatches an action that counts.
    When Another action disposes the prop.
    Then The interval stops, and the count does not grow anymore.
    And The prop is removed from the store.

  Scenario: Setting a prop again, with the same key, disposes the previous value.
    Given An action that starts an interval and keeps it in a prop, with clearInterval as its dispose.
    When The action is dispatched twice.
    Then The first interval is stopped, so that it does not leak.
    And Only the second interval is in the prop.

  Scenario: The dispose option given to setProp is called with the value, when the prop is disposed.
    Given A prop set with a dispose option.
    When The prop is disposed.
    Then The dispose option is called once, with the value.
    And The prop is removed.

  Scenario: Disposing a prop that does not exist does nothing.
    Given A store without the prop.
    When The prop is disposed.
    Then Nothing happens, and no error is thrown.

  Scenario: A value with Symbol.dispose is disposed with it.
    Given A prop whose value implements Symbol.dispose.
    When The prop is disposed.
    Then Its Symbol.dispose method is called once.

  Scenario: A value with Symbol.asyncDispose is disposed with it.
    Given A prop whose value implements Symbol.asyncDispose.
    When The prop is disposed.
    Then Its Symbol.asyncDispose method is called once.
    And The prop is removed right away, without waiting for the disposal to finish.

  Scenario: An AbortController is aborted when disposed.
    Given A prop whose value is an AbortController.
    When The prop is disposed.
    Then The controller is aborted.

  Scenario: A WebSocket, EventSource, BroadcastChannel or MessagePort is closed when disposed.
    Given Props whose values are a WebSocket, an EventSource, a BroadcastChannel and a MessagePort.
    When The props are disposed.
    Then Each of them is closed.

  Scenario: A Worker is terminated when disposed.
    Given A prop whose value is a Worker.
    When The prop is disposed.
    Then The worker is terminated.

  Scenario: An object with an unsubscribe method, like an RxJS subscription, is unsubscribed when disposed.
    Given A prop whose value has an unsubscribe method.
    When The prop is disposed.
    Then The unsubscribe method is called once.

  Scenario: A function kept in a prop is not called when disposed, unless the dispose option says so.
    Given A prop whose value is an unsubscribe function, without the dispose option.
    And Another prop with the same kind of function, with a dispose option that calls it.
    When Both props are disposed.
    Then The first function is not called, and the prop is only removed.
    And The second function is called.

  Scenario: Values that cannot be disposed, like promises, numbers and plain objects, are only removed.
    Given Props whose values are a promise, a number, a string, null and a plain object.
    When The props are disposed.
    Then They are removed, and no error is thrown.

  Scenario: The dispose option wins over the other ways of disposing a value.
    Given A prop with a dispose option, whose value also has Symbol.dispose and unsubscribe.
    When The prop is disposed.
    Then Only the dispose option is called.

  Scenario: Symbol.dispose wins over the built-in types and unsubscribe.
    Given A prop whose value is an AbortController with a Symbol.dispose and an unsubscribe method.
    When The prop is disposed.
    Then Only Symbol.dispose is called: the controller is not aborted, and unsubscribe is not called.

  Scenario: Setting a prop again with the same value does not dispose it, and updates its dispose option.
    Given A prop set with a dispose option.
    When The same value is set again with the same key, with another dispose option.
    And The prop is disposed.
    Then The value was not disposed when it was set again.
    And The new dispose option is the one called when the prop is disposed.

  Scenario: Disposing all props disposes the disposable ones, and removes them all.
    Given A store with disposable props, and props that cannot be disposed.
    When All props are disposed, without a predicate.
    Then Each disposable prop is disposed.
    And All props are removed, including the ones that cannot be disposed.

  Scenario: Disposing props with a predicate disposes and removes only the props it selects.
    Given A store with some props.
    When The props are disposed with a predicate that selects some of them, by key and value.
    Then The selected props are disposed and removed.
    And The other props are kept, and not disposed.

  Scenario: Props are disposed in the order they were set.
    Given Props set in some order.
    When All props are disposed.
    Then They are disposed in that order.

  Scenario: A dispose that throws does not stop the other props from being disposed.
    Given A store with an errorObserver, and three disposable props, of which the second throws when disposed.
    When All props are disposed.
    Then The other two props are disposed, and all three are removed.
    And The error is given to the errorObserver, with a null action.

  Scenario: An async dispose that fails is reported to the errorObserver.
    Given A store with an errorObserver, and a prop whose dispose returns a promise that rejects.
    When The prop is disposed.
    Then The error is given to the errorObserver, with a null action.
    And The prop was removed.

  Scenario: Without an errorObserver, a dispose that throws is logged, and the others are still disposed.
    Given A store with a logger and no errorObserver, and two disposable props, of which the first throws when disposed.
    When All props are disposed.
    Then The error is logged.
    And The second prop is disposed, and both are removed.

  Scenario: A dispose can set or dispose other props, without breaking the disposal in progress.
    Given A prop whose dispose disposes another prop, and sets a new one.
    When All props are disposed.
    Then The other prop is disposed only once.
    And The new prop is kept, since it was set after the disposal started.

  Scenario: Clearing the internal action props does not touch the store props.
    Given A store with a disposable prop.
    When The internal action props are cleared.
    Then The prop is still there, and was not disposed.

  Scenario: Shutting down the store does not dispose the props.
    Given A store with a disposable prop.
    When The store is shut down.
    Then The prop is still there, and was not disposed.

  Scenario: Logging out keeps the props, by default.
    Given A store with a disposable prop.
    When The store logs out.
    Then The prop is still there, and was not disposed.

  Scenario: Logging out can dispose all the props.
    Given A store with disposable props.
    When The store logs out with disposeProps true.
    Then All props are disposed and removed, before logOut waits.

  Scenario: Logging out can dispose only some of the props.
    Given A store with a prop that belongs to the user, and a prop that belongs to the app.
    When The store logs out with a disposeProps predicate that selects the user prop.
    Then The user prop is disposed and removed.
    And The app prop is kept.

  Scenario: Each store has its own props.
    Given Two stores.
    When A prop is set in one of them.
    Then The other store does not have it.

  Scenario: A disposeProps predicate that throws is reported, and does not stop the other props from being disposed.
    Given A store with an errorObserver, and three disposable props.
    And A predicate that throws for the second prop, and returns true for the others.
    When The props are disposed with the predicate.
    Then The first and third props are disposed and removed.
    And The second prop is kept, and not disposed.
    And The error is given to the errorObserver, with a null action.

  Scenario: Logging out with a disposeProps predicate that throws still finishes, and the store keeps working.
    Given A store with an errorObserver, and a disposable prop.
    When The store logs out with a disposeProps predicate that throws.
    Then The logOut finishes, and the error is given to the errorObserver.
    And The prop is kept.
    And The store accepts new actions, and can log out again.

  Scenario: A dispose that throws a value which cannot be converted to a string is still logged, without failing.
    Given A store with a logger and no errorObserver, and three props.
    And The first prop throws a Symbol when disposed, and the second throws an object whose toString throws.
    When All props are disposed.
    Then The errors are logged, naming the props.
    And The third prop is disposed, and all three are removed.
