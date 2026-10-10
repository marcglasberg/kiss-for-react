Feature: IgnoreOld

  Scenario: The result of an older action is ignored when a newer action is dispatched.
    Given An action with ignoreOld.
    When The action is dispatched with "A", and then with "B".
    And The request for "B" finishes first, and then the request for "A".
    Then The state has "B", since the result of "A" is ignored.
    And The action "A" is aborted silently: dispatchAndWait resolves, and its status says it was aborted.

  Scenario: Without ignoreOld, the result of an older action overwrites the newer one.
    Given An action WITHOUT ignoreOld.
    When The action is dispatched with "A", and then with "B".
    And The request for "B" finishes first, and then the request for "A".
    Then The state has "A", which is old information.

  Scenario: The result of an older action is ignored even if it arrives before the newer one.
    Given An action with ignoreOld.
    When The action is dispatched with "A", and then with "B".
    And The request for "A" finishes first, and then the request for "B".
    Then The state is not changed by "A", while "B" is loading.
    And The state has "B" at the end.

  Scenario: Only the newest action changes the state.
    Given An action with ignoreOld.
    When The action is dispatched with "A", "B" and "C", in this order.
    And The requests finish in the order "B", "C", "A".
    Then Only the result of "C" is applied.

  Scenario: An old action is aborted even if its reducer returns null.
    Given An action with ignoreOld, whose reducer returns null.
    When The action is dispatched with "A", and then the same action is dispatched again.
    And The reducer of "A" returns null.
    Then The action "A" is aborted silently.

  Scenario: A newer action makes the older ones old, even if it does not change the state.
    Given An action with ignoreOld.
    When The action is dispatched with "A", and then again, but this time its reducer returns null.
    And The second action finishes first, and then the request for "A".
    Then The state is not changed, since the result of "A" is ignored.

  Scenario: If the newer action fails, the older results are still ignored.
    Given An action with ignoreOld.
    When The action is dispatched with "A", and then with "B".
    And The request for "B" fails, and then the request for "A" finishes.
    Then The state is not changed.
    And The error of "B" is processed as usual, and "B" is not old.

  Scenario: The result of a SYNC reducer is ignored when the action becomes old during an ASYNC before.
    Given An action with ignoreOld, with an ASYNC before, and a SYNC reducer.
    When The action is dispatched with "A", and then with "B".
    And The before of "B" finishes first, and then the before of "A".
    Then The state has "B", since the result of "A" is ignored.

  Scenario: A SYNC action with ignoreOld is still SYNC.
    Given An action with ignoreOld, with a SYNC reducer.
    When The action is dispatched with dispatchSync, twice.
    Then Each one changes the state right away.

  Scenario: The result of an old action is ignored even when it goes through a custom wrapReduce.
    Given An action with ignoreOld, and a custom wrapReduce that changes the result of the reducer.
    When The action is dispatched with "A", and then with "B".
    And The request for "B" finishes first, and then the request for "A".
    Then The state has the result of "B", changed by the wrapReduce.

  Scenario: An action becomes old as soon as a newer action is dispatched.
    Given An action with ignoreOld, dispatched with "A", which is still running.
    When The action is dispatched with "B".
    Then "A" is old right away, and "B" is not.
    And Both can check it with isOld, after their requests finish.

  Scenario: isOld keeps the value it had when the action finished.
    Given An action with ignoreOld, dispatched with "A", "B" and "C".
    And "B" finished before "C" was dispatched, while "A" was still running.
    Then "B" is not old, even after "C" is dispatched, and its abortSignal is not aborted.
    And "A" is still old after it finishes, even after the keys are cleared.

  Scenario: isOld is always false for an action without ignoreOld.
    Given An action WITHOUT ignoreOld, dispatched with "A", which is still running.
    When The action is dispatched with "B".
    Then "A" is not old.

  Scenario Outline: Only the state returned by the reducer of an old action is ignored. Its other effects still happen.
    Given An action with ignoreOld, whose reducer dispatches another action after its request finishes.
    And The reducer {Checks isOld} before dispatching it.
    When The action is dispatched with "A", and then with "B".
    And The request for "B" finishes first, and then the request for "A".
    Then The other action is dispatched {Dispatched}.
    Examples: 
      | Checks isOld         | Dispatched        |
      | checks isOld         | only by "B"       |
      | does not check isOld | by "B" and by "A" |

  Scenario: The abortSignal of an action is aborted when it becomes old, which cancels its request.
    Given An action with ignoreOld, that passes its abortSignal to its request.
    When The action is dispatched with "A", and then with "B", before the request for "A" finishes.
    Then The request for "A" is cancelled right away, and its signal is aborted with an AbortError.
    And The action "A" is aborted silently, even though its request threw an AbortError.
    And The state has "B" at the end, and the signal of "B" is not aborted.

  Scenario: An old action can check its abortSignal between steps that do not accept a signal.
    Given An action with ignoreOld, that loads in two steps, and calls abortSignal.throwIfAborted() between them.
    And It only reads its abortSignal after the first step.
    When The action is dispatched with "A", and then with "B", during the first step of "A".
    Then The second step of "A" does not run, and "A" is aborted silently.

  Scenario: The abortSignal of an action without ignoreOld is never aborted.
    Given An action WITHOUT ignoreOld, that passes its abortSignal to its request.
    When The action is dispatched with "A", and then with "B", before the request for "A" finishes.
    Then The request for "A" is not cancelled.

  Scenario: The abortSignal is always the same, and is not aborted before the action is dispatched.
    Given An action that was not dispatched yet.
    When Its abortSignal is read twice.
    Then It is the same signal, and it is not aborted.

  Scenario Outline: The errors of an old action are ignored.
    Given An action with ignoreOld, that throws a {Error} when its request finishes.
    And It has a wrapError, an after method, and the store has an errorObserver.
    When The action is dispatched with "A", and then with "B".
    And The request for "A" finishes, and the action throws the error.
    Then The error is ignored: no error dialog, it does not count as failed, and dispatchAndWait resolves.
    And Neither the wrapError nor the errorObserver are called, but the after method runs.
    Examples: 
      | Error         |
      | UserException |
      | Error         |

  Scenario: The error thrown by the before method of an old action is ignored.
    Given An action with ignoreOld, whose ASYNC before method throws an error.
    When The action is dispatched with "A", and then with "B".
    And The before of "A" throws the error.
    Then The error is ignored, and "A" is aborted silently.

  Scenario: The error of an old action that nobody waits for does not become an unhandled rejection.
    Given An action with ignoreOld, that throws an error when its request finishes.
    When The action is dispatched with "A" (without waiting for it), and then with "B".
    And The request for "A" finishes, and the action throws the error.
    Then There is no unhandled rejection.

  Scenario: A StoreException thrown by an old action is not ignored, since it points to a bug.
    Given An action with ignoreOld, that throws a StoreException when its request finishes.
    When The action is dispatched with "A", and then with "B".
    And The request for "A" finishes, and the action throws the StoreException.
    Then dispatchAndWait of "A" rejects with the StoreException.

  Scenario: Actions with different keys do not affect each other.
    Given An action with ignoreOld, that uses ignoreOldKeyParams to have a key per item id.
    And It puts each loaded item into a cache.
    When The action is dispatched for item "1", and then for item "2".
    And The request for item "2" finishes first.
    Then Both items are put into the cache.
    And But two actions for the same item do affect each other.

  Scenario Outline: The params of the key are compared by their contents.
    Given An action with ignoreOld, whose ignoreOldKeyParams returns a new {Params} each time.
    When The action is dispatched with params {First}, and then with params {Second}.
    Then The first action {Result}.
    Examples: 
      | Params | First     | Second    | Result              |
      | array  | [1, "A"]  | [1, "A"]  | becomes old         |
      | array  | [1, "A"]  | [1, "B"]  | does not become old |
      | object | { id: 1 } | { id: 1 } | becomes old         |
      | object | { id: 1 } | { id: 2 } | does not become old |

  Scenario: By default, actions of different classes do not affect each other.
    Given An action class with ignoreOld, and a subclass of it, that change the same part of the state.
    When The class is dispatched with "A", and then the subclass with "B".
    And The request for "B" finishes first, and then the request for "A".
    Then The state has "A", since they have different keys.

  Scenario: Actions of different classes affect each other when computeIgnoreOldKey returns the same key.
    Given Two different action classes with ignoreOld, that override computeIgnoreOldKey to return the same key.
    When The first class is dispatched with "A", and then the second class with "B".
    And The request for "B" finishes first, and then the request for "A".
    Then The state has "B", since the result of "A" is ignored.

  Scenario Outline: A dispatch that is aborted before it runs does not make the running action old.
    Given An action with ignoreOld and {Feature}, dispatched with "A", which is still running.
    When The action is dispatched with "B", which is aborted by {Feature}.
    Then "A" is not old, and its abortSignal is not aborted.
    And The state has "A" at the end.
    Examples: 
      | Feature       |
      | throttle      |
      | fresh         |
      | abortDispatch |

  Scenario: A newer action aborted by checkInternet still makes the older actions old.
    Given An action with ignoreOld and checkInternet set to abort, dispatched with "A", which is still running.
    When There is no internet, and the action is dispatched with "B".
    Then "B" is aborted, since there is no internet.
    And "A" is old, since "B" was dispatched, so the state is not changed.

  Scenario Outline: Polling: only the dispatches that run the reducer make the running action old.
    Given An action with polling and ignoreOld, dispatched with "A" and Poll.once, which is still running.
    And Polling is {Polling}.
    When The action is dispatched with {Poll}.
    Then "A" {Result}.
    Examples: 
      | Polling    | Poll                  | Result     |
      | active     | Poll.stop             | is not old |
      | active     | Poll.start            | is not old |
      | not active | Poll.start            | is old     |
      | active     | Poll.runNowAndRestart | is old     |
      | active     | Poll.once             | is old     |

  Scenario: ignoreOld cancels an older debounced action whose request already started.
    Given An action with debounce and ignoreOld, that passes its abortSignal to its request.
    When The action is dispatched with "A", and its request starts after the debounce period.
    And Then it is dispatched with "B".
    Then The request for "A" is cancelled.
    And The state has "B" at the end.

  Scenario: A debounced action replaced during its wait time is old, and is aborted without running its reducer.
    Given An action with debounce and ignoreOld.
    When The action is dispatched with "A", and then with "B" during the wait time.
    Then "A" is old, and finishes aborted, without running its reducer.
    And "B" runs its reducer, and changes the state.

  Scenario: An action that becomes old while waiting to retry stops retrying right away.
    Given An action with ignoreOld and retry, with a long retry delay.
    When The action is dispatched with "A", and its request fails, so it waits to retry.
    And Then it is dispatched with "B".
    Then The action "A" stops waiting, and is aborted silently, without retrying.
    And The state has "B" at the end.

  Scenario: An action that becomes old during an attempt is not retried when the attempt fails.
    Given An action with ignoreOld and retry.
    When The action is dispatched with "A", and then with "B", while the first attempt of "A" is running.
    And The first attempt of "A" fails.
    Then "A" is not retried, and is aborted silently.

  Scenario: An action with ignoreOld and retry that does not become old retries as usual.
    Given An action with ignoreOld and retry, whose first attempt fails.
    When The action is dispatched.
    Then It retries, and its second attempt changes the state.

  Scenario Outline: ignoreOld can be combined with some features.
    Given An action with ignoreOld, and also with {Feature}.
    When The action is dispatched.
    Then The action runs and changes the state.
    Examples: 
      | Feature       |
      | throttle      |
      | fresh         |
      | retry         |
      | checkInternet |
      | debounce      |
      | poll          |

  Scenario Outline: ignoreOld can not be combined with features that never let actions overlap.
    Given An action with ignoreOld, and also with {Feature}.
    When The action is dispatched.
    Then The dispatch throws a StoreException, that mentions ignoreOld.
    Examples: 
      | Feature                     |
      | nonReentrant                |
      | sequential                  |
      | unlimitedRetryCheckInternet |

  Scenario: A subclass can turn ignoreOld off, and then use the features it can not be combined with.
    Given An action with ignoreOld, and a subclass that turns it off, and uses nonReentrant.
    When The subclass is dispatched.
    Then The dispatch does not throw, and the action runs.

  Scenario Outline: ignoreOld can not be used in the optimistic actions.
    Given An {Action} with ignoreOld.
    When The action is dispatched.
    Then The dispatch throws a StoreException, and the state is not changed.
    Examples: 
      | Action                 |
      | OptimisticCommand      |
      | OptimisticSync         |
      | OptimisticSyncWithPush |
      | ServerPush             |

  Scenario: After clearing the internal action props, newer actions do not make older ones old.
    Given An action with ignoreOld, dispatched with "A", which is still running.
    When The store clears the internal action props.
    And The action is dispatched with "B", and then with "C".
    Then "C" makes "B" old, but not "A".
    And The state has "A" at the end, since "A" finished last, and was not old.

  Scenario Outline: The store forgets the keys when their actions finish, in any way.
    Given An action with ignoreOld.
    When The action is dispatched a few times, and they finish {How}.
    Then The store does not keep any information for its key.
    Examples: 
      | How          |
      | successfully |
      | with errors  |

  Scenario: The ignoreOld property is not shown in the description of the action.
    Given An action with ignoreOld, and a field.
    When The action is printed with toString.
    Then It shows the field, but not ignoreOld.
