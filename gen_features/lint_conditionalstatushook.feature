Feature: Lint: conditional-status-hook

  Scenario Outline: Two status hooks joined by an operator that means "any of them" are an error, fixed with an array.
    Given A component with {Code}.
    When The code is linted.
    Then There is an error in the expression, saying the second hook is not called in every render.
    And The fix replaces it with {Fixed}, which gives the same result.
    And The fixed code compiles.
    Examples: 
      | Code                                                    | Fixed                                  | Type information |
      | useIsWaiting(LoadUser) || useIsWaiting(LoadPosts)       | useIsWaiting([LoadUser, LoadPosts])    | true             |
      | useIsWaiting(LoadUser) || useIsWaiting(LoadPosts)       | useIsWaiting([LoadUser, LoadPosts])    | false            |
      | useIsFailed(LoadUser) || useIsFailed(LoadPosts)         | useIsFailed([LoadUser, LoadPosts])     | true             |
      | useIsFailed(LoadUser) || useIsFailed(LoadPosts)         | useIsFailed([LoadUser, LoadPosts])     | false            |
      | useExceptionFor(LoadUser) ?? useExceptionFor(LoadPosts) | useExceptionFor([LoadUser, LoadPosts]) | true             |
      | useExceptionFor(LoadUser) ?? useExceptionFor(LoadPosts) | useExceptionFor([LoadUser, LoadPosts]) | false            |
      | useExceptionFor(LoadUser) || useExceptionFor(LoadPosts) | useExceptionFor([LoadUser, LoadPosts]) | true             |

  Scenario Outline: The fix puts all the action types in one array, in the same order.
    Given A component with {Code}.
    When The code is linted and fixed.
    Then There is one error, and the fix replaces the expression with {Fixed}.
    And The fixed code compiles.
    Examples: 
      | Code                                                                                    | Fixed                                                  |
      | useIsWaiting(LoadUser) || useIsWaiting(LoadPosts) || useIsWaiting(LoadComments)         | useIsWaiting([LoadUser, LoadPosts, LoadComments])      |
      | useIsWaiting([LoadUser, LoadPosts]) || useIsWaiting(LoadComments)                       | useIsWaiting([LoadUser, LoadPosts, LoadComments])      |
      | useIsWaiting(LoadUser) || (useIsWaiting(LoadPosts) || useIsWaiting(LoadComments))       | useIsWaiting([LoadUser, LoadPosts, LoadComments])      |
      | useIsWaiting(LoadUser, { statusKey: id }) || useIsWaiting(LoadPosts, { statusKey: id }) | useIsWaiting([LoadUser, LoadPosts], { statusKey: id }) |

  Scenario Outline: An array in a variable is spread into the new array, only when its type is known.
    Given A component with useIsWaiting(types) || useIsWaiting(LoadComments), where types is an array of action types.
    When The code is linted.
    Then With type information, the fix spreads the variable: useIsWaiting([...types, LoadComments]).
    And Without type information, there is an error, but no fix, since types may not be an array.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A status hook called conditionally is an error, with no fix, when an array does not give the same result.
    Given A component with {Code}.
    When The code is linted.
    Then There is an error in {Reported}, saying to call each hook in its own line.
    And There is no fix.
    Examples: 
      | Code                                                                 | Reported        |
      | useIsWaiting(LoadUser) && useIsWaiting(LoadPosts)                    | useIsWaiting    |
      | useIsWaiting(LoadUser) ?? useIsWaiting(LoadPosts)                    | useIsWaiting    |
      | useIsWaiting(LoadUser) || useIsFailed(LoadUser)                      | useIsFailed     |
      | useIsWaiting(LoadUser, { statusKey: id }) || useIsWaiting(LoadPosts) | useIsWaiting    |
      | isReady && useIsWaiting(LoadUser)                                    | useIsWaiting    |
      | isReady ? useIsWaiting(LoadUser) : false                             | useIsWaiting    |
      | isReady ? null : useExceptionFor(LoadUser)                           | useExceptionFor |

  Scenario: There is no fix when the expression has comments.
    Given A component with useIsWaiting(LoadUser) || /* posts */ useIsWaiting(LoadPosts).
    When The code is linted.
    Then There is an error, but no fix, since the fix would delete the comment.

  Scenario: Status hooks imported as a namespace are reported and fixed too.
    Given A component with kiss.useIsWaiting(LoadUser) || kiss.useIsWaiting(LoadPosts), where kiss is the Kiss namespace.
    When The code is linted and fixed.
    Then The fix replaces it with kiss.useIsWaiting([LoadUser, LoadPosts]).

  Scenario Outline: Status hooks called in every render are not reported.
    Given A component where {Case}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Case                                                              | Code                                                                                       |
      | each hook is called in its own line, and the results are combined | const a = useIsWaiting(LoadUser); const b = useIsWaiting(LoadPosts); const value = a || b; |
      | the hook is only on the left of the operator                      | const value = useIsWaiting(LoadUser) || isReady;                                           |
      | the hook gets an array                                            | const value = useIsWaiting([LoadUser, LoadPosts]);                                         |
      | the store methods are joined, which are not hooks                 | const value = store.isWaiting(LoadUser) || store.isWaiting(LoadPosts);                     |
      | the hook is the condition of a ternary                            | const value = useIsWaiting(LoadUser) ? 1 : 2;                                              |

  Scenario: A useIsWaiting that does not come from Kiss is not reported.
    Given A component that joins two calls of a useIsWaiting from another library.
    When The code is linted.
    Then There are no errors.
