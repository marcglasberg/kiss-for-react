Feature: Falsy persisted state

  Scenario Outline: The last persisted state is returned even when it is falsy.
    Given A store with a persistor.
    When A falsy state is saved.
    Then The last persisted state is that falsy state, not null.
    Examples: 
      | State |
      | 0     |
      |       |
      | false |
