Feature: Core features keep working with mounted components

  Scenario: A component that only dispatches does not subscribe to the store, and gets stable functions.
    Given A mounted component that uses useDispatch and useStore, but no state or status hook.
    When The state changes, an action runs and fails, and its error is cleared.
    Then The component never renders again, and has no subscription to the state, the status or the readiness.
    And The functions it got are the same on every render.

  Scenario: The dispatch and wait methods of useStore work when destructured, with a mounted consumer.
    Given A mounted consumer of the count, and a component that destructures the methods of useStore.
    When It uses dispatch, dispatchSync, dispatchAll, dispatchAndWait, dispatchAndWaitAll, dispatchWhen and waitCondition.
    Then Each one changes the state as expected, the promises resolve with the right values, and the consumer shows the final count.

  Scenario: A state change seen by a component also triggers dispatchWhen and the state waiters, in order, with persistence.
    Given A ready store with a persistor, a mounted consumer, a dispatchWhen waiting for count 1, and a waitCondition for count 1.
    When An action sets the count to 1.
    Then The dispatchWhen action runs right after, so the consumer shows the result of both.
    And The persistor saw the state with count 1 before the state changed by the dispatchWhen action, and the waiter was released with the triggering action.

  Scenario: When an observer dispatches another action during a state change, the newest state wins everywhere.
    Given A store whose state observer dispatches SetText once, when the count becomes 1, and a mounted consumer of the whole state.
    When An action increments the count.
    Then The observer saw the increment first, and then the SetText.
    And The store and the consumer end with the newest state: count 1 and the text.

  Scenario Outline: Actions with retry, debounce, throttle, fresh, nonReentrant, sequential and ignoreOld keep their rules, and the UI follows the accepted updates.
    Given A mounted consumer of the count and the waiting status of the action type with [Feature].
    When [When].
    Then [Then].
    Examples: 
      | Feature      | When                                                                | Then                                                                                    |
      | retry        | The action fails once and then succeeds                             | The spinner stays on through the retry, and the count is 1                              |
      | debounce     | The action is dispatched 3 times quickly                            | Only the last one runs, and the consumer commits the count once                         |
      | throttle     | The action is dispatched 3 times quickly                            | Only the first one runs, and the consumer commits the count once                        |
      | fresh        | The action is dispatched 3 times quickly                            | Only the first one runs, and the consumer commits the count once                        |
      | nonReentrant | The action is dispatched again while running                        | The second one is aborted, and the spinner stays on until the first finishes            |
      | sequential   | Two actions are dispatched, and then finish one at a time           | The second only runs after the first, and the consumer commits 1 (still waiting) then 2 |
      | ignoreOld    | Two actions are dispatched, and the first finishes after the second | The result of the first is ignored, and the consumer shows the result of the second     |

  Scenario: Polling runs the action repeatedly, and mounted consumers follow each accepted update.
    Given A mounted consumer of the count, and an action that polls every 10 milliseconds.
    When Polling starts, runs a few times, and is stopped.
    Then The consumer shows the count growing, and stops growing after the polling stops.

  Scenario Outline: An optimistic command updates the UI right away, and keeps or rolls back the value when the server answers.
    Given A mounted component showing the text, whether SaveText is waiting, and whether it failed, plus a consumer of the count.
    When A SaveText command is dispatched, and the server [Outcome].
    Then The text changes right away, with the spinner on; then [Then].
    And The count consumer never renders again.
    Examples: 
      | Outcome  | Then                                                                                                      |
      | succeeds | the new text stays, and the spinner goes off                                                              |
      | fails    | the text rolls back while the command finishes, then the spinner goes off and the command shows as failed |

  Scenario: An optimistic sync applies each toggle right away, and the UI follows the value the server confirms.
    Given A mounted component showing whether the item is liked, and whether ToggleLike is waiting.
    When ToggleLike is dispatched twice quickly, and the server confirms the final value.
    Then The UI shows liked, then not liked, right away; then the spinner goes off with the confirmed value.

  Scenario: Shutting down the store while an action runs lets it finish, and the UI shows its result; later dispatches are ignored.
    Given A mounted consumer of the count and the waiting status, and a Load action in progress.
    When The store is shut down, the action finishes, and another action is dispatched.
    Then The consumer shows the result of the first action and no spinner.
    And The later dispatch does nothing, and the subscriptions are unchanged.

  Scenario: The hooks keep their types: selections are inferred, and useObject rejects values it cannot compare.
    Given Components using the hooks with inferred and explicit types, readonly values, and invalid useObject selectors.
    When They compile.
    Then The valid uses have the expected types, and the invalid ones are compile errors.
