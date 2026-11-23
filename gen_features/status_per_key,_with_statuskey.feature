Feature: Status per key, with statusKey

  Scenario: `isWaiting` with a statusKey only sees the actions with that key.
    Given Two LoadUser actions running, for users "a" and "b".
    When We ask `isWaiting` with and without a statusKey.
    Then Without a key, it is true. With "a" or "b", it is true. With "c", it is false.
    And When "a" finishes, `isWaiting` with "a" is false, but with "b" and without a key is still true.

  Scenario: `isWaiting` with a statusKey is false for an action that has no statusKey.
    Given An action class that does not override `statusKey`, running.
    When We ask `isWaiting` with some statusKey.
    Then It is false, while `isWaiting` without a key is true.

  Scenario: `isFailed` and `exceptionFor` with a statusKey only see the failures with that key.
    Given LoadUser failed for users "a" and "b", with different UserExceptions.
    When We ask `isFailed` and `exceptionFor` with and without a statusKey.
    Then Without a key, `isFailed` is true, and `exceptionFor` is the most recent failure ("b").
    And With "a" or "b", `isFailed` is true and `exceptionFor` is the exception of that user.
    And With "c", `isFailed` is false and `exceptionFor` is null.

  Scenario: Dispatching an action again clears only the failure with the same statusKey.
    Given LoadUser failed for users "a" and "b".
    When LoadUser for "a" is dispatched again, and succeeds.
    Then The failure of "a" is cleared, but "b" is still failed.
    And `isFailed` without a key is still true, because of "b".

  Scenario: Failing again with the same statusKey replaces the previous failure.
    Given LoadUser failed for user "a" with one message.
    When LoadUser for "a" fails again with another message.
    Then `exceptionFor` with "a" returns the new message, and there is only one failure for "a".

  Scenario: A failure with a plain Error is failed per key, but has no exception.
    Given LoadUser failed for "a" with a plain Error, then for "b" with a UserException, then for "c" with a plain Error.
    When We ask `isFailed` and `exceptionFor`.
    Then `isFailed` is true for "a", "b" and "c".
    And `exceptionFor` is null for "a" and "c", and the UserException for "b".
    And `exceptionFor` without a key skips the plain errors and returns the UserException of "b".

  Scenario: A statusKey that is an array is compared by its content.
    Given LoadCart, whose statusKey is `[userId, cartId]`, failed for user "a" and cart 1.
    When We ask `isFailed` with a new array with the same content, and with another content.
    Then The same content matches, and the other does not.

  Scenario: An action without a statusKey is failed without a key, and is not seen with a key.
    Given LoadAll, which does not override `statusKey`, failed.
    When We ask `isFailed` without a key, and with some key.
    Then Without a key, it is true. With a key, it is false.

  Scenario: `clearExceptionFor` with a statusKey clears only that failure; without it, all of the type.
    Given LoadUser failed for "a" and "b", and LoadAll failed.
    When We call `clearExceptionFor(LoadUser, { statusKey: "a" })`.
    Then Only "a" is cleared.
    And When we call `clearExceptionFor(LoadUser)` without a key, "b" is cleared too, but LoadAll is still failed.

  Scenario Outline: `clearAllExceptions` clears the failures of all types and keys.
    Given LoadUser failed for "a" and "b", and LoadAll failed.
    When We call `clearAllExceptions()` [How].
    Then Nothing is failed anymore.
    Examples: 
      | How                              |
      | directly                         |
      | through clearInternalActionProps |
      | through setShutDown(true)        |
      | through logOut                   |
      | through dispose                  |

  Scenario: Inside an action, `isWaiting`, `isFailed` and `exceptionFor` accept a statusKey.
    Given LoadUser is running for "a", and failed for "b".
    When Another action checks "a" and "b" with a statusKey, in its reducer.
    Then It sees "a" waiting and not failed, and "b" failed with its message, not waiting.

  Scenario: The status hooks with a statusKey show the status of one user only.
    Given Two mounted rows, for users "a" and "b", using the status hooks with `statusKey`.
    When LoadUser for "a" starts, and then fails with a UserException.
    Then Row "a" shows waiting, and then failed with the message. Row "b" stays idle and ok.
    And When LoadUser for "a" is dispatched again and succeeds, row "a" is idle and ok again.

  Scenario: `useClearExceptionFor` with a statusKey clears the failure of one user only.
    Given Two mounted rows, for users "a" and "b", and LoadUser failed for both.
    When The clear button of row "a" is pressed.
    Then Row "a" is ok, and row "b" is still failed.
    And When `clearAllExceptions()` is called on the store, row "b" is ok too.
