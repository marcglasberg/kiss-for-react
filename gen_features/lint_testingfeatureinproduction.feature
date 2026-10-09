Feature: Lint: testing-feature-in-production

  Scenario Outline: Mocks and record of the store are reported outside tests.
    Given A store created in the same file.
    When The app code uses {Feature}.
    Then There is a warning, saying it is meant for tests.
    Examples: 
      | Feature      | Code                                    | Message                     | Type information |
      | store.mocks  | store.mocks.add(Increment, () => null); | `mocks` is meant for tests  | true             |
      | store.mocks  | store.mocks.add(Increment, () => null); | `mocks` is meant for tests  | false            |
      | store.record | store.record.start();                   | `record` is meant for tests | true             |
      | store.record | store.record.start();                   | `record` is meant for tests | false            |

  Scenario Outline: The wait methods meant for tests are reported outside tests.
    Given A store created in the same file.
    When The app code calls store.{Method}.
    Then There is a warning, saying it is meant for tests.
    Examples: 
      | Method                    | Args                            |
      | waitActionType            | Increment                       |
      | waitAllActionTypes        | [Increment]                     |
      | waitAnyActionTypeFinishes | [Increment]                     |
      | waitActionCondition       | (actions) => actions.size === 0 |

  Scenario Outline: waitAllActions is reported only when it waits for all actions.
    Given A store created in the same file.
    When The app code calls store.waitAllActions({Args}).
    Then There is a warning: {Reported}.
    Examples: 
      | Args     | Reported |
      | []       | true     |
      | null     | true     |
      | [action] | false    |

  Scenario: Nothing is reported in tests.
    Given Code that uses store.mocks, store.record and store.waitActionType.
    When The code is in a test file.
    Then There are no warnings.

  Scenario Outline: The wait methods of actions and of useStore() are reported too.
    Given {Where}.
    When It calls waitActionType.
    Then There is a warning.
    Examples: 
      | Where                                       | Code                                                                                                                                    | Text                |
      | A Kiss action                               | 
class WaitForIncrement extends KissAction<State> {
  async reduce() {
    await this.waitActionType(Increment);
    return null;
  }
} | this.waitActionType |
      | A component, with the store from useStore() | 
export function useWait() {
  const s = useStore();
  return () => s.waitActionType(Increment);
}                                      | s.waitActionType    |

  Scenario: With type information, a store from another file is reported too.
    Given A store imported from another file.
    When The app code uses store.mocks.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since it is not known to be a Kiss store.

  Scenario: Other objects with the same names are not reported.
    Given An object that is not a Kiss store, with mocks, record and waitActionType.
    When The app code uses them.
    Then There are no warnings.
