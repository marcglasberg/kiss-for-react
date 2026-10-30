# Changelog

## 1.1.0

* New rule `conditional-status-hook` (error): reports `useIsWaiting`, `useIsFailed` and
  `useExceptionFor` called after `||`, `&&` or `??`, or in a branch of `? :`, which breaks
  React's rules of hooks. Its automatic fix replaces `useIsWaiting(LoadUser) ||
  useIsWaiting(LoadPosts)` with `useIsWaiting([LoadUser, LoadPosts])`. The fixed code needs
  Kiss 2.0.6, where the status hooks accept an array of action types.
* For Kiss 2.0.6, where `isWaiting` and `useIsWaiting` also accept an array of
  action types: `wait-fail-never-matches` now reports each sync action inside the array, like
  `useIsWaiting([LoadUser, Increment])`, since a sync action never makes the result true.
* For Kiss 2.0.5, where the store checks the internet of `checkInternet` before it calls
  `before()`, so `before()` doesn't need to call `super.before()`:
  * `missing-super-in-override` no longer reports a `before()` without `super.before()`, nor a
    `checkInternet` that inherits such a `before()`. Its quick fix, which added
    `await super.before()`, was removed. The rule still reports the other overrides.
  * `dispatch-sync-async-action`, `expect-without-waiting`, `wait-fail-never-matches` and
    `reduce-without-await` now know that an action that sets `checkInternet` is async, even if
    it overrides `before()` with a sync method.

## 1.0.1

* Fixed the link to the Kiss docs in the README.

## 1.0.0

* First version, for Kiss 2.0.0, with 57 rules:

  * Components and hooks: `no-new-object-in-use-select`, `new-values-in-use-object`, `avoid-use-all-state`, `store-in-selector`, `dispatch-in-render`, `store-state-in-render`, `then-on-dispatch-and-wait`.
  * Reducers: `stale-state-after-await`, `prefer-state-parameter`, `no-state-mutation`, `reduce-without-await`, `prefer-return-null`.
  * Action methods and features: `async-after`, `after-throws`, `missing-super-in-override`, `lifecycle-method-call`, `retry-requires-async-reduce`, `retry-without-non-reentrant`, `async-feature-in-sync-action`, `incompatible-action-features`, `polling-with-caveat`, `polling-action-restarts-polling`, `server-push-associated-action`, `extend-base-action`, `dependencies-cast-in-action`, `avoid-abort-dispatch` (opt-in), `avoid-wrap-reduce` (opt-in), `missing-key-params` (opt-in).
  * Dispatching and waiting: `dispatch-sync-async-action`, `dispatch-same-action-twice`, `dispatch-before-store-ready`, `dispatch-in-effect`, `dispatch-and-wait-unlimited-retries`, `sequential-deadlock`, `wait-fail-never-matches`, `wait-condition-without-timeout`.
  * State classes: `state-class-must-be-immutable`, `prefer-readonly-collections`, `non-state-object-in-state`, `copy-missing-field`, `event-name-suffix`, `event-not-spent-initially`, `missing-initial-state` (opt-in), `route-in-state` (opt-in).
  * Errors: `user-exception-outside-action`, `user-exception-without-cause`, `throw-in-error-observer`, `error-observer-without-environment` (opt-in).
  * Tests and debugging: `expect-without-waiting`, `testing-feature-in-production`, `action-status-details-in-production`, `debug-observer-in-release`.
  * Naming: `action-name-ends-with-action` (opt-in), `action-name-ends-with-underscore-action` (opt-in), `action-name-without-action` (opt-in), `action-file-name-ends-with-action` (opt-in), `action-file-name-starts-with-action` (opt-in).

* The rules know the `LoadPages` base action:
  `incompatible-action-features` reports a `LoadPages` with `nonReentrant` or `ignoreOld`;
  `missing-super-in-override` reports a `reduce` or `statusKey` override in a `LoadPages`,
  an `abortDispatch` that doesn't call `super.abortDispatch()`, and an `ignoreFresh` or
  `ignoreThrottle` getter that doesn't read the `super` value; `missing-key-params` warns
  about a `LoadPages` with fields that doesn't override `pagesKeyParams`;
  `lifecycle-method-call` reports calls to its methods; `retry-without-non-reentrant` doesn't
  report it; and the naming rules check it as a concrete action, even without type
  information.
