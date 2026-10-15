Feature: Lint: the rules that know LoadPages actions

  Scenario: The incompatible-action-features rule reports exactly the features a LoadPages does not allow.
    Given A LoadPages with each feature.
    When The code is linted, and the same action is dispatched.
    Then The lint reports the feature if, and only if, the dispatch throws a StoreException.

  Scenario Outline: A LoadPages with a feature it can't use is an error.
    Given A LoadPages with {Feature}.
    When The code is linted.
    Then There is an error in {Feature}, which says why, with a suggestion to remove it.
    Examples: 
      | Feature      | Type information | Reason                                         |
      | nonReentrant | true             | It already runs one load per list at a time.   |
      | nonReentrant | false            | It already runs one load per list at a time.   |
      | ignoreOld    | true             | It already aborts the older loads of the list. |
      | ignoreOld    | false            | It already aborts the older loads of the list. |

  Scenario: Without type information, a LoadPages declared in another file is known by its methods.
    Given An action that extends a base class of another file, and declares the LoadPages methods.
    And It has ignoreOld.
    When The code is linted without type information.
    Then There is an error in ignoreOld.

  Scenario Outline: Overriding reduce in a LoadPages is an error.
    Given An action that extends LoadPages {Where}, and overrides reduce.
    When The code is linted.
    Then There is an error in reduce.
    Examples: 
      | Where                                 | Type information |
      | directly                              | true             |
      | directly                              | false            |
      | through a base class of the same file | true             |
      | through a base class of the same file | false            |

  Scenario Outline: In a LoadPages, an override that turns off its loading rules is an error.
    Given A LoadPages with {Override}.
    When The code is linted, with or without type information.
    Then There is an error in {Member}, which says: {Message}
    Examples: 
      | Override                                                         | Code                                                      | Member         | Message                                                                                                                       |
      | an abortDispatch that does not call super.abortDispatch()        | abortDispatch() { return this.state.todos === null; }     | abortDispatch  | doesn't call `super.abortDispatch()`                                                                                          |
      | an ignoreFresh getter that does not read super.ignoreFresh       | get ignoreFresh() { return this.force; }
  force = false; | ignoreFresh    | doesn't read `super.ignoreFresh`, so a `'next'` or `'previous'` of this `LoadPages` is aborted while the list is fresh        |
      | an ignoreThrottle getter that does not read super.ignoreThrottle | get ignoreThrottle() { return true; }                     | ignoreThrottle | doesn't read `super.ignoreThrottle`, so a `'next'` or `'previous'` of this `LoadPages` is aborted while the list is throttled |
      | a statusKey getter                                               | get statusKey() { return 'todos'; }                       | statusKey      | Don't override `statusKey` in a `LoadPages`                                                                                   |

  Scenario Outline: In a LoadPages, overrides that keep its loading rules are fine.
    Given A LoadPages with {Override}.
    When The code is linted, with or without type information.
    Then There are no errors.
    Examples: 
      | Override                                                 | Code                                                                           |
      | an abortDispatch that calls super.abortDispatch()        | abortDispatch() { return super.abortDispatch() || this.state.todos === null; } |
      | an ignoreFresh getter that reads super.ignoreFresh       | get ignoreFresh() { return this.force || super.ignoreFresh; }
  force = false; |
      | pagesKeyParams, instead of statusKey                     | pagesKeyParams() { return 'todos'; }                                           |
      | the same overrides, in an action that is not a LoadPages |                                                                                |

  Scenario Outline: A LoadPages with fields, without pagesKeyParams, is a warning.
    Given A subclass of LoadPages with the field postId, that doesn't override pagesKeyParams.
    When The code is linted.
    Then There is a warning in the class name.
    And The suggestion overrides pagesKeyParams, returning the field, and the code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: LoadPages actions that are not reported by missing-key-params.
    Given {Case}.
    When The code is linted, with or without type information.
    Then There is no warning.
    Examples: 
      | Case                                                           | Code                                                                                            |
      | A LoadPages without fields (maxPages and which are not fields) | 
  constructor(which: PagesToLoad = 'refresh') { super(which); }
  maxPages = 5;                |
      | A LoadPages with a field, that overrides pagesKeyParams        | 
  constructor(readonly postId: string) { super(); }
  pagesKeyParams() { return this.postId; } |

  Scenario: A LoadPages with retry is not reported by retry-without-non-reentrant.
    Given A LoadPages with retry, which already runs one load per list at a time, and can't use nonReentrant.
    When The code is linted, with or without type information.
    Then There is no warning.

  Scenario Outline: Calling a LoadPages method from outside the action is reported by lifecycle-method-call.
    Given Code outside the action that calls its {Method} method.
    When The code is linted, with or without type information.
    Then There is an error in {Method}, which says to dispatch the action instead.
    Examples: 
      | Method         | Code                                                      |
      | loadPage       | new LoadTodos().loadPage(0);                              |
      | nextPageParam  | const action = new LoadTodos(); action.nextPageParam([]); |
      | pagesKeyParams | new LoadTodos().pagesKeyParams();                         |

  Scenario: A LoadPages is a concrete action for the naming rules, even without type information.
    Given A LoadPages called LoadTodos, which doesn't declare reduce.
    When The code is linted with action-name-ends-with-action, without type information.
    Then The name is reported, since the action can be dispatched.
