Feature: Lint: dispatch-and-wait-unlimited-retries

  Scenario Outline: dispatchAndWait of an action that retries forever is a warning.
    Given An action with {Retry}.
    When It is dispatched with store.dispatchAndWait.
    Then There is a warning in the action, saying it retries forever.
    Examples: 
      | Retry                                        | Action        | Option                 | Type information |
      | retry = { maxRetries: -1 }                   | LoadForever   | maxRetries: -1         | true             |
      | retry = { maxRetries: -1 }                   | LoadForever   | maxRetries: -1         | false            |
      | retry = { unlimitedRetries: true }           | LoadUnlimited | unlimitedRetries: true | true             |
      | retry = { unlimitedRetries: true }           | LoadUnlimited | unlimitedRetries: true | false            |
      | retry = { maxRetries: -1 } in its superclass | LoadInherited | maxRetries: -1         | true             |
      | retry = { maxRetries: -1 } in its superclass | LoadInherited | maxRetries: -1         | false            |

  Scenario Outline: The hooks, dispatchAndWaitAll, and actions in variables are checked too.
    Given An action that retries forever.
    When It is dispatched {How}.
    Then There is a warning.
    Examples: 
      | How                                          | Code                                                                                                                                                            |
      | with the function from useDispatchAndWait    | 
export function Button() {
  const dispatchAndWait = useDispatchAndWait();
  return () => dispatchAndWait(new LoadForever());
}                                |
      | with the function from useDispatchAndWaitAll | 
export function Button() {
  const dispatchAndWaitAll = useDispatchAndWaitAll();
  return () => dispatchAndWaitAll([new LoadFewTimes(), new LoadForever()]);
} |
      | with store.dispatchAndWaitAll                | 
export const promise = store.dispatchAndWaitAll([new LoadForever(), new LoadFewTimes()]);                                                                      |
      | from a const variable                        | 
const action = new LoadForever();
export const promise = store.dispatchAndWait(action);                                                                        |

  Scenario Outline: Actions that don't retry forever, or dispatch without waiting, are fine.
    Given {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                                       | Code                                        |
      | An action with limited retries, with dispatchAndWait                       | store.dispatchAndWait(new LoadFewTimes());  |
      | An action that turns off the retry of its superclass, with dispatchAndWait | store.dispatchAndWait(new LoadTurnedOff()); |
      | An action that retries forever, with dispatch                              | store.dispatch(new LoadForever());          |

  Scenario: With type information, the action's type is enough.
    Given A function that gets an action typed as an action class that retries forever.
    When It dispatches it with dispatchAndWait.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since the action's class is unknown.

  Scenario: dispatchAndWait of an action that retries forever is not reported in tests.
    Given A test file that dispatches an action that retries forever with dispatchAndWait.
    When The code is linted.
    Then There are no warnings.
