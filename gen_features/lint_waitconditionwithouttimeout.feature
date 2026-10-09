Feature: Lint: wait-condition-without-timeout

  Scenario Outline: A wait for a condition without a timeout is reported outside tests.
    Given {Where}.
    When It waits for a condition with timeoutMillis {Timeout}.
    Then There is a warning on the timeout.
    Examples: 
      | Where                                    | Timeout | Code                                                                                                                                                                             |
      | The store's waitCondition                | 0       | 
export async function run() {
  await store.waitCondition((state) => state.price >= 100, { timeoutMillis: 0 });
}                                                               |
      | The store's dispatchWhen                 | -1      | 
store.dispatchWhen(new BuyStock(), (state) => state.price >= 100, { timeoutMillis: -1 });                                                                                       |
      | The function returned by useDispatchWhen | 0       | 
export function useBuy() {
  const dispatchWhen = useDispatchWhen();
  return () => dispatchWhen(new BuyStock(), (state: State) => state.price >= 100, { timeoutMillis: 0 });
} |
      | The dispatchWhen of useStore()           | 0       | 
export function useBuy() {
  const s = useStore();
  return () => s.dispatchWhen(new BuyStock(), (state: State) => state.price >= 100, { timeoutMillis: 0 });
}                 |
      | An action's waitCondition                | 0       | 
class WaitForPrice extends KissAction<State> {
  async reduce() {
    await this.waitCondition((state) => state.price >= 100, { timeoutMillis: 0 });
    return null;
  }
}     |

  Scenario: A wait with a timeout is fine.
    Given The store's waitCondition and dispatchWhen.
    When They wait with timeoutMillis 5000, or with a timeout from a variable.
    Then There are no warnings.

  Scenario: Nothing is reported in tests.
    Given A waitCondition with timeoutMillis 0.
    When The code is in a test file.
    Then There are no warnings.

  Scenario: With type information, other objects with a waitCondition method are not reported.
    Given An object that is not a Kiss store, with a waitCondition method.
    When It is called with timeoutMillis 0.
    Then With type information, there is no warning.
    And Without type information, there is a warning, since the timeoutMillis option is specific to Kiss.
