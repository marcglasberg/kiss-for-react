Feature: Lint: expect-without-waiting

  Scenario Outline: Checking the state right after dispatching an async action is reported in tests.
    Given A test that dispatches an async action with store.dispatch.
    When Right after, it checks store.state with expect, without waiting.
    Then There is a warning on the dispatch.
    And The automatic fix uses "await store.dispatchAndWait", and makes the test function async.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: The fix keeps an async function as it is.
    Given An async test that dispatches an async action kept in a const.
    When Right after, it checks store.state with expect, without waiting.
    Then There is a warning.
    And The automatic fix only changes the dispatch.

  Scenario Outline: Waiting, or a sync action, is fine.
    Given A test that {Given}.
    When Then it checks store.state with expect.
    Then There are no warnings.
    Examples: 
      | Given                                                                                         | Code                                                                                                                                                                                                 |
      | awaits dispatchAndWait of an async action                                                     | 
  await store.dispatchAndWait(new LoadUser());
  expect(store.state.user).toBe('Mary');                                                                                                             |
      | dispatches an async action, and awaits waitCondition before the expect                        | 
  store.dispatch(new LoadUser());
  await store.waitCondition((state) => state.user !== '', { timeoutMillis: 1000 });
  expect(store.state.user).toBe('Mary');                                      |
      | dispatches a sync action                                                                      | 
  store.dispatch(new SetUser('Mary'));
  expect(store.state.user).toBe('Mary');                                                                                                                     |
      | dispatches an async action, checks the state while it runs, and checks it again after waiting | 
  store.dispatch(new LoadUser());
  expect(store.state.user).toBe('');
  await store.waitCondition((state) => state.user !== '', { timeoutMillis: 1000 });
  expect(store.state.user).toBe('Mary'); |
      | dispatches an async action, and has an expect that doesn't read the state                     | 
  store.dispatch(new LoadUser());
  expect(store.dispatchCount).toBe(1);                                                                                                                            |

  Scenario: Code that is not a test is not reported.
    Given Code that dispatches an async action, and checks store.state with expect, without waiting.
    When The code is not in a test file.
    Then There are no warnings.

  Scenario: There is no automatic fix when the function can't be made async.
    Given A helper function, with a void return type, that dispatches an async action and checks store.state right after.
    When The code is linted.
    Then There is a warning, but no automatic fix.

  Scenario: With type information, async actions from other files are reported.
    Given An async action declared in another file.
    When A test dispatches it, and checks store.state right after, without waiting.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since the action is not known to be async.
