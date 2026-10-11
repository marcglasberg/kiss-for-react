Feature: Protected lifecycle methods

  Scenario Outline: The lifecycle methods of the action classes are protected.
    Given The <Class> class.
    When Code outside the action calls one of its lifecycle methods, like reduce, before or after.
    Then It does not compile, since these methods are protected.
    And They can only be called by the store, when the action is dispatched.
    Examples: 
      | Class                  |
      | KissAction             |
      | OptimisticCommand      |
      | OptimisticSync         |
      | OptimisticSyncWithPush |
      | ServerPush             |

  Scenario: An action can override the protected lifecycle methods, and call super.
    Given An action that overrides before, after and wrapError, as protected methods.
    And Each one calls super, and the reducer fails.
    When The action is dispatched.
    Then The store calls before, then wrapError, then after.
