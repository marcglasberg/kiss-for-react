Feature: Base classes with methods that must not be overridden

  Scenario Outline: An action that overrides the reduce of a Kiss base class can't be dispatched.
    Given An action that extends the given Kiss base class.
    And The action overrides reduce.
    When The action is dispatched.
    Then The dispatch throws a StoreException, which says the action must not override reduce.
    And The state does not change.
    Examples: 
      | Base class             |
      | OptimisticCommand      |
      | OptimisticSync         |
      | OptimisticSyncWithPush |
      | ServerPush             |
      | LoadPages              |

  Scenario: An action that overrides reduce as an arrow function property can't be dispatched.
    Given An action that extends OptimisticCommand.
    And The action overrides reduce with an arrow function property.
    When The action is dispatched.
    Then The dispatch throws a StoreException, which says the action must not override reduce.

  Scenario: An action whose own base class overrides reduce can't be dispatched.
    Given A base class of the app, which extends OptimisticSync and overrides reduce.
    And An action that extends that base class, and doesn't override reduce.
    When The action is dispatched.
    Then The dispatch throws a StoreException, which says the action must not override reduce.

  Scenario: An action with a base class of the app that doesn't override reduce is dispatched normally.
    Given A base class of the app, which extends OptimisticCommand and doesn't override reduce.
    And An action that extends that base class, and doesn't override reduce.
    When The action is dispatched.
    Then The action completes successfully, and changes the state.

  Scenario: A LoadPages action that overrides statusKey can't be dispatched.
    Given An action that extends LoadPages.
    And The action overrides the statusKey getter.
    When The action is dispatched.
    Then The dispatch throws a StoreException, which says the action must not override statusKey.
