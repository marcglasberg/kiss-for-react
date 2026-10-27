import { expect } from '@jest/globals';
import { Bdd, Feature } from 'easy-bdd-tool-jest';
import { OptimisticCommand, OptimisticSync, OptimisticSyncWithPush, ServerPush, PushMetadata, Store } from '../src';

const feature = new Feature('Optimistic audit reproductions');
class Deferred<T> {
  resolve!: (value: T) => void;
  reject!: (error: any) => void;
  promise = new Promise<T>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
}

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
  .when('The server response causes the second save to be dispatched.')
  .then('The second value is sent to the server.')
  .run(async () => {
    const store = new Store({ initialState: 0, logger: () => {} });
    const requests: number[] = [];
    const firstResponse = new Deferred<number>();
    const secondResponse = new Deferred<number>();
    secondResponse.resolve(20);
    const second = new SaveNumber(20, requests, secondResponse);
    store.dispatchWhen(second, state => state === 10, { timeoutMillis: 0 });
    const firstDone = store.dispatchAndWait(new SaveNumber(1, requests, firstResponse));
    firstResponse.resolve(10);
    await firstDone;
    expect(store.state).toBe(20);
    expect(requests).toEqual([1, 20]);
  });

Bdd(feature)
  .scenario('An aborted optimistic command does not apply its later server response.')
  .given('An optimistic command is waiting for the server.')
  .when('The command is aborted before the server response arrives.')
  .then('The response does not change the state.')
  .run(async () => {
    const response = new Deferred<number>();
    class Save extends OptimisticCommand<number, number> {
      optimisticValue() { return 1; }
      getValueFromState(state: number) { return state; }
      applyValueToState(_state: number, value: number) { return value; }
      applyServerResponseToState(_state: number, value: number) { return value; }
      sendCommandToServer() { return response.promise; }
    }
    const store = new Store({ initialState: 0, logger: () => {} });
    const action = new Save();
    const done = store.dispatchAndWait(action);
    action.abort();
    response.resolve(2);
    expect((await done).isDispatchAborted).toBe(true);
    expect(store.state).toBe(1);
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
  .run(async () => {
    const store = new Store<ValueState>({ initialState: { value: 0, revision: 5 }, logger: () => {} });
    const response = new Deferred<Response>();
    response.resolve({ value: 1, revision: 11 });
    await store.dispatchAndWait(new SaveWithPush(1, [response], []));
    store.dispatch(new Push(1, { serverRevision: 11, localRevision: 1, deviceId: OptimisticSyncWithPush.deviceId() }));
    const restarted = new Store<ValueState>({ initialState: store.state, logger: () => {} });
    restarted.dispatch(new Push(0, { serverRevision: 10, localRevision: 1, deviceId: OptimisticSyncWithPush.deviceId() + 1 }));
    expect(restarted.state).toEqual({ value: 1, revision: 11 });
  });

Bdd(feature)
  .scenario('An old self echo cannot make a follow-up send an outdated pushed value.')
  .given('Two local saves are followed by a remote push that is older than the first request.')
  .when('The first request echo arrives before its response.')
  .then('The follow-up sends the latest local value.')
  .run(async () => {
    const store = new Store<ValueState>({ initialState: { value: 0, revision: 5 }, logger: () => {} });
    const responses = [new Deferred<Response>(), new Deferred<Response>()];
    responses[1].resolve({ value: 2, revision: 12 });
    const requests: number[] = [];
    const done = store.dispatchAndWait(new SaveWithPush(1, responses, requests));
    await store.dispatchAndWait(new SaveWithPush(2, responses, requests));
    store.dispatch(new Push(3, { serverRevision: 10, localRevision: 9, deviceId: OptimisticSyncWithPush.deviceId() + 1 }));
    store.dispatch(new Push(1, { serverRevision: 11, localRevision: 1, deviceId: OptimisticSyncWithPush.deviceId() }));
    responses[0].resolve({ value: 1, revision: 11 });
    await done;
    expect(requests).toEqual([1, 2]);
  });
