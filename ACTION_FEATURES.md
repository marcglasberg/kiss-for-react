# Action features

Built-in features you can add to actions, as listed in the README section
"Add features to your actions".

## Implemented

| Feature | How to use it |
|---|---|
| **NonReentrant** | `nonReentrant = true`. Narrow it with `nonReentrantKeyParams()`, or make different action classes share a key with `computeNonReentrantKey()`. |
| **Retry** | `retry = {on: true}`, or a policy: `{initialDelay, maxRetries, multiplier, maxDelay}`. Uses exponential backoff. |
| **Debounce** | `debounce = 300` (milliseconds), or `debounce = true` for the default 333. Each dispatch resets the wait, and only the last action runs its reducer. Share a lock with `debounceLockBuilder()`, and clear all locks with `removeAllDebounceLocks()`. Can't be combined with `retry` or `OptimisticCommand`. |
| **Throttle** | `throttle = 5000` (milliseconds), or `throttle = true` for the default 1000. Runs at most once per throttle period, and dispatches inside the period are aborted. `ignoreThrottle` forces a run (and starts a new period). The lock is kept if the action fails, unless `removeThrottleLockOnError = true`. Share a lock with `throttleLockBuilder()`, and remove locks with `removeThrottleLock()` / `removeAllThrottleLocks()`. Can't be combined with `nonReentrant` or `OptimisticCommand`. |
| **Fresh** | `fresh = 5000` (milliseconds), or `fresh = true` for the default 1000. When the action runs, its result is fresh for that period (counted from the dispatch), per key, and dispatches while fresh are aborted. Separate keys with `freshKeyParams()`, or make different action classes share a key with `computeFreshKey()`. `ignoreFresh` forces a run (and starts a new period). If the action fails, its key is removed, unless a newer action took it. Remove keys with `removeFreshKey()` / `removeAllFreshKeys()`. Can't be combined with `nonReentrant`, `throttle` or `OptimisticCommand`. |
| **Sequential** | `sequential = true`. Runs actions one at a time, in the order they were dispatched, through a shared FIFO queue. Separate queues with `sequentialKeyParams()`. Return `true` from `discardQueueOnError()` to discard the waiting actions when one fails (they finish with an `AbortDispatchException`). Waiting actions count as in progress. Always ASYNC, so it can't be dispatched with `dispatchSync`. Can't be combined with `debounce`. |
| **CheckInternet** | `checkInternet = { dialog: true \| false }`. The default `before()` checks the connection and throws a `UserException` if offline. In tests, simulate the connection with `store.forceInternetOnOffSimulation`, or per action with `internetOnOffSimulation`. |
| **AbortWhenNoInternet** | `checkInternet = { abort: true }`. The default `before()` checks the connection and throws an `AbortDispatchException` if offline, so the action aborts silently: no error, no dialog, and it doesn't count as failed. Can't be combined with `dialog`. |
| **UnlimitedRetryCheckInternet** | `unlimitedRetryCheckInternet = true`, or an object to change `{initialDelay, multiplier, maxDelay, maxDelayNoInternet}` (defaults 350, 2, 5000 and 1000). Checks the internet (`hasInternet()`) before each attempt: if offline, the reducer doesn't run, and it retries unlimited times until there is internet. Also retries unlimited times when it fails with internet. Non-reentrant for the whole time until it succeeds, sharing the keys of `nonReentrant` (`nonReentrantKeyParams()`, `computeNonReentrantKey()`). Retries are logged. Needs an ASYNC reducer. (Plain `retry` + `checkInternet` doesn't retry when offline.) Can't be combined with any other feature in the matrix. |
| **OptimisticCommand** | Extend `OptimisticCommand<St, T>` (a base class, not a property) and implement `optimisticValue`, `getValueFromState`, `applyValueToState`, `sendCommandToServer`, and optionally `reloadFromServer`. |
| **OptimisticSync** | Extend `OptimisticSync<St, T>` (a base class, not a property) and implement `valueToApply`, `applyOptimisticValueToState`, `getValueFromState`, `sendValueToServer`, and optionally `applyServerResponseToState` and `onFinish`. For rapid toggles like a "like" button: every dispatch applies its value to the state at once, but only one request per key is in flight. When it finishes, if the state changed, a follow-up request sends the latest value, repeating until the state stabilizes. Separate keys with `optimisticSyncKeyParams()`, or make different action classes share a key with `computeOptimisticSyncKey()`. Customize the follow-ups with `ifShouldSendAnotherRequest` and `maxFollowUpRequests` (default 10000). Can only be combined with `checkInternet`. |
| **Polling** | A `poll` property (usually a constructor parameter) with `Poll.start`, `Poll.stop`, `Poll.runNowAndRestart` or `Poll.once`, plus `createPollingAction()`, which returns the action each tick dispatches. `pollInterval` (milliseconds, default 10000). By default each tick waits for the previous run to finish, so runs never overlap; set `pollWaitsForRun = false` for a fixed rate. Separate timers with `pollingKeyParams()`, or make different action classes share one with `computePollingKey()`. Stop all with `stopAllPolling()` (also stopped by `store.clearInternalActionProps()` and `store.setShutDown(true)`). Can't be combined with `retry`, `debounce` or `OptimisticCommand`. |

## Compatibility matrix

Which features can be used together in the same action. ❌ means the combination is not
allowed: dispatching the action throws a `StoreException`. The ESLint plugin's
`incompatible-action-features` rule reports these combinations in the editor.

|                       | NonReentrant | Retry | CheckInternet | Debounce | Throttle | Fresh | Sequential | OptimisticCommand | OptimisticSync | Polling | UnlimitedRetryCheckInternet |
|-----------------------|:------------:|:-----:|:-------------:|:--------:|:--------:|:-----:|:----------:|:-----------------:|:--------------:|:-------:|:---------------------------:|
| **NonReentrant**      |      —       |  ✅   |      ✅       |    ✅    |    ❌    |  ❌   |     ✅     |       ❌ ¹        |       ❌       |  ✅ ³   |            ❌ ⁴             |
| **Retry**             |      ✅      |   —   |      ✅       |    ❌    |    ✅    |  ✅   |     ✅     |       ✅ ²        |       ❌       |   ❌    |            ❌ ⁴             |
| **CheckInternet**     |      ✅      |  ✅   |       —       |    ✅    |    ✅    |  ✅   |     ✅     |        ✅         |       ✅       |  ✅ ³   |            ❌ ⁴             |
| **Debounce**          |      ✅      |  ❌   |      ✅       |    —     |    ✅    |  ✅   |     ❌     |        ❌         |       ❌       |   ❌    |             ❌              |
| **Throttle**          |      ❌      |  ✅   |      ✅       |    ✅    |    —     |  ❌   |     ✅     |        ❌         |       ❌       |  ✅ ³   |             ❌              |
| **Fresh**             |      ❌      |  ✅   |      ✅       |    ✅    |    ❌    |   —   |     ✅     |        ❌         |       ❌       |  ✅ ³   |             ❌              |
| **Sequential**        |      ✅      |  ✅   |      ✅       |    ❌    |    ✅    |  ✅   |     —      |        ✅         |      ❌ ⁶      |  ✅ ³   |            ❌ ⁵             |
| **OptimisticCommand** |     ❌ ¹     | ✅ ²  |      ✅       |    ❌    |    ❌    |  ❌   |     ✅     |         —         |      ❌ ⁷      |   ❌    |             ❌              |
| **OptimisticSync**    |      ❌      |  ❌   |      ✅       |    ❌    |    ❌    |  ❌   |    ❌ ⁶    |       ❌ ⁷        |       —        |   ❌    |             ❌              |
| **Polling**           |     ✅ ³     |  ❌   |     ✅ ³      |    ❌    |   ✅ ³   | ✅ ³  |    ✅ ³    |        ❌         |       ❌       |    —    |            ❌ ³             |
| **UnlimitedRetryCheckInternet** | ❌ ⁴ | ❌ ⁴ |     ❌ ⁴      |    ❌    |    ❌    |  ❌   |    ❌ ⁵    |        ❌         |       ❌       |  ❌ ³   |              —              |

1. `OptimisticCommand` is already non-reentrant, so it can't set `nonReentrant`.
2. Only `sendCommandToServer` is retried. Unlimited retries (`maxRetries: -1` or
   `unlimitedRetries: true`) are not allowed, since a command that never finishes would
   never release its non-reentrant key.
3. Allowed, but these features should be added to the action returned by
   `createPollingAction()` (the tick), and not to the action that starts and stops the polling.
   Otherwise, a `Poll.stop` may itself be aborted or fail, and the polling can't be stopped.
   The ESLint plugin's `polling-with-caveat` rule reports them.
   For `unlimitedRetryCheckInternet`, adding it to the polling action itself throws, but adding
   it to the tick is allowed.
4. `unlimitedRetryCheckInternet` already retries, checks the internet, and is non-reentrant.
   Note `retry` plus `checkInternet` doesn't retry when there is no internet, since
   `before()` is not retried. Use `unlimitedRetryCheckInternet` for that.
5. It aborts the dispatch while another action with the same key is in progress (and a queued
   action counts as in progress), so two actions of the same class would never queue behind
   each other. It would also retry forever while holding the queue.
6. `OptimisticSync` needs dispatches to overlap: it applies the optimistic value as soon as the
   action is dispatched, and coalesces the dispatches made while a request is in flight into a
   single follow-up request. With `sequential`, the UI would stop responding immediately, and
   nothing would ever be coalesced. `OptimisticSync` already sends a single request per key at
   a time, so it doesn't need `sequential` to serialize the requests.
7. Both are base classes, so an action can't extend both.

Other restrictions:
- `retry` and `unlimitedRetryCheckInternet` need an ASYNC reducer. With a SYNC reducer, the
  dispatch fails with a `StoreException`.
- A `debounce` action is always ASYNC, so it can't be dispatched with `dispatchSync`.
- A `sequential` action is always ASYNC, so it can't be dispatched with `dispatchSync`.

## Clearing the features

The store keeps the internal information of the features (fresh keys, throttle and debounce
locks, polling timers, sequential queues, and `OptimisticSync` keys).
`store.clearInternalActionProps()` clears all of it, which is useful on logout, and
`store.setShutDown(true)` calls it too. It's the Kiss version of AsyncRedux's
`store.internalMixinProps.clear()`, except it also discards the actions waiting in sequential
queues, so they don't run after the logout, and stops the actions that retry (`retry` and
`unlimitedRetryCheckInternet`), so they don't keep retrying for the previous user. Also, an
`OptimisticSync` whose request was in flight stops when the request finishes, without sending
follow-up requests (it's aborted, so it doesn't fail). `nonReentrant` keys are not cleared
directly, since they belong to the actions that are running, but stopping a retrying action
releases its key.

## Candidates from AsyncRedux

These AsyncRedux mixins (`async_redux/lib/src/action_mixins.dart`) don't exist in Kiss yet,
and would also make sense in Kiss. The "Possible Kiss form" column is only a suggestion.

| Feature | What it does | Possible Kiss form |
|---|---|---|
| **OptimisticSyncWithPush** | Like OptimisticSync, but uses revision tracking so it works with server pushes (WebSockets, SSE, Firebase) without stale pushes overwriting local optimistic changes. | Base class `OptimisticSyncWithPush<St, T>` |
| **ServerPush** | For actions that put values received by server push into the state. Works with OptimisticSyncWithPush so out-of-order or stale pushes don't corrupt the state. | Base class `ServerPush<St>` |

AsyncRedux's `NoDialog` and `UnlimitedRetries` aren't listed because Kiss already covers them
with `checkInternet = { dialog: false }` and `retry = { maxRetries: -1 }`.
