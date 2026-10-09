Feature: Lint: avoid-abort-dispatch and avoid-wrap-reduce

  Scenario Outline: Overriding abortDispatch or wrapReduce in an action is reported, by the rule turned on.
    Given An action that overrides {Method}.
    When The code is linted with the {Rule} rule.
    Then There is a warning in {Method}.
    Examples: 
      | Rule                 | Method        | Type information |
      | avoid-abort-dispatch | abortDispatch | true             |
      | avoid-abort-dispatch | abortDispatch | false            |
      | avoid-wrap-reduce    | wrapReduce    | true             |
      | avoid-wrap-reduce    | wrapReduce    | false            |

  Scenario Outline: Overriding wrapReduce in a base action, or as a property, is reported.
    Given A base action without reduce, that overrides wrapReduce {How}.
    When The code is linted with the avoid-wrap-reduce rule.
    Then There is a warning in wrapReduce.
    Examples: 
      | How                           | Code                                                                |
      | as a method                   | 
  wrapReduce(reduce: () => ReduxReducer<State>) { return reduce; } |
      | as a property with a function | 
  wrapReduce = (reduce: () => ReduxReducer<State>) => reduce;      |

  Scenario Outline: Overrides in tests, and in classes that are not actions, are not reported.
    Given {Case}, that overrides {Method}.
    When The code is linted with the {Rule} rule.
    Then There are no warnings.
    Examples: 
      | Case                          | Rule                 | Method        |
      | An action in a test file      | avoid-abort-dispatch | abortDispatch |
      | An action in a test file      | avoid-wrap-reduce    | wrapReduce    |
      | A class that is not an action | avoid-abort-dispatch | abortDispatch |
      | A class that is not an action | avoid-wrap-reduce    | wrapReduce    |

  Scenario: Actions that don't override abortDispatch or wrapReduce are not reported.
    Given An action that only overrides reduce, before and after.
    When The code is linted with both rules.
    Then There are no warnings.
