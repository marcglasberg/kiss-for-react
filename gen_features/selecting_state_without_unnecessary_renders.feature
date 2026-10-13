Feature: Selecting state without unnecessary renders

  Scenario: A consumer shows the selected value as soon as it mounts, with a single render.
    Given A store with a=1 and b=2.
    When A component that selects a is mounted.
    Then It shows 1 after its first commit.
    And It does not need a second render to start listening to the store.

  Scenario: Changing an unrelated part of the state does not render the consumer again.
    Given A mounted component that selects a.
    When An action changes only b, creating a new state object.
    Then The component still shows a=1.
    And It did not render or commit again.

  Scenario: Changing the selected value renders the consumer once, keeping a single subscription.
    Given A mounted component that selects a, with one active subscription to the store.
    When An action changes a to 3.
    Then The component commits 3, with exactly one more render.
    And It still has exactly one subscription to the store.

  Scenario: Only the consumers of the changed fields render, and the all-state consumer sees every state.
    Given Three mounted components: one selects a, one selects b, and one uses the whole state.
    When An action changes a, and then another action changes b.
    Then The a consumer renders only for the a change, and the b consumer only for the b change.
    And The all-state consumer renders for both, seeing each new state object.

  Scenario Outline: An action that ends without a new state does not render the state consumers.
    Given A mounted component that selects a, and a store with a state observer.
    When An action ends [How] (so the state is not replaced).
    Then The component does not render again.
    And The action completes with no error, and the state observer still sees it.
    Examples: 
      | How         |
      | null        |
      | same state  |
      | abortReduce |

  Scenario Outline: An async action that ends without a new state still ends the waiting, without rendering state consumers.
    Given A mounted component that selects a, and another that shows if the action is in progress.
    When An async action is dispatched, and later ends [How].
    Then The waiting component shows true while the action runs, and false when it ends.
    And The state consumer never renders again.
    Examples: 
      | How         |
      | null        |
      | same state  |
      | abortReduce |

  Scenario: A derived value that stays the same skips the render, and renders when it changes.
    Given A mounted component that selects whether a is positive.
    When a changes from 1 to 2 (still positive), and then to -1.
    Then The first change does not render the component.
    And The second change renders it, showing false.

  Scenario: A selected NaN is equal to NaN, so only real changes render the consumer.
    Given A store where a is NaN, and a mounted component that selects a.
    When b changes, then a changes to 5, then a changes back to NaN.
    Then The b change does not render the component.
    And The change to 5 and the change back to NaN each render it once.

  Scenario Outline: Selected values are compared with Object.is, so changes between similar values render the consumer.
    Given A store where the selected value is [From].
    When An action changes it to [To].
    Then The component [Renders] again, and shows the new value.
    Examples: 
      | From      | To        | Renders |
      | 0         | 0         | true    |
      | 0         | 0         | true    |
      | 0         | 0         | false   |
      | true      | false     | true    |
      | x         | y         | true    |
      | x         | x         | false   |
      | NULL      | undefined | true    |
      | undefined | NULL      | true    |
      | NULL      | NULL      | false   |

  Scenario: A selected class instance keeps its identity and prototype until it is replaced.
    Given A state with a User class instance, and a mounted component that selects the user.
    When An unrelated field changes, and then the user is replaced.
    Then The unrelated change does not render the component, which keeps the same instance.
    And Replacing the user renders it, with the new instance, whose methods still work.

  Scenario Outline: A selector that returns a new object each time does not loop, and renders for each state change.
    Given A component whose [Selector] returns a new object with a.
    When It mounts, and then an action changes b.
    Then It renders once when it mounts, and once more for the state change (no render loop).
    Examples: 
      | Selector |
      | inline   |
      | stable   |

  Scenario: The same selector function used against two stores does not mix their values.
    Given Two providers with different stores, each with a component using the same selector function.
    When a changes in the first store.
    Then Only the first component renders again, showing the first store value.
    And The second component still shows the second store value.

  Scenario: A value that changes A, B, A in separate updates shows all three; in one batch, it ends at A.
    Given A mounted component that selects a, equal to 1.
    When Three separate actions set a to 2, then 1, then 2.
    And Then one batch of actions sets a to 1, then 2, then 1.
    Then The separate updates commit 2, 1, 2 in order.
    And The batch ends showing 1, the current state, and does not render for stale values afterwards.

  Scenario: A component with several selectors commits a consistent tuple when one update changes several fields.
    Given A mounted component that selects a and b separately.
    When One action changes both a and b.
    Then The component commits the new a and the new b together, with a single render.

  Scenario: A consumer mounted after state changes, with no other consumer, reads the latest state.
    Given A store with no mounted consumers.
    When An action changes a, and then a component that selects a is mounted.
    Then Its first render shows the latest value.

  Scenario Outline: A primitive or falsy root state works with the whole-state hook and the "no change" rules.
    Given A store whose state is the primitive [Initial].
    When An action returns [Next], and then another returns null.
    Then The component shows [Initial], then [Next], and renders [Renders] times in total.
    And The null return keeps the state and does not render.
    Examples: 
      | Initial | Next | Renders |
      | 0       | 1    | 2       |
      |         | x    | 2       |
      | false   | true | 2       |
      | NaN     | NaN  | 1       |
