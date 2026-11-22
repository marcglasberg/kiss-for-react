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
      | How                                          | Code                                                                                                                                                                |
      | with the function from useDispatchAndWait    | \nexport function Button() {\n  const dispatchAndWait = useDispatchAndWait();\n  return () => dispatchAndWait(new LoadForever());\n}                                |
      | with the function from useDispatchAndWaitAll | \nexport function Button() {\n  const dispatchAndWaitAll = useDispatchAndWaitAll();\n  return () => dispatchAndWaitAll([new LoadFewTimes(), new LoadForever()]);\n} |
      | with store.dispatchAndWaitAll                | \nexport const promise = store.dispatchAndWaitAll([new LoadForever(), new LoadFewTimes()]);                                                                         |
      | from a const variable                        | \nconst action = new LoadForever();\nexport const promise = store.dispatchAndWait(action);                                                                          |

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

  Scenario Outline: dispatchAndWait of an action with unlimitedRetryCheckInternet is a warning.
    Given An action with unlimitedRetryCheckInternet = {Value} {Where}.
    When It is dispatched with store.dispatchAndWait.
    Then There is a warning in the action, saying it retries forever, even while there is no internet.
    Examples: 
      | Value              | Where             | Type information |
      | true               | in the action     | true             |
      | true               | in the action     | false            |
      | { maxDelay: 1000 } | in the action     | true             |
      | { maxDelay: 1000 } | in the action     | false            |
      | true               | in its superclass | true             |
      | true               | in its superclass | false            |

  Scenario Outline: dispatchAndWait of an action with unlimitedRetryCheckInternet turned off is fine.
    Given An action with unlimitedRetryCheckInternet = false, in a subclass of one that turns it on.
    When It is dispatched with store.dispatchAndWait.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: dispatchAndWaitAll with an array that is not written in the call is checked too.
    Given An action that retries forever.
    When It is dispatched with dispatchAndWaitAll, {How}.
    Then There is a warning, {When}.
    Examples: 
      | How                             | When                             | Code                                                                                                                  |
      | in an array in a const variable | with or without type information | \nconst actions = [new LoadFewTimes(), new LoadForever()];\nexport const promise = store.dispatchAndWaitAll(actions); |
      | in an array parameter           | only with type information       | \nexport function run(actions: LoadForever[]) {\n  return store.dispatchAndWaitAll(actions);\n}                       |
      | in a tuple parameter            | only with type information       | \nexport function run(actions: [LoadFewTimes, LoadForever]) {\n  return store.dispatchAndWaitAll(actions);\n}         |

  Scenario Outline: The function from the hooks is checked whatever its name.
    Given An action that retries forever.
    When It is dispatched with the function from {Hook}, in a variable called {Name}.
    Then There is a warning, with or without type information.
    Examples: 
      | Hook                  | Name    | Code                                                                                                                      |
      | useDispatchAndWait    | wait    | \nexport function Button() {\n  const wait = useDispatchAndWait();\n  return () => wait(new LoadForever());\n}            |
      | useDispatchAndWaitAll | waitAll | \nexport function Button() {\n  const waitAll = useDispatchAndWaitAll();\n  return () => waitAll([new LoadForever()]);\n} |
