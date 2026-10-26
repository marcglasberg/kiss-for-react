Feature: Server store

  Scenario: A polling action dispatched with Poll.start runs once in a server store, and starts no polling.
    Given A server store, and a client store.
    And A polling action that adds 1 to the count every 50 millis.
    When The action is dispatched with Poll.start in both stores, and 180 millis pass.
    Then In the server store, the count is 1: the action ran once, and no tick happened.
    And In the client store, the count is more than 1: the action ran, and then the ticks.

  Scenario: Poll.runNowAndRestart runs once in a server store, Poll.stop does nothing, and Poll.once is unchanged.
    Given A server store, and a polling action that adds 1 to the count every 50 millis.
    When The action is dispatched with Poll.runNowAndRestart, then with Poll.stop, then with Poll.once, and 180 millis pass.
    Then The count is 2: the runNowAndRestart ran once, the stop did nothing, and the once ran once.
    And No tick happened.

  Scenario: In a server store, a second dispatch with Poll.start runs the action again, since nothing is "already active".
    Given A server store, and a client store.
    And A polling action that adds 1 to the count.
    When The action is dispatched twice with Poll.start, in both stores.
    Then In the server store, the count is 2: both dispatches ran the action.
    And In the client store, the count is 1: the second Poll.start found the polling active, and did nothing.

  Scenario: A polling action that does not override createPollingAction() still fails in a server store.
    Given A server store, and a polling action that forgets to override createPollingAction().
    When The action is dispatched with Poll.start.
    Then The dispatch throws a StoreException that says it must override createPollingAction(), as in a client store.
    And The state does not change.

  Scenario: An action with retry runs its reducer once in a server store, and fails right away.
    Given A server store, and a client store.
    And An async action with retry (3 retries), whose reducer always fails with a UserException.
    When The action is dispatched in both stores.
    Then In the server store, the reducer ran once, the action failed with the UserException, attempts is 0, and shouldRetry was not called.
    And In the client store, the reducer ran 4 times, and attempts is 4.

  Scenario: An action with unlimitedRetryCheckInternet runs its reducer once in a server store, without checking the internet.
    Given A server store, and a client store.
    And An async action with unlimitedRetryCheckInternet, whose reducer always fails, and which counts its internet checks.
    When The action is dispatched in both stores.
    Then In the server store, the reducer ran once, the internet was not checked, and the action failed with the reducer error.
    And In the client store, the internet was checked, and the reducer ran more than once, until the store was disposed.

  Scenario: A SYNC action with retry still fails with a StoreException in a server store.
    Given A server store, and a SYNC action with retry.
    When The action is dispatched.
    Then The dispatch throws a StoreException saying retry needs an ASYNC reducer, as in a client store.

  Scenario: An OptimisticCommand with retry calls sendCommandToServer once in a server store, and rolls back.
    Given A server store, and a client store.
    And An OptimisticCommand with retry (2 retries), whose server call always fails.
    When The command is dispatched in both stores.
    Then In the server store, the server was called once, and the state was rolled back.
    And In the client store, the server was called 3 times, and the state was rolled back.

  Scenario: A debounced action runs its reducer right away in a server store, and still cannot be dispatched with dispatchSync.
    Given A server store, and a client store.
    And An action debounced for 200 millis, that adds 1 to the count.
    When The action is dispatched in both stores, with dispatchAndWait.
    Then In the server store, it finishes in much less than 200 millis, and the count is 1.
    And In the client store, it takes at least 200 millis.
    And In the server store, dispatchSync still throws a StoreException, since a debounced action is ASYNC.

  Scenario: The features without timers behave the same in a server store and in a client store.
    Given A server store, and a client store.
    When Actions with checkInternet, nonReentrant, ignoreOld, throttle, fresh, sequential and OptimisticSync are dispatched in both.
    Then Each feature gives the same result in both stores.

  Scenario: A server store must not have a persistor.
    Given The server option, and a persistor.
    When A store is created with both.
    Then The creation throws a StoreException that says a server store must not have a persistor.
    And A client store with the same persistor is created normally.

  Scenario: A server store never starts the focus and online sources.
    Given A server store, and a client store, both with custom focus and online sources that say the app is not focused and offline.
    When isFocused and isOnline are read in both stores.
    Then In the server store, the sources were not started, and both values are true.
    And In the client store, the sources were started, and both values are false.

  Scenario: store.isServer tells if the store was created with the server option.
    Given A store created with server: true, a store created with server: false, and a store created without the option.
    When isServer is read.
    Then It is true for the first, and false for the other two.

  Scenario: Disposing a server store still disposes the props and rejects the pending waits.
    Given A server store with a prop that has a dispose function, and a pending waitCondition.
    When The store is disposed.
    Then The prop was disposed, and the waitCondition was rejected.

  Scenario: A page rendered on the server with an action that polls by default leaves no timer behind.
    Given A server store, and an action class whose poll field defaults to Poll.start, as the client dispatches it.
    When The server code dispatches the action to load the data, renders the page with renderToString, and disposes the store.
    Then The HTML shows the loaded count.
    And No timer is pending after the render, even before the store is disposed.

  Scenario: The same polling action, in a client store, still starts the polling, so nothing changed on the client.
    Given A client store (no server option), and the action class whose poll field defaults to Poll.start.
    When The action is dispatched, and the polling interval passes 3 times.
    Then The count is at least 3: the action ran, and then the ticks.

  Scenario: An action reads this.store.isServer to skip client-only work on the server.
    Given A server store, and a client store.
    And An action that starts an interval and keeps it in a store prop, unless the store is a server store.
    When The action is dispatched in both stores.
    Then The server store has no clock prop, and the client store has one.

  Scenario: An action with unlimitedRetryCheckInternet runs in a server store even when hasInternet() says there is no internet.
    Given A server store, and a client store.
    And An action with unlimitedRetryCheckInternet whose hasInternet() returns false, and whose reducer adds 1 to the count.
    When The action is dispatched in both stores.
    Then In the server store, the internet was not checked, the reducer ran once, and the count is 1.
    And In the client store, the internet was checked, the reducer never ran, and the action waits until the store is disposed.

  Scenario: An action with retry that succeeds works normally in a server store.
    Given A server store, and an action with retry whose reducer succeeds.
    When The action is dispatched.
    Then The reducer ran once, the action completed OK, attempts is 0, and the count is 1.

  Scenario: The validations of the action features still run in a server store.
    Given A server store, and a client store.
    And An action that combines polling with retry, one with a negative debounce, and one that combines debounce with retry.
    When Each action is dispatched in both stores.
    Then Each dispatch throws a StoreException, in the server store as in the client store.
    And The state does not change.

  Scenario: A page streamed on the server with an action that polls by default shows the data, and no tick runs after.
    Given A server store, and the action class whose poll field defaults to Poll.start.
    When The server code dispatches the action, streams the page with renderToPipeableStream, and 3 polling intervals pass.
    Then The HTML has the loaded count.
    And The count is still 1 after the intervals: no polling tick ran.
