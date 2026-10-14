Feature: Streaming server rendering

  Scenario: The state appears in the streamed HTML: in the shell, and in a Suspense boundary that resolves later.
    Given A server store whose count is 5, and a page showing the count in the shell and in a lazy component inside Suspense.
    When The page is streamed with renderToPipeableStream, piping when the shell is ready.
    Then The first chunk has the shell: the count, no action waiting, and the Suspense fallback.
    And A later chunk, written when the lazy component loads, has the count rendered by the lazy component.
    And No error is reported, no action is dispatched, and the store has no subscription.

  Scenario: Hydrating the complete streamed HTML produces no mismatch, and the components then follow the client store.
    Given The HTML of a page streamed by a server store with count 5, complete (piped when all was ready).
    And A client store created with the same state.
    When The client hydrates the HTML.
    Then There is no recoverable hydration error, and the page shows the server state.
    And An action dispatched on the client updates the shell and the Suspense content.

  Scenario: When the client store changed before hydrating streamed HTML, hydration uses the serverState, then catches up.
    Given The complete streamed HTML of a server store with count 5.
    And A client store created with count 5, where an action then changed the count to 6 before hydrating.
    When The client hydrates the HTML, giving the server state as serverState.
    Then There is no recoverable hydration error.
    And The page then shows 6, in the shell and in the Suspense content.

  Scenario: Two requests streamed at the same time, with their own stores, do not mix their states.
    Given Store A with count 1 and store B with count 2, each with a lazy component that loads at a different time.
    When Both pages are streamed at the same time, and the lazy component of B loads before the one of A.
    Then Each streamed HTML shows only the count of its own store, in the shell and in the Suspense content.

  Scenario: The page also streams with renderToReadableStream, used by edge runtimes.
    Given A server store with count 7, and the page with a lazy component inside Suspense.
    When The page is streamed with renderToReadableStream, and the whole stream is read.
    Then The HTML has the count in the shell and in the Suspense content, and no error is reported.
