Feature: App focus and online signals in the browser

  Scenario: In the browser, the store is focused when the document is visible.
    Given A browser where the document is visible, or hidden.
    When The store is created and isFocused is read.
    Then It is true when the document is visible, and false when hidden.

  Scenario: In the browser, the store follows the visibilitychange event.
    Given A store in a visible document, with a focus listener.
    When The document becomes hidden, and then visible again.
    Then isFocused follows, and the listener is notified each time.

  Scenario: In the browser, the store is online when navigator.onLine is true.
    Given A browser where navigator.onLine is true, or false.
    When The store is created and isOnline is read.
    Then It has the value of navigator.onLine.

  Scenario: In the browser, the store follows the online and offline events.
    Given A store in an online browser, with an online listener.
    When The browser goes offline, and then online again.
    Then isOnline follows, and the listener is notified each time.

  Scenario: A disposed store stops listening to the browser events.
    Given A store that was listening to the focus and online events.
    When The store is disposed, and the events fire.
    Then The store keeps its last values, and does not notify.

  Scenario: Setting a signal by hand stops listening to the browser events.
    Given A store in a visible document.
    When setFocused(false) is called, and the document becomes visible again.
    Then isFocused stays false.
    And After setFocused(null), it follows the document again.
