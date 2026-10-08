Feature: PersistAction

  Scenario: Dispatching PersistAction persists the state right away, ignoring the throttle.
    Given A persistor with a long throttle period.
    And The state was changed, but the change was not persisted yet because of the throttle.
    When A PersistAction is dispatched.
    Then The state is persisted right away.
    And The state is not persisted again when the throttle period ends.

  Scenario: Dispatching PersistAction does nothing when there is nothing new to persist.
    Given A persistor with a long throttle period.
    And The state has not changed since it was last persisted.
    When A PersistAction is dispatched.
    Then The persistor is not asked to persist.

  Scenario: Dispatching PersistAction does nothing while the persistor is paused.
    Given A persistor with a long throttle period.
    And The persistor is paused.
    And The state was changed.
    When A PersistAction is dispatched.
    Then The persistor is not asked to persist.
