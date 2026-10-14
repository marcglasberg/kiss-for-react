Feature: Events are persisted as spent

  Scenario: An event is serialized and deserialized as a spent event.
    Given An unspent Evt with a value, a spent Evt, an EvtState with a value, and a spent EvtState.
    When They are serialized and deserialized.
    Then The deserialized events are of the same class, but spent, and without a value.

  Scenario: The value of an event is not saved, so events can hold values that can't be serialized.
    Given An Evt and an EvtState whose values are a function and an object with a circular reference.
    When They are serialized.
    Then It doesn't throw, and the saved text doesn't contain the values.

  Scenario: Events saved by the ClassPersistor are restored spent, so they don't fire when the app restarts.
    Given A store with a ClassPersistor, whose classes to serialize don't include Evt and EvtState.
    And An action put new events in the state, which were saved.
    When The app restarts, with a new store that reads the saved state.
    And A component that uses useEvent for the events mounts.
    Then The restored events are spent, and the callbacks are not called.
    And A new event put in the state by an action fires normally.

  Scenario: Restored events don't fire in a component that mounted before the store was ready.
    Given A ClassPersistor with a saved state with events, that takes a while to read.
    And A component that uses useEvent for the events, mounted while the store is not ready.
    When The saved state finishes being read, and replaces the initial state.
    Then The callbacks are not called.
