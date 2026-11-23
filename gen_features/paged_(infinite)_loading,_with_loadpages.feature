Feature: Paged (infinite) loading, with LoadPages

  Scenario: Dispatching the action with no argument, when nothing was loaded yet, loads the first page.
    Given A state where the pages were never loaded (null).
    And A server with 10 items, in pages of 3.
    When The action is dispatched with no argument (which is "refresh").
    Then The state has one page, with the first 3 items, loaded with the initial page param.
    And The page param of that page is the initial one.
    And There is a next page, but no previous page (the action has no `previousPageParam`).

  Scenario: "next" loads the page after the last one, and adds it to the end, keeping the pages already loaded.
    Given A server with 10 items, in pages of 3, and the first page loaded.
    When "next" is dispatched three times.
    Then After each one, the state has one more page, and all the items loaded so far.
    And Each page was asked with the id of the last item of the page before it.
    And After the last page (which has less than 3 items), there is no next page.

  Scenario: "next" does nothing when there is no next page.
    Given All the pages loaded, so there is no next page.
    When "next" is dispatched.
    Then The dispatch is aborted: nothing is asked to the server, and the state does not change.

  Scenario: "next" and "previous" load the first page when nothing was loaded yet.
    Given A state where the pages were never loaded.
    When "next" is dispatched.
    Then The first page is loaded.
    And When the pages are emptied, and "previous" is dispatched.
    And Then the first page is loaded again.

  Scenario: "first" loads the first page again, and throws away the other pages.
    Given Three pages loaded.
    When "first" is dispatched.
    Then Only the first page is asked to the server, with the initial page param.
    And The state has only that page, and there is a next page.

  Scenario: "refresh" loads again all the loaded pages, one after the other from the first, and changes the state once, at the end.
    Given Three pages loaded (items 1 to 9), and a server that answers when the test says so.
    And Item 2 was deleted in the server.
    When "refresh" is dispatched.
    Then Only the first page is asked, with the page param of the first page.
    And When it arrives, the second page is asked with the id of its new last item (4, not 3).
    And The state does not change until the last page arrives.
    And Then the state has the three new pages, with their new page params.

  Scenario: "refresh" stops early when the server has fewer pages than before.
    Given Three pages loaded (items 1 to 9).
    And The server now has only 4 items.
    When "refresh" is dispatched.
    Then Only two pages are asked, since the second one is the last.
    And The state has two pages, and no next page.

  Scenario: "refresh" loads the first page when nothing was loaded yet.
    Given A state with empty pages.
    When "refresh" is dispatched.
    Then The first page is loaded.

  Scenario: "previous" loads the page before the first one, and adds it to the start.
    Given An action that loads by page number, in both directions, and page 3 loaded.
    When "previous" is dispatched twice.
    Then Pages 2 and 1 are added to the start, asked backward.
    And There is a previous page until page 1 is loaded.
    And When "previous" is dispatched once more.
    And Then the dispatch is aborted, since there is no previous page.

  Scenario: Without `previousPageParam`, there is never a previous page, and "previous" does nothing.
    Given An action that does not implement `previousPageParam`, and the second page loaded.
    When "previous" is dispatched.
    Then There is no previous page, and the dispatch is aborted.

  Scenario: A page param of 0 is a valid page param. Only null and undefined mean there is no page.
    Given An action whose pages are numbered from 0, with page 1 loaded.
    When "previous" is dispatched.
    Then Page 0 is loaded, and there is no previous page after it.
    And When "refresh" is dispatched.
    And Then the pages are loaded again from page 0.

  Scenario: With `maxPages`, adding a page past the limit drops the page at the other end.
    Given An action with `maxPages = 2`, that loads by page number, and page 1 loaded.
    When "next" is dispatched twice.
    Then The state has pages 2 and 3 only: page 1 was dropped.
    And There is now a previous page.
    And When "previous" is dispatched.
    And Then the state has pages 1 and 2: page 3 was dropped.
    And When "refresh" is dispatched.
    And Then only the two kept pages are loaded again, from the first one kept.

  Scenario: A "next" dispatched while a load of the same list is running is aborted, so two quick taps load one page.
    Given The first page loaded, and a server that answers when the test says so.
    When "next" is dispatched, and then "next" again, while the first one is still running.
    Then The second dispatch is aborted, and only one page is asked to the server.
    And While the first "next" runs, `isWaiting` is true for the action, with or without the statusKey.
    And When the server answers, the state has two pages.

  Scenario: A "first" dispatched while a "next" is running aborts the "next": its result is ignored, even if it arrives later.
    Given The first page loaded, and a server that answers when the test says so.
    When "next" is dispatched, and then "first" while it runs.
    Then The "next" action is aborted, and its abortSignal is aborted (so a fetch would be cancelled).
    And When the server answers the "first" request, and only then the "next" request.
    And Then the state has only the first page: the late "next" page was ignored.

  Scenario: A "refresh" dispatched while a "next" is running aborts the "next", and a "next" dispatched meanwhile is aborted too.
    Given Two pages loaded, and a server that answers when the test says so.
    When "next" is dispatched, then "refresh" while it runs, then "next" again.
    Then The first "next" is aborted by the "refresh", and the second "next" is aborted because the "refresh" is running.
    And When the refresh finishes, the state has the two pages, loaded again.

  Scenario: A "refresh" that is aborted stops loading the remaining pages.
    Given Three pages loaded, and a server that answers when the test says so.
    When "refresh" is dispatched, and the action is aborted with `store.abort` while the first page loads.
    And The server answers the first page.
    Then The other pages are not asked, and the state does not change.

  Scenario: An item removed from the pages while a "next" is loading stays removed when the page arrives.
    Given The first page loaded, and a "next" running.
    When Another action removes item 2 from the pages.
    And The next page arrives.
    Then The state has the first page without item 2, followed by the new page.

  Scenario: Loads of different lists (different `pagesKeyParams`) do not affect each other, and the statusKey tells which list is loading.
    Given One action class that loads a list per id, with the first page of lists "a" and "b" loaded.
    And A server that answers when the test says so.
    When "next" is dispatched for "a", and then for "b".
    Then Both run (the second is not aborted), and `isWaiting` with the statusKey is true for "a" and "b", but not for "c".
    And When the server answers the request of "a".
    And Then list "a" has two pages, list "b" still has one, and only "b" is still loading.

  Scenario: A "first" of one list does not abort the loads of another list.
    Given Lists "a" and "b" loaded, and a "next" of "b" running.
    When "first" is dispatched for "a".
    Then The "next" of "b" is not aborted, and both finish normally.

  Scenario: If loading a page fails, the action fails and the state does not change.
    Given Three pages loaded.
    When "refresh" is dispatched, and the server fails on the second page.
    Then The action fails with the error, and the state keeps the three old pages.
    And `isFailed` is true for the action.

  Scenario: LoadPages cannot be combined with `nonReentrant` or `ignoreOld`, and `maxPages` must be a positive integer.
    Given LoadPages actions with `nonReentrant`, with `ignoreOld`, with `maxPages = 0`, and with an invalid `which`.
    When Each one is dispatched.
    Then The dispatch throws a StoreException.

  Scenario: `fresh` applies to "refresh" and "first", but "next" always runs.
    Given An action with `fresh = 300`, and the first page loaded.
    When "refresh" is dispatched right away.
    Then It is aborted, since the list is fresh.
    And When "next" is dispatched twice.
    And Then both run, since loading more is never fresh.
    And When "first" is dispatched.
    And Then it is aborted, since the list is still fresh.

  Scenario: `throttle` applies to "refresh" and "first", but "next" always runs.
    Given An action with `throttle = 300`, and the first page loaded.
    When "first" is dispatched right away, and then "next".
    Then The "first" is aborted (throttled), but the "next" runs.

  Scenario: With `retry`, a load that fails is tried again.
    Given An action with `retry`, and a server that fails the first request.
    When The action is dispatched.
    Then The page is asked twice, and the state has the page.

  Scenario: The Pages value is immutable, and can be copied with changes.
    Given An empty Pages, and a Pages with two pages.
    When They are inspected and copied.
    Then The empty one has no pages and no next or previous page.
    And The copy has the changed fields, and the original is not changed.
