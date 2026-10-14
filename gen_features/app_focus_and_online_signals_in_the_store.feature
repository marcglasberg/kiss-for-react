Feature: App focus and online signals in the store

  Scenario: Where the app cannot know if it is focused or online, the store assumes it is both.
    Given A store created in Node, with no document and no navigator.
    When The signals are read.
    Then isFocused and isOnline are true.

  Scenario Outline: The store can get its focus and online signals from a custom source.
    Given A store with a custom source for the signal (for example, AppState or NetInfo in React Native).
    When The source sets the value.
    Then The store reports that value, and notifies its listeners.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: Setting the same value again does not notify the listeners.
    Given A store with a custom source, and a listener.
    When The source sets the value the store already has.
    Then The listener is not called.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: The source is started lazily, once, when the signal is first read or subscribed to.
    Given A store with a custom source.
    When The store is created.
    Then The source is not called.
    And When the signal is read, or subscribed to, the source is called once.
    And Reading it again does not call it again.
    Examples: 
      | Signal | How       |
      | focus  | read      |
      | focus  | subscribe |
      | online | read      |
      | online | subscribe |

  Scenario Outline: The source can set the initial value when it starts.
    Given A custom source that calls the setter right away, with false.
    When The signal is first read.
    Then The store reports false.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: Disposing the store unsubscribes from the sources.
    Given A store whose custom source was started.
    When The store is disposed.
    Then The unsubscribe function returned by the source is called.
    And Values the source sets afterwards are ignored.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario: Disposing a store whose sources were never started does nothing to them.
    Given A store with a custom source that was never read.
    When The store is disposed.
    Then The source is not started, and not stopped.

  Scenario: An unsubscribe that throws when the store is disposed is reported, and the disposal continues.
    Given A store with a custom source whose unsubscribe throws.
    When The store is disposed.
    Then The error is given to the errorObserver, with a null action.
    And The store is disposed anyway.

  Scenario Outline: Tests can set the signals by hand, which disconnects the source.
    Given A store with a custom source.
    When setFocused or setOnline is called with a boolean.
    Then The store reports that value, and notifies its listeners.
    And The source is stopped, and the values it sets afterwards are ignored.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: Setting a signal by hand before it is read means the source is never started.
    Given A store with a custom source, whose signal was not read yet.
    When setFocused or setOnline is called with a boolean.
    And The signal is then read.
    Then The source is never started, and the store reports the value set by hand.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: Setting a signal to null connects the source again.
    Given A store whose signal was set by hand.
    When setFocused or setOnline is called with null.
    Then The source is started again, and the store reports what the source says.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario: By default, checkInternet uses the online signal of the store.
    Given An action with checkInternet, and no hasInternet override.
    And The store says the app is offline.
    When The action is dispatched.
    Then The action fails with a "No Internet" UserException.
    And When the store says the app is online, the action runs.

  Scenario: A custom online source is used by checkInternet.
    Given A store with a custom online source (like NetInfo), and an action with checkInternet.
    When The source says the app is offline, and the action is dispatched.
    Then The action fails with "No Internet".

  Scenario: The internet simulation takes precedence over the online signal.
    Given A store that says the app is offline, but simulates that there is internet.
    When An action with checkInternet is dispatched.
    Then The action runs.

  Scenario: An action can still override hasInternet, ignoring the online signal.
    Given An action that overrides hasInternet to return true.
    And The store says the app is offline.
    When The action is dispatched.
    Then The action runs.
