import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { OptimisticSyncWithPush, PushMetadata, ServerPush, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Server pushes that arrive while a request is in flight');

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
type Response = { serverRevision: number, liked?: boolean };

/**
 * A fake server. Each request waits until the test responds to it. The log has the requests
 * with their local-revision ('send: A=true #1') and the calls to `onFinish` ('finish: A=true').
 */
class Server {
  readonly requests: Array<{ value: boolean, response: Deferred<Response> }> = [];
  readonly log: string[] = [];

  send(itemId: string, value: boolean, localRevision: number): Promise<Response> {
    this.log.push(`send: ${itemId}=${value} #${localRevision}`);
    const response = new Deferred<Response>();
    this.requests.push({ value, response });
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

/** Toggles the "like" of an item. Informs the server revision of the response. */
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

  async sendValueToServer(liked: boolean, localRevision: number) {
    const response = await this.server.send(this.itemId, liked, localRevision);
    this.informServerRevision(response.serverRevision);
    return response.liked;
  }

  onFinish(error: any): State | null {
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

/** A push that `applyServerPushToState` ignores, by returning null. */
class IgnoredPushLike extends PushLike {
  applyServerPushToState(): State | null {
    return null;
  }
}

/** The device ID of this device. */
const thisDevice = () => OptimisticSyncWithPush.deviceId();

/** The device ID of some other device. */
const otherDevice = () => OptimisticSyncWithPush.deviceId() + 1;

// ----------------------------------------------------------------------------
// A push ignored by applyServerPushToState.

Bdd(feature)
  .scenario('A push ignored by applyServerPushToState does not cancel the follow-up of a newer local change.')
  .given('An item that is not liked.')
  .and('The like was toggled twice, so the item is not liked, and the first request is in flight.')
  .when('A push from another device arrives, and applyServerPushToState ignores it.')
  .and('The first request finishes.')
  .then('The state is not changed by the push.')
  .and('A follow-up request sends the latest local value.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));

    store.dispatch(new IgnoredPushLike('A', true, { serverRevision: 20, localRevision: 3, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(false);

    await server.respond(0, { serverRevision: 11 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=false #2']);

    await server.respond(1, { serverRevision: 21 });
    expect(server.log.at(-1)).toBe('finish: A=false');
    expect(store.state.isLiked('A')).toBe(false);
  });

Bdd(feature)
  .scenario('A push ignored by applyServerPushToState does not cancel an earlier push.')
  .given('An item that is not liked.')
  .and('The like was toggled twice, and the first request is in flight.')
  .and('A push from another device arrived, with the item liked, and was applied.')
  .when('A newer push arrives, and applyServerPushToState ignores it.')
  .and('The first request finishes.')
  .then('The item is still liked, as in the applied push.')
  .and('There is no follow-up request, since the latest change applied came from a push.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new PushLike('A', true, { serverRevision: 20, localRevision: 3, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);

    store.dispatch(new IgnoredPushLike('A', false, { serverRevision: 21, localRevision: 4, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);

    await server.respond(0, { serverRevision: 11 });
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=true']);
    expect(store.state.isLiked('A')).toBe(true);
  });

Bdd(feature)
  .scenario('A push ignored by applyServerPushToState still records its server revision, so older pushes are ignored.')
  .given('An item that is not liked.')
  .and('The like was toggled twice, so the item is not liked, and the first request is in flight.')
  .and('A push from another device arrived, with server revision 20, and applyServerPushToState ignored it.')
  .when('An older push from another device arrives, with server revision 15, and the item liked.')
  .and('The first request finishes.')
  .then('The older push is ignored, so the item is still not liked.')
  .and('A follow-up request sends the latest local value.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new IgnoredPushLike('A', true, { serverRevision: 20, localRevision: 3, deviceId: otherDevice() }));

    store.dispatch(new PushLike('A', true, { serverRevision: 15, localRevision: 2, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(false);
    expect(store.state.revisionOf('A')).toBe(-1);

    await server.respond(0, { serverRevision: 11 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=false #2']);

    await server.respond(1, { serverRevision: 21 });
    expect(server.log.at(-1)).toBe('finish: A=false');
    expect(store.state.isLiked('A')).toBe(false);
  });

// ----------------------------------------------------------------------------
// A push older than the request in flight.

Bdd(feature)
  .scenario('A push older than the request in flight does not overwrite a newer local change.')
  .given('An item that is not liked, with server revision 5.')
  .and('The like was toggled twice, so the item is not liked, and the first request is in flight.')
  .when('A push from another device arrives, with server revision 10, and the item liked.')
  .and('The first request finishes with server revision 11.')
  .then('The push is applied while the request is in flight.')
  .and('When the request finishes, the push turns out to be older than the request.')
  .and('So the latest local value is back in the state, and a follow-up request sends it.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State().setRevision('A', 5) });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(false);

    store.dispatch(new PushLike('A', true, { serverRevision: 10, localRevision: 9, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);

    await server.respond(0, { serverRevision: 11, liked: true });
    expect(store.state.isLiked('A')).toBe(false);
    expect(server.requests.map(request => request.value)).toEqual([true, false]);
    expect(server.log).toEqual(['send: A=true #1', 'send: A=false #2']);

    await server.respond(1, { serverRevision: 12, liked: false });
    expect(server.log.at(-1)).toBe('finish: A=false');
    expect(store.state.isLiked('A')).toBe(false);
  });

Bdd(feature)
  .scenario('A push older than the request in flight does not overwrite the value of that request.')
  .given('An item that is not liked, with server revision 5.')
  .and('The like was toggled once, so the item is liked, and the request is in flight.')
  .when('A push from another device arrives, with server revision 10, and the item not liked.')
  .and('The request finishes with server revision 11, and no server response.')
  .and('Then the push of that request arrives, from this device, with server revision 11.')
  .then('When the request finishes, the item is liked again, since the server has the value of the request.')
  .and('There is no follow-up request.')
  .and('The item stays liked after the push of the request.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State().setRevision('A', 5) });

    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(true);

    store.dispatch(new PushLike('A', false, { serverRevision: 10, localRevision: 9, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(false);

    await server.respond(0, { serverRevision: 11 });
    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=true']);

    store.dispatch(new PushLike('A', true, { serverRevision: 11, localRevision: 1, deviceId: thisDevice() }));
    expect(store.state.isLiked('A')).toBe(true);
  });

Bdd(feature)
  .scenario('A push older than the request in flight does not keep the server response from being applied.')
  .given('An optimistic sync with push that applies the server response to the state.')
  .and('The like was toggled once, so the item is liked, and the request is in flight.')
  .when('A push from another device arrives, with server revision 10, and the item not liked.')
  .and('The request finishes with server revision 11, and the item liked.')
  .then('The server response is applied, so the item is liked.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State().setRevision('A', 5) });

    store.dispatch(new ToggleLikeWithResponse('A', server));
    store.dispatch(new PushLike('A', false, { serverRevision: 10, localRevision: 9, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(false);

    await server.respond(0, { serverRevision: 11, liked: true });
    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('A push newer than the request in flight still wins, even after an older push.')
  .given('An item that is not liked, with server revision 5.')
  .and('The like was toggled twice, so the item is not liked, and the first request is in flight.')
  .when('A push from another device arrives, with server revision 10, and the item liked.')
  .and('Another push from another device arrives, with server revision 12, and the item liked.')
  .and('The first request finishes with server revision 11.')
  .then('The item is still liked, as in the newest push.')
  .and('There is no follow-up request.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State().setRevision('A', 5) });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new PushLike('A', true, { serverRevision: 10, localRevision: 9, deviceId: otherDevice() }));
    store.dispatch(new PushLike('A', true, { serverRevision: 12, localRevision: 10, deviceId: otherDevice() }));

    await server.respond(0, { serverRevision: 11 });
    expect(store.state.isLiked('A')).toBe(true);
    expect(store.state.revisionOf('A')).toBe(12);
    expect(server.log).toEqual(['send: A=true #1', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('A local change made after a push older than the request in flight is sent in a follow-up request.')
  .given('An item that is not liked, with server revision 5.')
  .and('The like was toggled once, so the item is liked, and the request is in flight.')
  .and('A push from another device arrived, with server revision 10, and the item not liked.')
  .when('The like is toggled again, so the item is liked.')
  .and('The first request finishes with server revision 11.')
  .then('A follow-up request sends the latest local value.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State().setRevision('A', 5) });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new PushLike('A', false, { serverRevision: 10, localRevision: 9, deviceId: otherDevice() }));
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(true);

    await server.respond(0, { serverRevision: 11 });
    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true #1', 'send: A=true #2']);

    await server.respond(1, { serverRevision: 12 });
    expect(server.log.at(-1)).toBe('finish: A=true');
  });

Bdd(feature)
  .scenario('A push older than the follow-up request in flight does not overwrite the latest local change.')
  .given('An item that is not liked, with server revision 5.')
  .and('The like was toggled twice, so the item is not liked.')
  .and('The first request finished with server revision 11, so a follow-up request is in flight.')
  .when('A push from another device arrives, with server revision 12, and the item liked.')
  .and('The follow-up request finishes with server revision 13.')
  .then('The push is applied while the follow-up request is in flight.')
  .and('When the follow-up request finishes, the latest local value is back in the state.')
  .and('There is no other follow-up request.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State().setRevision('A', 5) });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    await server.respond(0, { serverRevision: 11 });
    expect(server.log).toEqual(['send: A=true #1', 'send: A=false #2']);

    store.dispatch(new PushLike('A', true, { serverRevision: 12, localRevision: 9, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(true);

    await server.respond(1, { serverRevision: 13 });
    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual(['send: A=true #1', 'send: A=false #2', 'finish: A=false']);
  });

Bdd(feature)
  .scenario('A push that arrives during a request that fails is kept.')
  .given('An item that is not liked, with server revision 5.')
  .and('The like was toggled once, so the item is liked, and the request is in flight.')
  .when('A push from another device arrives, with server revision 10, and the item not liked.')
  .and('The request fails, so it never informs its server revision.')
  .then('The item is still not liked, as in the push, since the server did not save the request.')
  .and('There is no follow-up request, and the action fails.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State().setRevision('A', 5) });

    const action = new ToggleLike('A', server);
    store.dispatch(action);
    store.dispatch(new PushLike('A', false, { serverRevision: 10, localRevision: 9, deviceId: otherDevice() }));
    expect(store.state.isLiked('A')).toBe(false);

    await server.fail(0, new UserException('Request failed.'));
    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual(['send: A=true #1', 'finish: error Request failed.']);
    expect(action.status.isCompletedFailed).toBe(true);
  });
