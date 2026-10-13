Feature: Concurrent rendering never commits a mix of two store versions

  Scenario: A transition that mounts two related consumers does not commit one of them with an older store version.
    Given A store at version 1 (a=1, b=1), and a panel with a consumer of a and a consumer of b, shown by a transition.
    When The transition renders the a consumer, and is paused before rendering the b consumer.
    And While it is paused, the store changes to version 2 (a=2, b=2), and then the transition resumes.
    Then The paused render really happened: the a consumer rendered version 1, and nothing was committed.
    And No commit shows a=1 with b=2: the final commit shows version 2 for both.

  Scenario: A consumer mounted by a transition, that read the store before subscribing, cannot commit a stale value.
    Given A store at version 1, with no consumer mounted, and a consumer of b shown by a transition.
    When The transition renders the consumer (which has not subscribed yet), and is paused.
    And While it is paused, the store changes to version 2, and then the transition resumes.
    Then The paused render really happened: the consumer rendered version 1, and nothing was committed.
    And The consumer never commits version 1: its first commit shows version 2, without waiting for another store change.

  Scenario: An abandoned transition with another selector does not replace the committed selector.
    Given A component that selects the field named by its local state, committed selecting a.
    When A transition changes the field to b, renders, and is paused; then an urgent (flushSync) update sets the field back to a.
    And After both settle, the store changes b, and then changes a.
    Then The component keeps showing a, and the change of b does not render it.
    And The change of a renders it with the new value.

  Scenario: An abandoned transition cannot leak its speculative useObject result into the committed tree.
    Given A component using useObject with a shape chosen by local state, committed with the shape {x}, passed to a memoized child.
    When A transition changes the shape to {x, y}, renders, and is paused; then an urgent (flushSync) update sets the shape back to {x}.
    And After both settle, an unrelated field of the store changes.
    Then The component keeps returning the very same {x} object it committed, so the memoized child does not render.
    And When x changes, a new object is returned and the child renders.

  Scenario: A render that suspends on a store value, resumed after the store changed again, shows the current value.
    Given A component that selects a key and suspends while the data for that key is not loaded, inside a Suspense boundary.
    And The data for k1 and k3 is loaded, but not for k2.
    When The store key changes to k2 (the component suspends), then to k3 (loaded), and then the data for k2 arrives.
    Then The component shows k3, and the arrival of k2 does not bring back an obsolete result.
    And The component has exactly one subscription to the store.

  Scenario: An urgent local update that interrupts a transition reading the store leaves only valid commits.
    Given Two consumers of a and b, which also show a label from a transition and a counter from urgent updates.
    When A transition changes the label, renders the first consumer, and is paused.
    And An urgent (flushSync) update changes the counter, then the store changes to version 2, and everything settles.
    Then Every commit shows the same version for a and b, and the final commit shows the new label, counter and version.
    And The work stays bounded: no render loop.

  Scenario: A dispatch wrapped in startTransition still updates the consumers as a synchronous store update.
    Given A mounted consumer of a and b.
    When The store changes to version 2 inside startTransition.
    Then The consumers show version 2 as soon as the microtasks run, without the transition work being flushed.
    And The work stays bounded.

  Scenario: A paused render with a state consumer and a status consumer is not committed with the state of before and the status of after.
    Given A Load action in progress, and a panel with a consumer of the count and a consumer of the waiting status, shown by a transition.
    When The transition renders the count consumer (count 0) and is paused before the status consumer.
    And While paused, the action finishes (count 1, not waiting), and then the transition resumes.
    Then No commit shows count 0 with waiting false.
    And The final commit shows count 1 and waiting false.

  Scenario: An old store that becomes ready while a transition replaces it cannot update the tree committed with the new store.
    Given A provider with store 1 (not ready, count 1), and a consumer showing readiness and the count.
    And Store 2 is ready, with count 2.
    When A transition switches the provider to store 2, renders the consumer, and is paused.
    And While paused, store 1 becomes ready and restores count 100; then the transition resumes.
    Then The final commit shows store 2: ready, count 2.
    And Store 1 has no subscription left, and a later change of store 1 does not change what is shown.

  Scenario: When a store change makes a component suspend, the Suspense fallback shows until the data arrives.
    Given A component that selects a key and suspends while the data for that key is not loaded, inside a Suspense boundary showing k1.
    When The store key changes to k2, whose data is not loaded, and later the data arrives.
    Then The fallback shows while the data is missing: a store update is synchronous, not a transition, so React hides the old content and shows the fallback.
    And The component shows k2 when the data arrives.
