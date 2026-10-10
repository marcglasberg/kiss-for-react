import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import {
  AbortDispatchException,
  OptimisticSyncWithPush,
  Poll,
  PushMetadata,
  ServerPush,
  Store,
  StoreException,
  UserException,
} from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Optimistic sync with push actions');

/** The "likes" of the items, and the server revision of each item, saved by the pushes. */
class State {
  constructor(
    readonly likes: Record<string, boolean> = {},
    readonly revisions: Record<string, number> = {},
  ) {
  }

  isLiked(itemId: string): boolean {
    return this.likes[itemId] ?? false;
  }

  setLiked(itemId: string, liked: boolean): State {
    return new State({ ...this.likes, [itemId]: liked }, this.revisions);
  }

  revisionOf(itemId: string): number {
    return this.revisions[itemId] ?? -1;
  }

  setRevision(itemId: string, revision: number): State {
    return new State(this.likes, { ...this.revisions, [itemId]: revision });
  }
}

/** A promise that the test resolves or rejects when it wants. */
class Deferred<T = any> {
  resolve!: (value: T) => void;
  reject!: (error: any) => void;
  readonly promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

/** Lets pending promises and timers run. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** The response of the fake server: its server revision, and optionally the value it has. */
type Response = { serverRevision?: number | Date, liked?: boolean };

/**
 * A fake server. Each request waits until the test responds to it, or fails it.
 * The log has the requests with their local-revision ('send: A=true #1') and the calls to
 * `onFinish` ('finish: A=true').
 */
class Server {
  readonly requests: Array<{ value: boolean, localRevision: number, deviceId: number, response: Deferred<Response> }> = [];
  readonly log: string[] = [];

  send(itemId: string, value: boolean, localRevision: number, deviceId: number): Promise<Response> {
    this.log.push(`send: ${itemId}=${value} #${localRevision}`);
    const response = new Deferred<Response>();
    this.requests.push({ value, localRevision, deviceId, response });
    return response.promise;
  }

  /** Responds to the request with the given index (0 is the first request). */
  async respond(index: number, response: Response) {
    this.requests[index].response.resolve(response);
    await flush();
  }

  /** Fails the request with the given index. */
  async fail(index: number, error: any) {
    this.requests[index].response.reject(error);
    await flush();
  }
}

/**
 * Toggles the "like" of an item. Each item has its own key, so different items can have
 * concurrent requests. Informs the server revision of the response, if the response has one.
 */
class ToggleLike extends OptimisticSyncWithPush<State, boolean> {
  constructor(readonly itemId: string, readonly server: Server) {
    super();
  }

  optimisticSyncKeyParams() {
    return this.itemId;
  }

  valueToApply() {
    return !this.state.isLiked(this.itemId);
  }

  applyOptimisticValueToState(state: State, liked: boolean) {
    return state.setLiked(this.itemId, liked);
  }

  getValueFromState(state: State) {
    return state.isLiked(this.itemId);
  }

  getServerRevisionFromState(state: State, key: any) {
    return state.revisionOf(key[1]);
  }

  async sendValueToServer(liked: boolean, localRevision: number, deviceId: number) {
    const response = await this.server.send(this.itemId, liked, localRevision, deviceId);
    if (response.serverRevision !== undefined) this.informServerRevision(response.serverRevision);
    return response.liked;
  }

  onFinish(error: any): Promise<State | null> | State | null {
    const result = (error === null) ? `${this.itemId}=${this.state.isLiked(this.itemId)}` : `error ${error.message}`;
    this.server.log.push(`finish: ${result}`);
    return null;
  }
}

/** Applies the server response (the value the server has) to the state. */
class ToggleLikeWithResponse extends ToggleLike {
  applyServerResponseToState(state: State, liked: boolean) {
    return state.setLiked(this.itemId, liked);
  }
}

/** Applies a pushed "like" to the state, and saves its server revision. */
class PushLike extends ServerPush<State> {
  constructor(readonly itemId: string, readonly liked: boolean, readonly metadata: PushMetadata) {
    super();
  }

  associatedAction() {
    return ToggleLike;
  }

  optimisticSyncKeyParams() {
    return this.itemId;
  }

  pushMetadata() {
    return this.metadata;
  }

  applyServerPushToState(state: State, key: any, serverRevision: number): State | null {
    return state.setLiked(this.itemId, this.liked).setRevision(key[1], serverRevision);
  }

  getServerRevisionFromState(state: State, key: any) {
    return state.revisionOf(key[1]);
  }
}

/** The device ID of this device. */
const thisDevice = () => OptimisticSyncWithPush.deviceId();

/** The device ID of some other device. */
const otherDevice = () => OptimisticSyncWithPush.deviceId() + 1;

// ----------------------------------------------------------------------------

Bdd(feature)
  .scenario('The optimistic value is applied right away, and sent to the server with its revision and device.')
  .given('An item that is not liked.')
  .when('The like is toggled.')
  .then('The item is liked right away, before the server responds.')
  .and('The value is sent to the server, with local-revision 1, and the device ID.')
  .and('When the server responds, onFinish is called.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const action = new ToggleLike('A', server);
    store.dispatch(action);

    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true #1']);
    expect(server.requests[0].deviceId).toBe(OptimisticSyncWithPush.deviceId());
    expect(store.isWaiting(ToggleLike)).toBe(true);

    await server.respond(0, { serverRevision: 10 });

    expect(store.isWaiting(ToggleLike)).toBe(false);
    expect(action.status.isCompletedOk).toBe(true);
    expect(action.optimisticValue).toBe(true);
    expect(action.lastSentValue).toBe(true);
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('Each dispatch increments the local-revision of its key.')
  .given('The like of an item was toggled, and its request finished.')
  .when('The like is toggled again.')
  .then('The new request is sent with local-revision 2.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    await server.respond(0, { serverRevision: 10 });

    store.dispatch(new ToggleLike('A', server));
    expect(server.log.at(-1)).toBe('send: A=false #2');
    await server.respond(1, { serverRevision: 11 });
  });

Bdd(feature)
  .scenario('Changes made while a request is in flight are sent in a single follow-up request, even if the value is the same.')
  .given('An item that is not liked.')
  .when('The like is toggled 3 times, before the first request finishes.')
  .then('Only the first toggle sends a request, with local-revision 1.')
  .and('When the first request finishes, a single follow-up request sends the latest value, with local-revision 3.')
  .and('The follow-up is sent even though the latest value is the same as the value that was sent.')
  .and('onFinish is called only once, after the follow-up request finishes.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const first = new ToggleLike('A', server);
    store.dispatch(first);
    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true #1']);

    await server.respond(0, { serverRevision: 10 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #3']);

    await server.respond(1, { serverRevision: 11 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #3', 'finish: A=true']);
    expect(first.status.isCompletedOk).toBe(true);
    expect(store.isWaiting(ToggleLike)).toBe(false);
  });

Bdd(feature)
  .scenario('Different keys can have concurrent requests, each with its own local-revision.')
  .given('Two items, A and B, that are not liked.')
  .when('Both likes are toggled.')
  .then('Both requests are sent right away, both with local-revision 1.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('B', server));
    expect(server.log).toEqual(['send: A=true #1', 'send: B=true #1']);

    await server.respond(1, { serverRevision: 10 });
    await server.respond(0, { serverRevision: 11 });
    expect(server.log).toEqual(['send: A=true #1', 'send: B=true #1', 'finish: B=true', 'finish: A=true']);
  });

// ----------------------------------------------------------------------------
// Pushes

Bdd(feature)
  .scenario('If the latest change came from a push, no follow-up request is needed.')
  .given('An item that is not liked.')
  .and('The like was toggled twice, and the first request is in flight.')
  .when('A push from another device arrives, with the item liked.')
  .and('The first request finishes.')
  .then('The pushed value is applied to the state, with its server revision.')
  .and('There is no follow-up request.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(false);

    store.dispatch(new PushLike('A', true, { serverRevision: 20, localRevision: 7, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);
    expect(store.state.revisionOf('A')).toBe(20);

    await server.respond(0, { serverRevision: 10 });
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('A local change made after a push is sent in a follow-up request.')
  .given('An item that is not liked.')
  .and('The like was toggled, and its request is in flight.')
  .and('A push from another device arrived, with the item not liked.')
  .when('The like is toggled again.')
  .and('The first request finishes.')
  .then('A follow-up request sends the latest local value.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new PushLike('A', false, { serverRevision: 20, localRevision: 7, deviceId: otherDevice() }));
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(true);

    await server.respond(0, { serverRevision: 10 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #2']);

    await server.respond(1, { serverRevision: 21 });
    expect(server.log.at(-1)).toBe('finish: A=true');
  });

Bdd(feature)
  .scenario('Stale and out-of-order pushes are ignored.')
  .given('A push with server revision 20 was applied, with the item liked.')
  .when('A push with server revision {Revision} arrives, with the item not liked.')
  .then('The push is ignored.')
  .example(val('Revision', 20))
  .example(val('Revision', 15))
  .run(async (ctx) => {
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new PushLike('A', true, { serverRevision: 20, localRevision: 1, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);

    const revision = ctx.example.val('Revision') as number;
    store.dispatch(new PushLike('A', false, { serverRevision: revision, localRevision: 2, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);
    expect(store.state.revisionOf('A')).toBe(20);
  });

Bdd(feature)
  .scenario('Pushes older than the server revision saved in the state are ignored.')
  .given('A state that has the item liked, with server revision 20 (for example, a persisted state).')
  .and('No action was dispatched yet.')
  .when('A push with server revision 15 arrives, with the item not liked.')
  .then('The push is ignored.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State().setLiked('A', true).setRevision('A', 20) });

    store.dispatch(new PushLike('A', false, { serverRevision: 15, localRevision: 1, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);
  });

Bdd(feature)
  .scenario('The echo of an older request of this device is not applied, and does not cancel the follow-up.')
  .given('An item that is not liked.')
  .and('The like was toggled twice, and the first request is in flight.')
  .when('The push of the first request arrives, from this device, with local-revision 1.')
  .then('The push is not applied, since the state has a newer local value.')
  .and('When the first request finishes, a follow-up request sends the latest local value.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));

    store.dispatch(new PushLike('A', true, { serverRevision: 10, localRevision: 1, deviceId: thisDevice() }));
    expect(store.state.isLiked('A')).toBe(false);
    expect(store.state.revisionOf('A')).toBe(-1);

    await server.respond(0, { serverRevision: 10 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=false #2']);

    await server.respond(1, { serverRevision: 11 });
  });

Bdd(feature)
  .scenario('The echo of the latest request of this device is applied.')
  .given('An item that is not liked.')
  .and('The like was toggled, and its request is in flight.')
  .when('The push of that request arrives, from this device, with local-revision 1.')
  .then('The push is applied, with its server revision.')
  .and('When the request finishes, there is no follow-up request.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new PushLike('A', true, { serverRevision: 10, localRevision: 1, deviceId: thisDevice() }));
    expect(store.state.revisionOf('A')).toBe(10);

    await server.respond(0, { serverRevision: 10 });
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('A push ignored by applyServerPushToState still records its server revision.')
  .given('A server push action whose applyServerPushToState returns null.')
  .when('A push with server revision 20 arrives.')
  .and('Then a push with server revision 15 arrives, applied by the regular server push action.')
  .then('The second push is ignored, since server revision 20 is already known.')
  .run(async (_) => {
    class IgnoredPushLike extends PushLike {
      applyServerPushToState(): State | null {
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new IgnoredPushLike('A', true, { serverRevision: 20, localRevision: 1, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(false);

    store.dispatch(new PushLike('A', true, { serverRevision: 15, localRevision: 1, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(false);
  });

Bdd(feature)
  .scenario('A server push uses the key of its associated action.')
  .given('A server push associated with another optimistic sync class.')
  .and('The like was toggled twice, and the first request is in flight.')
  .when('That push arrives.')
  .and('The first request finishes.')
  .then('The push does not count as a push for the toggled key, so a follow-up request is sent.')
  .run(async (_) => {
    class OtherToggleLike extends ToggleLike {
    }

    class OtherPushLike extends PushLike {
      associatedAction() {
        return OtherToggleLike;
      }
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new OtherPushLike('A', true, { serverRevision: 20, localRevision: 1, deviceId: otherDevice() }));

    await server.respond(0, { serverRevision: 10 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #2']);

    await server.respond(1, { serverRevision: 21 });
  });

// ----------------------------------------------------------------------------
// Server response

Bdd(feature)
  .scenario('The server response is applied to the state, when the state stabilizes.')
  .given('An optimistic sync with push that applies the server response to the state.')
  .when('The like is toggled twice, before the first request finishes.')
  .and('Each request returns a response.')
  .then('The response of the first request is not applied, since a follow-up request is needed.')
  .and('The response of the last request is applied.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeWithResponse('A', server));
    store.dispatch(new ToggleLikeWithResponse('A', server));

    await server.respond(0, { serverRevision: 10, liked: true });
    expect(store.state.isLiked('A')).toBe(false);

    await server.respond(1, { serverRevision: 11, liked: true });
    expect(store.state.isLiked('A')).toBe(true);
  });

Bdd(feature)
  .scenario('A stale server response is not applied.')
  .given('An optimistic sync with push that applies the server response to the state.')
  .and('The like was toggled, and its request is in flight.')
  .when('A push from another device arrives, with server revision 20, and the item not liked.')
  .and('The request finishes with server revision 10, and the item liked.')
  .then('The response is not applied, since the push is newer.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeWithResponse('A', server));
    store.dispatch(new PushLike('A', false, { serverRevision: 20, localRevision: 3, deviceId: otherDevice() }));

    await server.respond(0, { serverRevision: 10, liked: true });
    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=false']);
  });

Bdd(feature)
  .scenario('A server response newer than a push is applied.')
  .given('An optimistic sync with push that applies the server response to the state.')
  .and('The like was toggled, and its request is in flight.')
  .when('A push from another device arrives, with server revision 20, and the item not liked.')
  .and('The request finishes with server revision 30, and the item liked.')
  .then('The response is applied, since it is newer than the push.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeWithResponse('A', server));
    store.dispatch(new PushLike('A', false, { serverRevision: 20, localRevision: 3, deviceId: otherDevice() }));

    await server.respond(0, { serverRevision: 30, liked: true });
    expect(store.state.isLiked('A')).toBe(true);
  });

Bdd(feature)
  .scenario('The server revision can be informed as a Date.')
  .given('An optimistic sync with push that applies the server response to the state.')
  .and('A push with server revision 20 was applied.')
  .when('The like is toggled, and the server responds with a Date as the server revision.')
  .then('The Date is used as its milliseconds since the epoch, which is newer than 20.')
  .and('So, the response is applied.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new PushLike('A', false, { serverRevision: 20, localRevision: 1, deviceId: otherDevice() }));
    store.dispatch(new ToggleLikeWithResponse('A', server));

    await server.respond(0, { serverRevision: new Date(2026, 0, 1), liked: true });
    expect(store.state.isLiked('A')).toBe(true);
  });

// ----------------------------------------------------------------------------
// Errors

Bdd(feature)
  .scenario('If sendValueToServer does not inform the server revision, the action fails.')
  .given('An item that is not liked.')
  .when('The like is toggled, and the request finishes without informing the server revision.')
  .then('The action fails with a StoreException.')
  .and('onFinish is called with the error.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const action = new ToggleLike('A', server);
    store.dispatchAndWait(action).catch(() => {
    });
    await server.respond(0, {});

    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(server.log.at(-1)).toMatch(/^finish: error .*informServerRevision/);
  });

Bdd(feature)
  .scenario('When a request fails, the optimistic value stays, onFinish gets the error, the action fails, and the key is released.')
  .given('An item that is not liked.')
  .when('The like is toggled twice, and the first request fails.')
  .then('The state keeps the latest optimistic value.')
  .and('There is no follow-up request.')
  .and('onFinish is called with the error, and the action fails with the error.')
  .and('A new toggle sends its own request right away.')
  .run(async (_) => {
    const error = new UserException('Request failed.');
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const action = new ToggleLike('A', server);
    store.dispatch(action);
    store.dispatch(new ToggleLike('A', server));

    await server.fail(0, error);

    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual(['send: A=true #1', 'finish: error Request failed.']);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);

    store.dispatch(new ToggleLike('A', server));
    expect(server.log.at(-1)).toBe('send: A=true #3');
    await server.respond(1, { serverRevision: 10 });
  });

Bdd(feature)
  .scenario('The number of follow-up requests is limited.')
  .given('An optimistic sync with push with maxFollowUpRequests 2.')
  .when('The like keeps being toggled while each request is in flight.')
  .then('After 2 follow-up requests, the action fails with a StoreException, instead of sending another.')
  .and('onFinish is called with the error, and the key is released.')
  .run(async (_) => {
    class ToggleLikeLimited extends ToggleLike {
      maxFollowUpRequests = 2;
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const action = new ToggleLikeLimited('A', server);
    store.dispatchAndWait(action).catch(() => {
    });

    for (let i = 0; i < 3; i++) {
      store.dispatch(new ToggleLikeLimited('A', server));
      await server.respond(i, { serverRevision: 10 + i });
    }

    expect(server.requests.length).toBe(3);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(server.log.at(-1)).toMatch(/^finish: error Too many follow-up requests/);

    store.dispatch(new ToggleLikeLimited('A', server));
    expect(server.requests.length).toBe(4);
    await server.respond(3, { serverRevision: 20 });
  });

// ----------------------------------------------------------------------------
// Device ID

Bdd(feature)
  .scenario('The device ID is the same during the app run, and can be changed.')
  .given('The default device ID.')
  .when('It is read twice.')
  .then('It returns the same number.')
  .and('When it is changed, the requests send the new device ID.')
  .run(async (_) => {
    const defaultDeviceId = OptimisticSyncWithPush.deviceId;
    expect(OptimisticSyncWithPush.deviceId()).toBe(OptimisticSyncWithPush.deviceId());
    expect(Number.isInteger(OptimisticSyncWithPush.deviceId())).toBe(true);

    try {
      OptimisticSyncWithPush.deviceId = () => 42;

      const server = new Server();
      const store = new Store<State>({ initialState: new State() });
      store.dispatch(new ToggleLike('A', server));
      expect(server.requests[0].deviceId).toBe(42);
      await server.respond(0, { serverRevision: 10 });
    } finally {
      OptimisticSyncWithPush.deviceId = defaultDeviceId;
    }
  });

// ----------------------------------------------------------------------------
// Clearing

Bdd(feature)
  .scenario('clearInternalActionProps releases the keys, removes the revisions, and stops the actions with a request in flight.')
  .given('The like was toggled twice, and the first request is in flight.')
  .when('The internal action props are cleared.')
  .and('The like is toggled again.')
  .then('The new toggle sends its own request right away, with local-revision 1.')
  .and('When the old request finishes, the old action is aborted, without a follow-up request, and without calling onFinish.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const old = new ToggleLike('A', server);
    store.dispatch(old);
    store.dispatch(new ToggleLike('A', server));

    store.clearInternalActionProps();

    const newer = new ToggleLike('A', server);
    store.dispatch(newer);
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #1']);

    await server.respond(0, { serverRevision: 10 });
    expect(old.status.isDispatchAborted).toBe(true);
    expect(old.status.originalError).toBeInstanceOf(AbortDispatchException);
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #1']);

    await server.respond(1, { serverRevision: 11 });
    expect(newer.status.isCompletedOk).toBe(true);
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #1', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('After clearInternalActionProps, the server revision saved in the state is still used.')
  .given('A push with server revision 20 was applied, and saved in the state.')
  .when('The internal action props are cleared.')
  .and('A push with server revision 15 arrives.')
  .then('The push is ignored.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new PushLike('A', true, { serverRevision: 20, localRevision: 1, deviceId: otherDevice() }));
    store.clearInternalActionProps();

    store.dispatch(new PushLike('A', false, { serverRevision: 15, localRevision: 2, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);
  });

// ----------------------------------------------------------------------------
// Check internet

Bdd(feature)
  .scenario('With checkInternet, when there is no internet, nothing is applied or sent.')
  .given('An optimistic sync with push that checks for internet.')
  .and('There is no internet.')
  .when('The like is toggled.')
  .then('No optimistic value is applied, no request is sent, and the action fails.')
  .run(async (_) => {
    class ToggleLikeCheckInternet extends ToggleLike {
      checkInternet = { dialog: false };
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });
    store.forceInternetOnOffSimulation = () => false;

    const action = new ToggleLikeCheckInternet('A', server);
    await store.dispatchAndWait(action);

    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual([]);
    expect(action.status.isCompletedFailed).toBe(true);
  });

// ----------------------------------------------------------------------------
// Incompatible features

const featureValues: Record<string, any> = {
  checkInternet: { dialog: false },
  nonReentrant: true,
  retry: { on: true },
  unlimitedRetryCheckInternet: true,
  debounce: true,
  throttle: true,
  fresh: true,
  sequential: true,
  poll: Poll.start,
};

Bdd(feature)
  .scenario('An optimistic sync with push cannot use some features.')
  .given('An optimistic sync with push that uses {Feature}.')
  .when('It is dispatched.')
  .then('The dispatch throws a StoreException.')
  .and('The state does not change.')
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'retry'))
  .example(val('Feature', 'unlimitedRetryCheckInternet'))
  .example(val('Feature', 'debounce'))
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .example(val('Feature', 'sequential'))
  .example(val('Feature', 'poll'))
  .run(async (ctx) => {
    const feature = ctx.example.val('Feature') as string;

    class ToggleLikeWithFeature extends ToggleLike {
      constructor(itemId: string, server: Server) {
        super(itemId, server);
        (this as any)[feature] = featureValues[feature];
      }

      createPollingAction() {
        return new ToggleLike(this.itemId, this.server);
      }
    }

    const store = new Store<State>({ initialState: new State() });

    expect(() => store.dispatch(new ToggleLikeWithFeature('A', new Server()))).toThrow(StoreException);
    expect(store.state.isLiked('A')).toBe(false);
  });

Bdd(feature)
  .scenario('A server push cannot use any feature.')
  .given('A server push action that uses {Feature}.')
  .when('It is dispatched.')
  .then('The dispatch throws a StoreException.')
  .and('The state does not change.')
  .example(val('Feature', 'checkInternet'))
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'retry'))
  .example(val('Feature', 'unlimitedRetryCheckInternet'))
  .example(val('Feature', 'debounce'))
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .example(val('Feature', 'sequential'))
  .example(val('Feature', 'poll'))
  .run(async (ctx) => {
    const feature = ctx.example.val('Feature') as string;

    class PushLikeWithFeature extends PushLike {
      constructor() {
        super('A', true, { serverRevision: 20, localRevision: 1, deviceId: otherDevice() });
        (this as any)[feature] = featureValues[feature];
      }

      createPollingAction() {
        return new PushLike('A', true, this.metadata);
      }
    }

    const store = new Store<State>({ initialState: new State() });

    expect(() => store.dispatch(new PushLikeWithFeature())).toThrow(StoreException);
    expect(store.state.isLiked('A')).toBe(false);
  });
