import type { TSESLint } from '@typescript-eslint/utils';
import actionFileNameEndsWithAction from './rules/actionFileNameEndsWithAction.js';
import actionFileNameStartsWithAction from './rules/actionFileNameStartsWithAction.js';
import actionNameEndsWithAction from './rules/actionNameEndsWithAction.js';
import actionNameEndsWithUnderscoreAction from './rules/actionNameEndsWithUnderscoreAction.js';
import actionNameWithoutAction from './rules/actionNameWithoutAction.js';
import actionStatusDetailsInProduction from './rules/actionStatusDetailsInProduction.js';
import afterThrows from './rules/afterThrows.js';
import asyncAfter from './rules/asyncAfter.js';
import asyncFeatureInSyncAction from './rules/asyncFeatureInSyncAction.js';
import avoidAbortDispatch from './rules/avoidAbortDispatch.js';
import avoidUseAllState from './rules/avoidUseAllState.js';
import avoidWrapReduce from './rules/avoidWrapReduce.js';
import copyMissingField from './rules/copyMissingField.js';
import debugObserverInRelease from './rules/debugObserverInRelease.js';
import dispatchAndWaitUnlimitedRetries from './rules/dispatchAndWaitUnlimitedRetries.js';
import dispatchBeforeStoreReady from './rules/dispatchBeforeStoreReady.js';
import dispatchInEffect from './rules/dispatchInEffect.js';
import dispatchInRender from './rules/dispatchInRender.js';
import dispatchSameActionTwice from './rules/dispatchSameActionTwice.js';
import dispatchSyncAsyncAction from './rules/dispatchSyncAsyncAction.js';
import expectWithoutWaiting from './rules/expectWithoutWaiting.js';
import extendBaseAction from './rules/extendBaseAction.js';
import incompatibleActionFeatures from './rules/incompatibleActionFeatures.js';
import pollingWithCaveat from './rules/pollingWithCaveat.js';
import missingInitialState from './rules/missingInitialState.js';
import missingKeyParams from './rules/missingKeyParams.js';
import missingSuperInOverride from './rules/missingSuperInOverride.js';
import newValuesInUseObject from './rules/newValuesInUseObject.js';
import noNewObjectInUseSelect from './rules/noNewObjectInUseSelect.js';
import noStateMutation from './rules/noStateMutation.js';
import nonStateObjectInState from './rules/nonStateObjectInState.js';
import preferReadonlyCollections from './rules/preferReadonlyCollections.js';
import preferReturnNull from './rules/preferReturnNull.js';
import preferStateParameter from './rules/preferStateParameter.js';
import reduceWithoutAwait from './rules/reduceWithoutAwait.js';
import retryRequiresAsyncReduce from './rules/retryRequiresAsyncReduce.js';
import retryWithoutNonReentrant from './rules/retryWithoutNonReentrant.js';
import routeInState from './rules/routeInState.js';
import staleStateAfterAwait from './rules/staleStateAfterAwait.js';
import stateClassMustBeImmutable from './rules/stateClassMustBeImmutable.js';
import storeInSelector from './rules/storeInSelector.js';
import storeStateInRender from './rules/storeStateInRender.js';
import testingFeatureInProduction from './rules/testingFeatureInProduction.js';
import thenOnDispatchAndWait from './rules/thenOnDispatchAndWait.js';
import throwInErrorObserver from './rules/throwInErrorObserver.js';
import userExceptionOutsideAction from './rules/userExceptionOutsideAction.js';
import userExceptionWithoutCause from './rules/userExceptionWithoutCause.js';
import waitConditionWithoutTimeout from './rules/waitConditionWithoutTimeout.js';
import waitFailNeverMatches from './rules/waitFailNeverMatches.js';

const rules = {
  'no-new-object-in-use-select': noNewObjectInUseSelect,
  'new-values-in-use-object': newValuesInUseObject,
  'avoid-use-all-state': avoidUseAllState,
  'store-in-selector': storeInSelector,
  'dispatch-in-render': dispatchInRender,
  'store-state-in-render': storeStateInRender,
  'then-on-dispatch-and-wait': thenOnDispatchAndWait,
  'stale-state-after-await': staleStateAfterAwait,
  'prefer-state-parameter': preferStateParameter,
  'no-state-mutation': noStateMutation,
  'reduce-without-await': reduceWithoutAwait,
  'prefer-return-null': preferReturnNull,
  'async-after': asyncAfter,
  'after-throws': afterThrows,
  'missing-super-in-override': missingSuperInOverride,
  'retry-requires-async-reduce': retryRequiresAsyncReduce,
  'retry-without-non-reentrant': retryWithoutNonReentrant,
  'async-feature-in-sync-action': asyncFeatureInSyncAction,
  'incompatible-action-features': incompatibleActionFeatures,
  'polling-with-caveat': pollingWithCaveat,
  'extend-base-action': extendBaseAction,
  'avoid-abort-dispatch': avoidAbortDispatch,
  'avoid-wrap-reduce': avoidWrapReduce,
  'missing-key-params': missingKeyParams,
  'dispatch-sync-async-action': dispatchSyncAsyncAction,
  'dispatch-same-action-twice': dispatchSameActionTwice,
  'dispatch-before-store-ready': dispatchBeforeStoreReady,
  'dispatch-in-effect': dispatchInEffect,
  'dispatch-and-wait-unlimited-retries': dispatchAndWaitUnlimitedRetries,
  'wait-fail-never-matches': waitFailNeverMatches,
  'wait-condition-without-timeout': waitConditionWithoutTimeout,
  'state-class-must-be-immutable': stateClassMustBeImmutable,
  'prefer-readonly-collections': preferReadonlyCollections,
  'non-state-object-in-state': nonStateObjectInState,
  'copy-missing-field': copyMissingField,
  'missing-initial-state': missingInitialState,
  'route-in-state': routeInState,
  'user-exception-outside-action': userExceptionOutsideAction,
  'user-exception-without-cause': userExceptionWithoutCause,
  'throw-in-error-observer': throwInErrorObserver,
  'expect-without-waiting': expectWithoutWaiting,
  'testing-feature-in-production': testingFeatureInProduction,
  'action-status-details-in-production': actionStatusDetailsInProduction,
  'debug-observer-in-release': debugObserverInRelease,
  'action-name-ends-with-action': actionNameEndsWithAction,
  'action-name-ends-with-underscore-action': actionNameEndsWithUnderscoreAction,
  'action-name-without-action': actionNameWithoutAction,
  'action-file-name-ends-with-action': actionFileNameEndsWithAction,
  'action-file-name-starts-with-action': actionFileNameStartsWithAction,
};

const plugin = {
  meta: {
    name: 'eslint-plugin-kiss-for-react',
    version: '1.0.0',
  },
  rules,
  configs: {} as Record<string, TSESLint.FlatConfig.Config>,
};

/**
 * The recommended rules. Use it in your `eslint.config.js`:
 *
 * ```js
 * import kiss from 'eslint-plugin-kiss-for-react';
 * export default [kiss.configs.recommended];
 * ```
 *
 * The opt-in rules are not in it. Turn them on yourself, if you want them:
 * `avoid-abort-dispatch`, `avoid-wrap-reduce`, `missing-key-params`, `missing-initial-state`, `route-in-state`, `action-name-ends-with-action`, `action-name-ends-with-underscore-action`, `action-name-without-action`, `action-file-name-ends-with-action`, `action-file-name-starts-with-action`.
 */
plugin.configs.recommended = {
  name: 'kiss-for-react/recommended',
  plugins: {'kiss-for-react': plugin as unknown as TSESLint.FlatConfig.Plugin},
  rules: {
    'kiss-for-react/no-new-object-in-use-select': 'error',
    'kiss-for-react/new-values-in-use-object': 'warn',
    'kiss-for-react/avoid-use-all-state': 'warn',
    'kiss-for-react/store-in-selector': 'error',
    'kiss-for-react/dispatch-in-render': 'warn',
    'kiss-for-react/store-state-in-render': 'warn',
    'kiss-for-react/then-on-dispatch-and-wait': 'warn',
    'kiss-for-react/stale-state-after-await': 'error',
    'kiss-for-react/prefer-state-parameter': 'warn',
    'kiss-for-react/no-state-mutation': 'error',
    'kiss-for-react/reduce-without-await': 'warn',
    'kiss-for-react/prefer-return-null': 'warn',
    'kiss-for-react/async-after': 'error',
    'kiss-for-react/after-throws': 'warn',
    'kiss-for-react/missing-super-in-override': 'error',
    'kiss-for-react/retry-requires-async-reduce': 'error',
    'kiss-for-react/retry-without-non-reentrant': 'warn',
    'kiss-for-react/async-feature-in-sync-action': 'warn',
    'kiss-for-react/incompatible-action-features': 'error',
    'kiss-for-react/polling-with-caveat': 'error',
    'kiss-for-react/extend-base-action': 'warn',
    'kiss-for-react/dispatch-sync-async-action': 'error',
    'kiss-for-react/dispatch-same-action-twice': 'error',
    'kiss-for-react/dispatch-before-store-ready': 'error',
    'kiss-for-react/dispatch-in-effect': 'warn',
    'kiss-for-react/dispatch-and-wait-unlimited-retries': 'warn',
    'kiss-for-react/wait-fail-never-matches': 'warn',
    'kiss-for-react/wait-condition-without-timeout': 'warn',
    'kiss-for-react/state-class-must-be-immutable': 'warn',
    'kiss-for-react/prefer-readonly-collections': 'warn',
    'kiss-for-react/non-state-object-in-state': 'warn',
    'kiss-for-react/copy-missing-field': 'warn',
    'kiss-for-react/user-exception-outside-action': 'warn',
    'kiss-for-react/user-exception-without-cause': 'warn',
    'kiss-for-react/throw-in-error-observer': 'warn',
    'kiss-for-react/expect-without-waiting': 'warn',
    'kiss-for-react/testing-feature-in-production': 'warn',
    'kiss-for-react/action-status-details-in-production': 'warn',
    'kiss-for-react/debug-observer-in-release': 'warn',
  },
};

export default plugin;
