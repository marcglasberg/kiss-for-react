# Changelog

## 1.0.0

* First version, with 48 rules:

  * Components and hooks: `no-new-object-in-use-select`, `new-values-in-use-object`, `avoid-use-all-state`, `store-in-selector`, `dispatch-in-render`, `store-state-in-render`, `then-on-dispatch-and-wait`.
  * Reducers: `stale-state-after-await`, `prefer-state-parameter`, `no-state-mutation`, `reduce-without-await`, `prefer-return-null`.
  * Action methods and features: `async-after`, `after-throws`, `missing-super-in-override`, `retry-requires-async-reduce`, `retry-without-non-reentrant`, `async-feature-in-sync-action`, `incompatible-action-features`, `polling-with-caveat`, `extend-base-action`, `avoid-abort-dispatch` (opt-in), `avoid-wrap-reduce` (opt-in), `missing-key-params` (opt-in).
  * Dispatching and waiting: `dispatch-sync-async-action`, `dispatch-same-action-twice`, `dispatch-before-store-ready`, `dispatch-and-wait-unlimited-retries`, `wait-fail-never-matches`, `wait-condition-without-timeout`.
  * State classes: `state-class-must-be-immutable`, `prefer-readonly-collections`, `non-state-object-in-state`, `copy-missing-field`, `missing-initial-state` (opt-in), `route-in-state` (opt-in).
  * Errors: `user-exception-outside-action`, `user-exception-without-cause`, `throw-in-error-observer`.
  * Tests and debugging: `expect-without-waiting`, `testing-feature-in-production`, `action-status-details-in-production`, `debug-observer-in-release`.
  * Naming: `action-name-ends-with-action` (opt-in), `action-name-ends-with-underscore-action` (opt-in), `action-name-without-action` (opt-in), `action-file-name-ends-with-action` (opt-in), `action-file-name-starts-with-action` (opt-in).
