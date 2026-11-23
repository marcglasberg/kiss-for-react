Feature: Waiting, failure and exception status, seen by components

  Scenario: A spinner shows while an async action runs, and the new state is committed together with the end of the waiting.
    Given A mounted component showing the count and whether Load is in progress.
    When A Load action starts, waits, and then finishes with a new state.
    Then The component commits (0, idle), then (0, waiting), then (1, idle), and nothing else.

  Scenario Outline: An async action that ends with no new state still ends the waiting, without rendering state consumers.
    Given A mounted spinner for Load, and a mounted component that shows the whole state.
    When A Load action starts, and then ends by returning [Outcome].
    Then The spinner commits idle, waiting, idle.
    And The state consumer renders only once, since the state object did not change.
    Examples: 
      | Outcome     |
      | null        |
      | same state  |
      | abortReduce |

  Scenario Outline: The waiting covers an async before method as well as an async reduce method.
    Given A mounted spinner for an action type with [Async method].
    When The action starts, and later its async method finishes.
    Then The spinner commits idle, waiting, idle, and the state changed.
    Examples: 
      | Async method    |
      | an async before |
      | an async reduce |

  Scenario Outline: A sync action never commits a spinner, even though it is in progress while its methods run.
    Given A mounted spinner for a sync action type, plus failed and exception components for it.
    When A sync action is dispatched, and ends with [Outcome].
    Then Inside before and reduce, store.isWaiting says the action is in progress.
    And Inside after, it says [Waiting in after]: an action that applied a new state is no longer in progress when after runs.
    And The spinner never commits waiting: it renders only once.
    And The failed component shows [Failed], and the exception component shows an exception: [Exception].
    And A plain Error counts as failed, but has no UserException to show.
    Examples: 
      | Outcome        | Waiting in after | Failed | Exception | Throws |
      | ok             | false            | false  | false     | false  |
      | null           | true             | false  | false     | false  |
      | user exception | true             | true   | true      | false  |
      | error          | true             | true   | false     | true   |

  Scenario: A spinner stays on until both of two concurrent matching actions finish, without extra renders.
    Given A mounted spinner for Load.
    When Two Load actions start, and then finish one at a time.
    Then The spinner commits waiting when the first starts, and idle only when the second finishes.
    And Starting the second action and finishing the first did not render it again.

  Scenario: Waiting follows the class hierarchy of the running action.
    Given Mounted spinners for an abstract base class, the exact class, a subclass, and an unrelated class.
    When An action of the subclass runs and finishes.
    Then The base, exact and subclass spinners show waiting and then idle.
    And The unrelated spinner never renders again.

  Scenario Outline: A UserException without a state change ends the waiting and shows the failure and the exception.
    Given A store, with [Components] mounted for Load.
    When A Load action runs and fails with a UserException.
    Then The spinner shows waiting and then idle; the failed component shows failed; the exception component shows that exact exception.
    And The state did not change.
    Examples: 
      | Components              |
      | the spinner             |
      | the failed component    |
      | the exception component |
      | all of them             |

  Scenario: Retrying a failed action clears the error while it runs, then shows success or the new failure.
    Given A mounted component showing the count, waiting, failed and exception for Load.
    When Load fails, is dispatched again and succeeds, and is dispatched once more and fails again.
    Then The committed history is: idle; waiting; failed with error 1; waiting (error cleared); ok with count 1; waiting; failed with error 2.

  Scenario: Clearing an error updates only the components of that action type.
    Given Load and Other both failed, with mounted failed and exception components for Load, and a failed component for Other.
    When The error of Load is cleared, then the error of a type that has no error is cleared, then the error of Other is cleared.
    Then Clearing Load renders only the Load components, which show no error.
    And Clearing a missing error renders nothing.
    And Clearing Other renders only the Other component.

  Scenario: A second failure with a different exception object updates the exception consumer, but not an unchanged failed boolean.
    Given Two Load actions running at the same time, with mounted failed and exception components for Load.
    When The first fails with exception 1, and then the second fails with exception 2, which has the same message.
    Then The exception component commits exception 1 and then exception 2 (a different object).
    And The failed component commits true once, and does not render for the second failure.

  Scenario: Failure and exception are matched by the exact action type, not by inheritance.
    Given Mounted failed and exception components for Load and for SubLoad.
    When A SubLoad action fails with a UserException.
    Then The SubLoad components show the failure and the exception.
    And The Load components do not, and did not render again.

  Scenario Outline: The status hooks follow the error rules: what wrapError and the errorObserver do with the error decides what is shown.
    Given A store whose errorObserver [Observer], and a mounted component showing waiting, failed and exception for Load.
    When A Load action fails with [Thrown].
    Then The waiting ends; the failed component shows [Failed]; the exception component shows [Error]; dispatchAndWait [Rejects].
    And A plain Error that is kept counts as failed, but there is no UserException to show.
    Examples: 
      | Observer                      | Thrown          | Failed | Error           | Rejects |
      | keeps the error               | a UserException | true   | Failed to load. | false   |
      | keeps the error               | an Error        | true   | -               | true    |
      | swallows the error            | a UserException | false  | -               | false   |
      | turns it into a UserException | an Error        | true   | wrapped         | false   |

  Scenario: A status component mounted while an action runs, or after it failed, shows the right status from its first render.
    Given No status component is mounted when a Load action starts.
    When A spinner mounts while Load runs, and failed and exception components mount after Load failed.
    Then The spinner shows waiting from its first render, and idle when Load finishes.
    And The failed and exception components show the failure from their first render.

  Scenario: A status component that switches to another action type sees the status of the new type.
    Given A mounted component showing the status of Load, switched by a prop to show the status of Other.
    When An Other action starts and then fails.
    Then The component shows Other waiting, then Other failed with its exception.

  Scenario: Status changes of another action type do not render the components of this type.
    Given Mounted spinner, failed and exception components for Load.
    When An Other action starts, fails, and its error is cleared.
    Then None of the Load components renders again.

  Scenario Outline: Aborted and rejected actions leave no spinner on and no failure; a throwing action leaves no spinner on, but is failed.
    Given Mounted spinner, failed and exception components for the action type.
    When The action [Case].
    Then The spinner ends idle, the failed component shows [Failed], and nothing is left pending.
    And The exception component shows nothing, since no UserException was recorded.
    Examples: 
      | Case                                         | Failed |
      | is aborted before dispatch, by abortDispatch | false  |
      | aborts itself with an AbortDispatchException | false  |
      | is async but dispatched with dispatchSync    | false  |
      | throws a plain Error from its reducer        | true   |

  Scenario: Status changes do not render a component that only uses the state.
    Given A mounted component showing the whole state, and a mounted spinner for Load.
    When A Load action starts, fails with a UserException, and its error is cleared.
    Then The spinner updates, but the state component renders only once.

  Scenario: A component reading state and all status hooks commits only valid combinations across success, failure, clear and retry.
    Given A mounted component showing the count, waiting, failed and exception for Load.
    When Load succeeds; then fails; then its error is cleared; then it runs again and succeeds.
    Then Every committed combination is valid, and the full history is as expected.
