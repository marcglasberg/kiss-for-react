Feature: Status of an array of action types

  Scenario: isWaiting with an array is true while an action of any of the types runs.
    Given Two async action types, LoadUser and LoadPosts.
    When LoadUser runs, then LoadPosts also runs, then LoadUser finishes, then LoadPosts finishes.
    Then isWaiting([LoadUser, LoadPosts]) is true while at least one of them runs.
    And It is false before they start, and after both finish.

  Scenario: isWaiting with an array ignores the action types that are not in the array.
    Given An async action of type LoadComments is running.
    When isWaiting is called with the array [LoadUser, LoadPosts].
    Then It is false.

  Scenario: isWaiting with an array also matches the subclasses of the types.
    Given LoadAdminPosts is a subclass of LoadPosts.
    When An action of type LoadAdminPosts is running.
    Then isWaiting([LoadUser, LoadPosts]) is true.
    And isWaiting with an array of abstract types also works: isWaiting([Load]) is true.

  Scenario: The status functions with an empty array say that nothing runs and nothing failed.
    Given An action of type LoadUser is running, and an action of type LoadPosts failed.
    When isWaiting, isFailed and exceptionFor are called with an empty array.
    Then isWaiting and isFailed are false, and exceptionFor is null.
    And clearExceptionFor with an empty array clears nothing.

  Scenario: isFailed with an array is true if any of the types failed.
    Given Two async action types, LoadUser and LoadPosts.
    When LoadUser succeeds, and LoadPosts fails.
    Then isFailed([LoadUser, LoadPosts]) is true.
    And After LoadPosts runs again and succeeds, isFailed([LoadUser, LoadPosts]) is false.

  Scenario: exceptionFor with an array returns the UserException of the first type in the array that has one.
    Given LoadUser and LoadPosts both failed with a UserException.
    When exceptionFor is called with the array [LoadUser, LoadPosts], and with [LoadPosts, LoadUser].
    Then The first call returns the exception of LoadUser.
    And The second call returns the exception of LoadPosts.

  Scenario: exceptionFor with an array skips the types that failed with an error that is not a UserException.
    Given LoadUser failed with a plain Error, and LoadPosts failed with a UserException.
    When exceptionFor is called with the array [LoadUser, LoadPosts].
    Then It returns the UserException of LoadPosts.
    And isFailed([LoadUser]) is still true.
    And When no type in the array has a UserException, it returns null.

  Scenario: clearExceptionFor with an array clears the failures of all the types in the array, and only of them.
    Given LoadUser, LoadPosts and LoadComments failed.
    When clearExceptionFor is called with the array [LoadUser, LoadPosts].
    Then LoadUser and LoadPosts are not failed anymore.
    And LoadComments is still failed.
    And The status listeners are notified only once.

  Scenario: With an array, a statusKey applies to all the types in the array.
    Given LoadUser runs with the key "a", and LoadPosts failed with the key "b".
    When The status functions are called with the array [LoadUser, LoadPosts], and a statusKey.
    Then isWaiting is true only for the key "a".
    And isFailed and exceptionFor find the failure only for the key "b".
    And clearExceptionFor with the key "a" clears nothing, and with the key "b" clears the failure.

  Scenario: Inside an action, the status functions also accept an array of types.
    Given An action of type LoadUser is running, and an action of type LoadPosts failed with a UserException.
    When Another action calls this.isWaiting, this.isFailed, this.exceptionFor and this.clearExceptionFor with the array [LoadUser, LoadPosts].
    Then this.isWaiting and this.isFailed are true.
    And this.exceptionFor returns the exception of LoadPosts.
    And this.clearExceptionFor clears the failure of LoadPosts.

  Scenario: The array can mix action types with different shapes, like sync and async actions.
    Given A sync action type Increment, and an async action type LoadUser.
    And Increment failed with a UserException.
    When The status functions are called with the array [LoadUser, Increment].
    Then The code compiles, and the status functions work.

  Scenario Outline: All the status functions accept one type, an array with one type, or an array with several types.
    Given An action of type LoadUser.
    When The status functions are called with {Argument}.
    Then isWaiting is true while LoadUser runs.
    And abort aborts LoadUser.
    And isFailed is true, and exceptionFor returns its exception, after LoadUser fails.
    And clearExceptionFor clears the failure of LoadUser.
    Examples: 
      | Argument              |
      | LoadUser              |
      | [LoadUser]            |
      | [LoadUser, LoadPosts] |

  Scenario: abort with an array aborts the actions of all the types in the array, and only of them.
    Given Actions of type LoadUser, LoadPosts and LoadComments are running.
    When The store aborts the array [LoadUser, LoadPosts].
    Then The LoadUser and LoadPosts actions are aborted, and finish without changing the state.
    And The LoadComments action is not aborted, and changes the state when it finishes.

  Scenario: abort with an array and a statusKey aborts only the actions with that key.
    Given LoadUser runs with the key "a", and LoadPosts runs with the keys "a" and "b".
    When The store aborts the array [LoadUser, LoadPosts] with the statusKey "a".
    Then Only the actions with the key "a" are aborted.
