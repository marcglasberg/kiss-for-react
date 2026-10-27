import { afterEach, expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { OptimisticCommand, OptimisticSync, OptimisticSyncWithPush, ServerPush, PushMetadata, Store } from '../src';
import { Deferred } from './fixtures/deferred';

reporter(new FeatureFileReporter());

const feature = new Feature('Optimistic updates across server replies, cancellation and restarts');
const stores: Store<any>[] = [];

function newStore<St>(initialState: St): Store<St> {
  const store = new Store<St>({ initialState, logger: () => {} });
  stores.push(store);
  return store;
}

// Every deferred response is resolved and every action is awaited before assertions.
// Disposal also runs when an assertion reports one of the defects under investigation.
afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.dispose()));
});

class SaveNumber extends OptimisticSync<number, number> {
  constructor(readonly value: number, readonly requests: number[], readonly response: Deferred<number>) { super(); }
  valueToApply() { return this.value; }
  getValueFromState(state: number) { return state; }
  applyOptimisticValueToState(_state: number, value: number) { return value; }
  applyServerResponseToState(_state: number, value: number) { return value; }
  async sendValueToServer(value: number) { this.requests.push(value); return this.response.promise; }
}

Bdd(feature)
  .scenario('A save triggered by an applied server response reaches the server.')
  .given('A save request is running, and another save waits for the server-normalized state.')
  .and('The server normalizes the first value to 10, and keeps the other values.')
  .when('The server response causes the second save to be dispatched.')
  .then('The second value is sent to the server.')
  .and('Both saves complete successfully, with the second value in the state.')
  .run(async () => {
    // Each request gets the response for the value it sends, whichever action sends it.
    class NormalizedSave extends SaveNumber {
      async sendValueToServer(value: number) {
        this.requests.push(value);
        return (value === 1) ? this.response.promise : value;
      }
    }
    const store = newStore(0);
    const requests: number[] = [];
    const firstResponse = new Deferred<number>();
    const second = new NormalizedSave(20, requests, firstResponse);
    store.dispatchWhen(second, state => state === 10, { timeoutMillis: 0 });
    const first = new NormalizedSave(1, requests, firstResponse);
    const firstDone = store.dispatchAndWait(first);
    const pendingState = store.state;
    const pendingRequests = [...requests];
    const secondHadStarted = second.status.isDispatched;
    firstResponse.resolve(10);
    const status = await firstDone;
    await store.waitAllActions(null, { completeImmediately: true, timeoutMillis: 1000 });
    expect(pendingState).toBe(1);
    expect(pendingRequests).toEqual([1]);
    expect(secondHadStarted).toBe(false);
    expect(status.isCompletedOk).toBe(true);
    expect(second.status.isCompletedOk).toBe(true);
    expect(store.isWaiting(SaveNumber)).toBe(false);
    expect(store.state).toBe(20);
    expect(requests).toEqual([1, 20]);
  });

Bdd(feature)
  .scenario('An aborted optimistic command does not apply its later server response.')
  .given('An optimistic command is waiting for the server.')
  .when('The command is aborted before the server response arrives.')
  .then('The response does not change the state.')
  .and('The command finishes as aborted, without a failure or a running request.')
  .run(async () => {
    const response = new Deferred<number>();
    class Save extends OptimisticCommand<number, number> {
      optimisticValue() { return 1; }
      getValueFromState(state: number) { return state; }
      applyValueToState(_state: number, value: number) { return value; }
      applyServerResponseToState(_state: number, value: number) { return value; }
      sendCommandToServer() { return response.promise; }
    }
    const store = newStore(0);
    const action = new Save();
    const done = store.dispatchAndWait(action);
    const pendingState = store.state;
    const wasWaiting = store.isWaiting(Save);
    action.abort();
    response.resolve(2);
    const status = await done;
    expect(pendingState).toBe(1);
    expect(wasWaiting).toBe(true);
    expect(status.isDispatchAborted).toBe(true);
    expect(action.isAborted).toBe(true);
    expect(store.isWaiting(Save)).toBe(false);
    expect(store.isFailed(Save)).toBe(false);
    expect(store.state).toBe(1);
  });

Bdd(feature)
  .scenario('An aborted optimistic save does not send a follow-up or apply its response.')
  .given('Two local values are coalesced while the first save request runs.')
  .when('The running save is aborted and its response later arrives.')
  .then('No further server request runs, and the response does not overwrite the local value.')
  .and('The running save finishes as aborted, without a failure.')
  .run(async () => {
    const store = newStore(0);
    const response = new Deferred<number>();
    const requests: number[] = [];
    const action = new SaveNumber(1, requests, response);
    const done = store.dispatchAndWait(action);
    const secondStatus = await store.dispatchAndWait(new SaveNumber(2, requests, response));
    const pendingState = store.state;
    const pendingRequests = [...requests];
    action.abort();
    response.resolve(10);
    const status = await done;
    expect(secondStatus.isCompletedOk).toBe(true);
    expect(pendingState).toBe(2);
    expect(pendingRequests).toEqual([1]);
    expect(status.isDispatchAborted).toBe(true);
    expect(store.isWaiting(SaveNumber)).toBe(false);
    expect(store.isFailed(SaveNumber)).toBe(false);
    expect(requests).toEqual([1]);
    expect(store.state).toBe(2);
  });

type ValueState = { value: number; revision: number };
type Response = { value: number; revision: number };
class SaveWithPush extends OptimisticSyncWithPush<ValueState, number> {
  constructor(readonly value: number, readonly responses: Deferred<Response>[], readonly requests: number[]) { super(); }
  valueToApply() { return this.value; }
  getValueFromState(state: ValueState) { return state.value; }
  applyOptimisticValueToState(state: ValueState, value: number) { return { ...state, value }; }
  getServerRevisionFromState(state: ValueState) { return state.revision; }
  async sendValueToServer(value: number) {
    const requestIndex = this.requests.length;
    this.requests.push(value);
    const response = await this.responses[requestIndex].promise;
    this.informServerRevision(response.revision);
    return response.value;
  }
  applyServerResponseToState(state: ValueState, value: number) { return { ...state, value }; }
}
class Push extends ServerPush<ValueState> {
  constructor(readonly value: number, readonly metadata: PushMetadata) { super(); }
  associatedAction() { return SaveWithPush; }
  pushMetadata() { return this.metadata; }
  getServerRevisionFromState(state: ValueState) { return state.revision; }
  applyServerPushToState(_state: ValueState, _key: any, revision: number) { return { value: this.value, revision }; }
}

Bdd(feature)
  .scenario('A confirmed server revision remains available after the store is recreated.')
  .given('A local save succeeds before the server sends the echo of the save.')
  .when('The echo arrives, and a new store starts with the saved state.')
  .and('An older server update arrives in the new store.')
  .then('The older update cannot overwrite the confirmed value.')
  .and('The restarted state keeps the server revision of the successful save.')
  .run(async () => {
    const store = newStore<ValueState>({ value: 0, revision: 5 });
    const response = new Deferred<Response>();
    response.resolve({ value: 1, revision: 11 });
    const requests: number[] = [];
    const status = await store.dispatchAndWait(new SaveWithPush(1, [response], requests));
    const echo = new Push(1, { serverRevision: 11, localRevision: 1, deviceId: OptimisticSyncWithPush.deviceId() });
    store.dispatchSync(echo);
    const savedState = store.state;
    const restarted = newStore<ValueState>(savedState);
    const stalePush = new Push(0, { serverRevision: 10, localRevision: 1, deviceId: OptimisticSyncWithPush.deviceId() + 1 });
    restarted.dispatchSync(stalePush);
    expect(status.isCompletedOk).toBe(true);
    expect(requests).toEqual([1]);
    expect(savedState.value).toBe(1);
    expect(echo.status.isCompletedOk).toBe(true);
    expect(stalePush.status.isCompletedOk).toBe(true);
    expect(restarted.state).toEqual({ value: 1, revision: 11 });
  });

Bdd(feature)
  .scenario('An old self echo cannot make a follow-up send an outdated pushed value.')
  .given('Two local saves are followed by a remote push that is older than the first request.')
  .when('The first request echo arrives before its response.')
  .then('The follow-up sends the latest local value.')
  .and('Both local saves finish successfully, and no save remains in progress.')
  .run(async () => {
    const store = newStore<ValueState>({ value: 0, revision: 5 });
    const responses = [new Deferred<Response>(), new Deferred<Response>()];
    responses[1].resolve({ value: 2, revision: 12 });
    const requests: number[] = [];
    const done = store.dispatchAndWait(new SaveWithPush(1, responses, requests));
    const secondStatus = await store.dispatchAndWait(new SaveWithPush(2, responses, requests));
    const localState = store.state;
    store.dispatch(new Push(3, { serverRevision: 10, localRevision: 9, deviceId: OptimisticSyncWithPush.deviceId() + 1 }));
    const stateBeforeResponse = store.state;
    store.dispatch(new Push(1, { serverRevision: 11, localRevision: 1, deviceId: OptimisticSyncWithPush.deviceId() }));
    responses[0].resolve({ value: 1, revision: 11 });
    const status = await done;
    expect(localState.value).toBe(2);
    expect(stateBeforeResponse.value).toBe(3);
    expect(status.isCompletedOk).toBe(true);
    expect(secondStatus.isCompletedOk).toBe(true);
    expect(store.isWaiting(SaveWithPush)).toBe(false);
    expect(requests).toEqual([1, 2]);
  });

Bdd(feature)
  .scenario('Without the old self echo the latest local value reaches the server.')
  .given('Two local saves are followed by a remote push that is older than the first request.')
  .when('The first request response arrives without the echo arriving first.')
  .then('The follow-up sends the latest local value.')
  .and('The local state returns to the latest local value, and both saves finish successfully.')
  .run(async () => {
    const store = newStore<ValueState>({ value: 0, revision: 5 });
    const responses = [new Deferred<Response>(), new Deferred<Response>()];
    responses[1].resolve({ value: 2, revision: 12 });
    const requests: number[] = [];
    const done = store.dispatchAndWait(new SaveWithPush(1, responses, requests));
    const secondStatus = await store.dispatchAndWait(new SaveWithPush(2, responses, requests));
    const localState = store.state;
    store.dispatch(new Push(3, { serverRevision: 10, localRevision: 9, deviceId: OptimisticSyncWithPush.deviceId() + 1 }));
    const stateBeforeResponse = store.state;
    responses[0].resolve({ value: 1, revision: 11 });
    const status = await done;
    expect(localState.value).toBe(2);
    expect(stateBeforeResponse.value).toBe(3);
    expect(status.isCompletedOk).toBe(true);
    expect(secondStatus.isCompletedOk).toBe(true);
    expect(store.isWaiting(SaveWithPush)).toBe(false);
    expect(requests).toEqual([1, 2]);
    expect(store.state.value).toBe(2);
  });

Bdd(feature)
  .scenario('An optimistic save with push sends a value dispatched when its server response is applied.')
  .given('A save request runs and a second save waits for the normalized response.')
  .when('The server response causes the second save to be dispatched.')
  .then('The second value is sent to the server.')
  .and('Both saves complete successfully, with the second value in the state.')
  .run(async () => {
    const store = newStore<ValueState>({ value: 0, revision: 5 });
    const responses = [new Deferred<Response>(), new Deferred<Response>()];
    responses[1].resolve({ value: 20, revision: 12 });
    const requests: number[] = [];
    const second = new SaveWithPush(20, responses, requests);
    store.dispatchWhen(second, state => state.value === 10, { timeoutMillis: 0 });
    const done = store.dispatchAndWait(new SaveWithPush(1, responses, requests));
    const pendingState = store.state;
    const pendingRequests = [...requests];
    const secondHadStarted = second.status.isDispatched;
    responses[0].resolve({ value: 10, revision: 11 });
    const status = await done;
    await store.waitAllActions(null, { completeImmediately: true, timeoutMillis: 1000 });
    expect(pendingState.value).toBe(1);
    expect(pendingRequests).toEqual([1]);
    expect(secondHadStarted).toBe(false);
    expect(status.isCompletedOk).toBe(true);
    expect(second.status.isCompletedOk).toBe(true);
    expect(store.isWaiting(SaveWithPush)).toBe(false);
    expect(store.state.value).toBe(20);
    expect(requests).toEqual([1, 20]);
  });

Bdd(feature)
  .scenario('An aborted optimistic save with push does not send a follow-up or apply its response.')
  .given('Two local values are coalesced while the first save request runs.')
  .when('The store aborts the save and its response later arrives.')
  .then('No further server request runs, and the response does not overwrite the local value.')
  .and('The running save finishes as aborted, without a failure.')
  .run(async () => {
    const store = newStore<ValueState>({ value: 0, revision: 5 });
    const responses = [new Deferred<Response>(), new Deferred<Response>()];
    responses[1].resolve({ value: 10, revision: 12 });
    const requests: number[] = [];
    const action = new SaveWithPush(1, responses, requests);
    const done = store.dispatchAndWait(action);
    const secondStatus = await store.dispatchAndWait(new SaveWithPush(2, responses, requests));
    const pendingState = store.state;
    const pendingRequests = [...requests];
    store.abort(SaveWithPush);
    responses[0].resolve({ value: 10, revision: 11 });
    const status = await done;
    expect(secondStatus.isCompletedOk).toBe(true);
    expect(pendingState.value).toBe(2);
    expect(pendingRequests).toEqual([1]);
    expect(status.isDispatchAborted).toBe(true);
    expect(store.isWaiting(SaveWithPush)).toBe(false);
    expect(store.isFailed(SaveWithPush)).toBe(false);
    expect(requests).toEqual([1]);
    expect(store.state.value).toBe(2);
  });

Bdd(feature)
  .scenario('An aborted optimistic command does not roll back or reload when its request fails.')
  .given('An optimistic command, which can reload from the server, is waiting for the server.')
  .when('The command is aborted, and then its server request fails.')
  .then('The state keeps the optimistic value, and nothing is reloaded.')
  .and('The command finishes as aborted, without a failure.')
  .run(async () => {
    const response = new Deferred<number>();
    let reloads = 0;
    class Save extends OptimisticCommand<number, number> {
      optimisticValue() { return 1; }
      getValueFromState(state: number) { return state; }
      applyValueToState(_state: number, value: number) { return value; }
      sendCommandToServer() { return response.promise; }
      async reloadFromServer() { reloads++; return 5; }
    }
    const store = newStore(0);
    const action = new Save();
    const done = store.dispatchAndWait(action);
    action.abort();
    response.reject(new Error('The server is not available.'));
    const status = await done;
    expect(status.isDispatchAborted).toBe(true);
    expect(store.isFailed(Save)).toBe(false);
    expect(reloads).toBe(0);
    expect(store.state).toBe(1);
  });

Bdd(feature)
  .scenario('An aborted optimistic command with retry does not send its command again.')
  .given('An optimistic command with retry, whose request is cancelled by the abort signal of the command.')
  .when('The command is aborted while its request runs.')
  .then('The command is not sent again, and the state keeps the optimistic value.')
  .and('The command finishes as aborted, with the abort message of the command.')
  .run(async () => {
    let calls = 0;
    class Save extends OptimisticCommand<number, number> {
      retry = { initialDelay: 1, maxRetries: 3 };
      optimisticValue() { return 1; }
      getValueFromState(state: number) { return state; }
      applyValueToState(_state: number, value: number) { return value; }
      sendCommandToServer() {
        calls++;
        return new Promise<number>((_, reject) =>
          this.abortSignal.addEventListener('abort', () => reject(this.abortSignal.reason)));
      }
    }
    const store = newStore(0);
    const action = new Save();
    const done = store.dispatchAndWait(action);
    action.abort();
    const status = await done;
    expect(calls).toBe(1);
    expect(status.isDispatchAborted).toBe(true);
    expect(status.originalError?.message).toBe('The action was aborted by abort().');
    expect(store.isFailed(Save)).toBe(false);
    expect(store.state).toBe(1);
  });

Bdd(feature)
  .scenario('An aborted optimistic save does not run onFinish when its request is cancelled.')
  .given('An optimistic save whose request is cancelled by the abort signal of the save.')
  .and('Its onFinish rolls back the value when the request fails.')
  .when('The save is aborted while its request runs.')
  .then('onFinish does not run, and the state keeps the optimistic value.')
  .and('The save finishes as aborted, without a failure.')
  .and('A new save of the same value sends its request.')
  .run(async () => {
    const finishErrors: any[] = [];
    class CancellableSave extends SaveNumber {
      async sendValueToServer(value: number) {
        this.requests.push(value);
        if (value === 1) await new Promise<void>((_, reject) =>
          this.abortSignal.addEventListener('abort', () => reject(this.abortSignal.reason)));
        return this.response.promise;
      }
      onFinish(error: any) {
        finishErrors.push(error);
        return (error === null) ? null : 0;
      }
    }
    const store = newStore(0);
    const requests: number[] = [];
    const response = new Deferred<number>();
    response.resolve(3);
    const action = new CancellableSave(1, requests, response);
    const done = store.dispatchAndWait(action);
    action.abort();
    const status = await done;
    const stateAfterAbort = store.state;
    const finishErrorsAfterAbort = [...finishErrors];
    const nextStatus = await store.dispatchAndWait(new CancellableSave(3, requests, response));
    expect(status.isDispatchAborted).toBe(true);
    expect(store.isFailed(CancellableSave)).toBe(false);
    expect(finishErrorsAfterAbort).toEqual([]);
    expect(stateAfterAbort).toBe(1);
    expect(nextStatus.isCompletedOk).toBe(true);
    expect(requests).toEqual([1, 3]);
    expect(store.state).toBe(3);
  });

Bdd(feature)
  .scenario('A late echo of an older request does not overwrite a newer local value.')
  .given('A local save finished, and its server response had revision 11.')
  .and('A newer local save is waiting for the server.')
  .when('The echo of the first save arrives, also with revision 11.')
  .then('The echo is not applied, and the state keeps the newer local value.')
  .and('The newer local save finishes with its value in the state.')
  .run(async () => {
    const store = newStore<ValueState>({ value: 0, revision: 5 });
    const responses = [new Deferred<Response>(), new Deferred<Response>()];
    responses[0].resolve({ value: 1, revision: 11 });
    const requests: number[] = [];
    await store.dispatchAndWait(new SaveWithPush(1, responses, requests));
    const done = store.dispatchAndWait(new SaveWithPush(2, responses, requests));
    const echo = new Push(1, { serverRevision: 11, localRevision: 1, deviceId: OptimisticSyncWithPush.deviceId() });
    store.dispatchSync(echo);
    const stateAfterEcho = store.state;
    responses[1].resolve({ value: 2, revision: 12 });
    const status = await done;
    expect(echo.status.isCompletedOk).toBe(true);
    expect(stateAfterEcho).toEqual({ value: 2, revision: 5 });
    expect(status.isCompletedOk).toBe(true);
    expect(requests).toEqual([1, 2]);
    expect(store.state.value).toBe(2);
  });

Bdd(feature)
  .scenario('An echo whose server revision is already in the state is not applied again.')
  .given('The state already has the server revision of the latest local save.')
  .when('The echo of that save arrives.')
  .then('The echo is not applied again.')
  .run(async () => {
    let applied = 0;
    class CountingPush extends Push {
      applyServerPushToState(state: ValueState, key: any, revision: number) {
        applied++;
        return super.applyServerPushToState(state, key, revision);
      }
    }
    const store = newStore<ValueState>({ value: 0, revision: 5 });
    const response = new Deferred<Response>();
    response.resolve({ value: 1, revision: 11 });
    await store.dispatchAndWait(new SaveWithPush(1, [response], []));
    const deviceId = OptimisticSyncWithPush.deviceId();
    store.dispatchSync(new CountingPush(1, { serverRevision: 11, localRevision: 1, deviceId }));
    const stateAfterFirstEcho = store.state;
    store.dispatchSync(new CountingPush(1, { serverRevision: 11, localRevision: 1, deviceId }));
    expect(stateAfterFirstEcho).toEqual({ value: 1, revision: 11 });
    expect(applied).toBe(1);
    expect(store.state).toBe(stateAfterFirstEcho);
  });
