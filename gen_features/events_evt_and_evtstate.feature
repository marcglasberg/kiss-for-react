Feature: Events (Evt and EvtState)

  Scenario: A new event is not spent, and holds its value.
    Given A store.
    When A boolean event is created with new Evt(), and an event with a value with new Evt(value).
    Then The boolean event has the value true.
    And The other event has the given value.
    And Neither of them is spent.

  Scenario: Evt.spent() is an event that was already used, for the initial state.
    Given A store.
    When An event is created with Evt.spent().
    Then It is spent, in any store.
    And It has no value.

  Scenario: Reading the value of an event does not spend it.
    Given A new event with a value.
    When Its value is read many times.
    Then It is still not spent.

  Scenario: Events describe themselves, for the logs.
    Given Events of each kind.
    When They are converted to a string.
    Then The string shows the kind of event and its value, or that it is spent.

  Scenario: An action puts a new event in the state, and tests can check it.
    Given A state with spent events.
    When An action puts a new boolean event in the state.
    And An async action puts a new event with a value in the state.
    Then The state has new, unspent events, different from the previous ones.
    And Tests can read the value of the new event.

  Scenario Outline: useEvent fires once when an action puts a new event in the state.
    Given A component that uses useEvent for a boolean event, and for an event with a value.
    When An action puts a new boolean event in the state.
    And An action puts a new event with a value in the state.
    Then Each callback is called once, with the value of its event.
    And The events are now spent.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: useEvent fires again for each new event, even with the same value.
    Given A component that uses useEvent for an event with a value.
    When An action puts a new event with the same value in the state, twice.
    Then The callback is called twice.

  Scenario Outline: useEvent does not fire again when the component re-renders for other reasons.
    Given A component that uses useEvent, and shows a text from the state.
    And An action put a new event in the state, and the callback was called.
    When Another action changes the text, and the component re-renders.
    And The component re-renders because its local state changed.
    And The component re-renders because its props changed.
    Then The callback is not called again.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: An event created before the component mounts fires once, when it mounts.
    Given An action put a new event in the state, while no component used it.
    When A component that uses useEvent for that event mounts.
    Then The callback is called once, with the value of the event.
    And The event is now spent.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: A spent event does not fire again when the component remounts.
    Given A component that handled an event with useEvent.
    When The component unmounts, and mounts again, with the same event still in the state.
    Then The callback is not called again.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: The events of the initial state do not fire, when they are created with Evt.spent().
    Given A store whose initial state has events created with Evt.spent().
    When A component that uses useEvent for them mounts.
    Then The callbacks are not called.

  Scenario: An initial state with a new Evt() fires when the first component mounts, which is why Evt.spent() should be used.
    Given A store whose initial state has an event created with new Evt(), instead of Evt.spent().
    When A component that uses useEvent for it mounts, and then another one.
    Then The callback of the first component is called, on mount.
    And The callback of the second one is not, since the event is spent.

  Scenario: Each event is handled by one component only.
    Given Two mounted components that use useEvent for the same event.
    When An action puts a new event in the state.
    Then Only the first component to run its effect handles it.
    And For two components to react, two events are needed: each component handles its own.

  Scenario: Handling an event does not change the state or the event.
    Given A component that uses useEvent.
    When An action puts a new event in the state, and the component handles it.
    Then The state is the same object the action created.
    And The event still has its value, and is marked as spent in the store, not in the event.
    And Another store that gets the same state has not spent it.

  Scenario: useEvent calls the callback of the latest render.
    Given A component that uses useEvent with a callback that uses a prop.
    When The prop changes, and then an action puts a new event in the state.
    Then The callback sees the new prop.

  Scenario Outline: useEvent does nothing when the selector returns null or undefined.
    Given A component whose useEvent selector returns null or undefined.
    When The component mounts, and the state changes.
    Then The callback is not called, and nothing throws.
    Examples: 
      | Selected  |
      | null      |
      | undefined |

  Scenario: An event that the selector starts returning later fires once.
    Given A component whose useEvent selector returns an event only when the state has a text.
    And An action put a new event in the state, and the component ignored it.
    When An action sets the text, so the selector returns the event.
    Then The callback is called once.

  Scenario: After logOut, the spent events of the initial state do not fire.
    Given A component that handled an event with useEvent.
    When The store logs out, going back to the initial state, whose events are Evt.spent().
    Then The callback is not called again.
    And A new event after the logOut fires normally.

  Scenario: useEvent must be used within a StoreProvider.
    Given A component that uses useEvent, rendered without a StoreProvider.
    When The component renders.
    Then It throws.

  Scenario Outline: useLayoutEvent fires in the layout phase, before the passive effects.
    Given A component that uses useLayoutEvent, and a useEffect that runs on every render.
    When An action puts a new event in the state.
    Then The callback is called once, before the useEffect of that render.
    And The event is spent.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: useLayoutEvent behaves like useEvent: it fires once, including for events created before the mount, and not on remount.
    Given An action put a new event in the state, while no component used it.
    When A component that uses useLayoutEvent for that event mounts, unmounts, and mounts again.
    Then The callback is called once, when it first mounts.

  Scenario: A new EvtState holds its value, and each instance is unique.
    Given Nothing.
    When Two EvtState are created with the same value, and one without a value.
    Then They hold their values, and the one without a value has the value true.
    And The two with the same value are different objects.
    And They are not spent, but EvtState.spent() is.

  Scenario Outline: useEvent with an EvtState fires in all the mounted components that use it, each time a new one is put in the state.
    Given Two mounted components that use useEvent for the same EvtState.
    When An action puts a new EvtState in the state, twice, with the same value.
    Then Both callbacks are called each time, with the value.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: An EvtState does not fire when the component mounts, nor when it remounts, nor on unrelated re-renders.
    Given An action put a new EvtState in the state, while no component used it.
    When A component that uses useEvent for it mounts.
    And Another action changes the text, and the component re-renders.
    And The component unmounts and mounts again.
    Then The callback is never called.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: After logOut, an EvtState in the initial state fires unless it was created with EvtState.spent().
    Given A store whose initial state has an EvtState, created with EvtState.spent() or with new EvtState().
    And A mounted component that uses useEvent for it, which handled a new EvtState put by an action.
    When The store logs out, going back to the initial state.
    Then With EvtState.spent(), the callback is not called again.
    And With new EvtState(), the callback is called again, with the value of the initial state.
    Examples: 
      | Initial | Log        |
      | spent   | go         |
      | new     | go,initial |

  Scenario: useLayoutEvent also works with an EvtState.
    Given A mounted component that uses useLayoutEvent for an EvtState.
    When An action puts a new EvtState in the state.
    Then The callback is called with the value.
