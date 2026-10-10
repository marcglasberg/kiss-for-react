Feature: Sequential

  Scenario: Sequential actions run one at a time, in the order they were dispatched.
    Given An ASYNC sequential action.
    When The action is dispatched 3 times in quick succession.
    Then Each action only starts after the previous one finished.
    And All the actions run, in the dispatch order.

  Scenario: Sequential actions of different classes share the same queue by default.
    Given Two different ASYNC sequential action classes.
    When Actions of both classes are dispatched in quick succession.
    Then They run one at a time, in the dispatch order.

  Scenario: Sequential actions with different keys run in parallel.
    Given An ASYNC sequential action, with a queue per user.
    When Actions for users "A", "B" and "A" are dispatched in quick succession.
    Then The actions of user "A" run one at a time.
    And The action of user "B" runs in parallel with the first action of user "A".

  Scenario: Keys that are arrays or plain objects are compared by their contents.
    Given An ASYNC sequential action, whose key is an array with the user.
    When Two actions for the same user are dispatched in quick succession.
    Then They run one at a time.

  Scenario: Sequential actions are always ASYNC, even when their reducer is SYNC.
    Given A sequential action with a SYNC reducer.
    When The action is dispatched.
    Then The state does not change right away.
    And The state changes after the action finishes.

  Scenario: A sequential action cannot be dispatched with dispatchSync.
    Given A sequential action with a SYNC reducer.
    When The action is dispatched with dispatchSync.
    Then It throws a StoreException.
    And The queue is not blocked by it.

  Scenario: A sequential action cannot be combined with debounce.
    Given A sequential action that also uses debounce.
    When The action is dispatched.
    Then It throws a StoreException.

  Scenario: The before method of a sequential action only runs when it gets its turn.
    Given Two ASYNC sequential actions, which log when their before, reduce and after methods run.
    When Both actions are dispatched in quick succession.
    Then The before, reduce and after methods of the second action run after the first action finished.

  Scenario: The next sequential action runs even if the previous one failed.
    Given An ASYNC sequential action that fails, with the default discardQueueOnError.
    When It is dispatched, followed by another sequential action.
    Then The second action runs after the first one fails.

  Scenario: A failed sequential action can discard the actions waiting behind it.
    Given An ASYNC sequential action that fails, and whose discardQueueOnError returns true.
    And Two other sequential actions waiting behind it.
    When The first action fails.
    Then The waiting actions are discarded, without running before or reduce.
    And Their after method runs.
    And They finish silently, with an AbortDispatchException, and their dispatch is aborted.
    And They know they were discarded.

  Scenario: Actions dispatched after a failure that discarded the queue are not affected.
    Given An ASYNC sequential action that fails, and whose discardQueueOnError returns true.
    When The action fails.
    And Another sequential action is dispatched afterwards.
    Then The new action runs normally.

  Scenario: Discarding the queue only affects the queue with the same key.
    Given Sequential actions with a queue per user.
    And An action of user "A" that fails and discards its queue.
    When Other actions of users "A" and "B" are waiting.
    Then Only the waiting action of user "A" is discarded.

  Scenario: discardQueueOnError receives the original error.
    Given An ASYNC sequential action that fails with a UserException.
    And Its discardQueueOnError only discards the queue for errors that are not UserExceptions.
    When The action fails, while another sequential action is waiting.
    Then discardQueueOnError gets the UserException.
    And The waiting action runs.

  Scenario: If discardQueueOnError throws, the queue continues.
    Given An ASYNC sequential action that fails, and whose discardQueueOnError throws an error.
    When The action fails, while another sequential action is waiting.
    Then The waiting action runs.

  Scenario: Sequential actions waiting in the queue count as in progress.
    Given Two ASYNC sequential actions.
    When Both are dispatched in quick succession.
    Then While the second action waits for its turn, it is waiting in the queue, and in progress.
    And When it gets its turn, it is no longer waiting in the queue, but still in progress.
    And After it finishes, it is no longer in progress.

  Scenario: An aborted dispatch does not enter the queue.
    Given An ASYNC sequential action whose abortDispatch returns true.
    When It is dispatched, followed by another sequential action.
    Then The aborted action does not block the queue.

  Scenario: A sequential and non-reentrant action drops duplicates while queued or running.
    Given An ASYNC action that is both sequential and non-reentrant.
    And Another sequential action that is running.
    When The non-reentrant action is dispatched twice, while the first one waits in the queue.
    Then The second dispatch is aborted.
    And The first one runs after the running action.

  Scenario: A sequential action that retries holds the queue while retrying.
    Given An ASYNC sequential action with retry, that fails the first time.
    When It is dispatched, followed by another sequential action.
    Then The second action only runs after the retry succeeds.

  Scenario: A fresh action discarded from the queue does not keep its key fresh.
    Given An ASYNC sequential action with fresh.
    And It waits in the queue behind an action that fails and discards the queue.
    When It is discarded.
    Then Dispatching it again runs it, since its data was never loaded.

  Scenario: A sequential action that aborts releases the queue.
    Given An ASYNC sequential action that throws an AbortDispatchException.
    And Its discardQueueOnError discards the queue, except for an AbortDispatchException.
    When It is dispatched, followed by another sequential action.
    Then discardQueueOnError gets the AbortDispatchException.
    And The second action runs normally.
