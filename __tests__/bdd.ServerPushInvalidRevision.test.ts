import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { OptimisticSyncWithPush, PushMetadata, ServerPush, Store, StoreException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Server pushes with an invalid server revision');

/** The "like" of an item, and the server revision saved by the pushes. */
class State {
  constructor(readonly liked: boolean = false, readonly revision: number = -1) {
  }

  setLiked(liked: boolean): State {
    return new State(liked, this.revision);
  }

  setRevision(revision: number): State {
    return new State(this.liked, revision);
  }
}

/** A promise that the test resolves when it wants. */
class Deferred<T = any> {
  resolve!: (value: T) => void;
  readonly promise = new Promise<T>((resolve) => {
    this.resolve = resolve;
  });
}

/** Lets pending promises and timers run. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** The response of the fake server: its server revision, and the value it has. */
type Response = { serverRevision: number, liked: boolean };

/** A fake server. Each request waits until the test responds to it. */
class Server {
  readonly requests: Array<{ value: boolean, response: Deferred<Response> }> = [];

  send(value: boolean): Promise<Response> {
    const response = new Deferred<Response>();
    this.requests.push({ value, response });
    return response.promise;
  }

  /** Responds to the request with the given index (0 is the first request). */
  async respond(index: number, response: Response) {
    this.requests[index].response.resolve(response);
    await flush();
  }
}

/** Toggles the "like". Applies the server response (the value the server has) to the state. */
class ToggleLike extends OptimisticSyncWithPush<State, boolean> {
  constructor(readonly server: Server) {
    super();
  }

  valueToApply() {
    return !this.state.liked;
  }

  applyOptimisticValueToState(state: State, liked: boolean) {
    return state.setLiked(liked);
  }

  getValueFromState(state: State) {
    return state.liked;
  }

  getServerRevisionFromState(state: State) {
    return state.revision;
  }

  async sendValueToServer(liked: boolean) {
    const response = await this.server.send(liked);
    this.informServerRevision(response.serverRevision);
    return response.liked;
  }

  applyServerResponseToState(state: State, liked: boolean) {
    return state.setLiked(liked);
  }
}

/** Applies a pushed "like" to the state, and saves its server revision. */
class PushLike extends ServerPush<State> {
  constructor(readonly liked: boolean, readonly metadata: PushMetadata) {
    super();
  }

  associatedAction() {
    return ToggleLike;
  }

  pushMetadata() {
    return this.metadata;
  }

  applyServerPushToState(state: State, _key: any, serverRevision: number): State | null {
    return state.setLiked(this.liked).setRevision(serverRevision);
  }

  getServerRevisionFromState(state: State) {
    return state.revision;
  }
}

/** The device ID of some other device. */
const otherDevice = () => OptimisticSyncWithPush.deviceId() + 1;

/** A push from another device, with the given server revision. */
const push = (liked: boolean, serverRevision: any) =>
  new PushLike(liked, { serverRevision, localRevision: 1, deviceId: otherDevice() });

/** Dispatches the action. If it fails, the error is ignored. */
function dispatchIgnoringErrors(store: Store<State>, action: PushLike) {
  try {
    store.dispatch(action);
  } catch {
    // Ignored.
  }
}

/** The invalid server revisions used in the examples, by name. */
const invalidRevisions: Record<string, any> = {
  'undefined': undefined,
  'null': null,
  'NaN': NaN,
  'Infinity': Infinity,
  '-Infinity': -Infinity,
  'the text "20"': '20',
};

Bdd(feature)
  .scenario('A push with an invalid server revision fails, and does not change the state.')
  .given('An item that is liked, with server revision 20, saved by a push.')
  .when('A push arrives with the item not liked, and server revision {Revision}.')
  .then('The push fails with a StoreException that says the server revision is invalid.')
  .and('The item is still liked, with server revision 20.')
  .example(val('Revision', 'undefined'))
  .example(val('Revision', 'null'))
  .example(val('Revision', 'NaN'))
  .example(val('Revision', 'Infinity'))
  .example(val('Revision', '-Infinity'))
  .example(val('Revision', 'the text "20"'))
  .run(async (ctx) => {
    // Given:
    const store = new Store<State>({ initialState: new State() });
    store.dispatch(push(true, 20));
    expect(store.state).toEqual(new State(true, 20));

    // When:
    const revision = invalidRevisions[ctx.example.val('Revision') as string];
    const action = push(false, revision);
    expect(() => store.dispatch(action)).toThrow('invalid server revision');

    // Then:
    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(store.state).toEqual(new State(true, 20));
  });

Bdd(feature)
  .scenario('A push with an invalid server revision does not break the protection against stale pushes.')
  .given('An item that is liked, with server revision 20, saved by a push.')
  .and('A push arrived with server revision {Revision}.')
  .when('An older push arrives, with server revision 3, and the item not liked.')
  .then('The older push is ignored, so the item is still liked, with server revision 20.')
  .example(val('Revision', 'undefined'))
  .example(val('Revision', 'NaN'))
  .example(val('Revision', 'Infinity'))
  .run(async (ctx) => {
    // Given:
    const store = new Store<State>({ initialState: new State() });
    store.dispatch(push(true, 20));
    const revision = invalidRevisions[ctx.example.val('Revision') as string];
    dispatchIgnoringErrors(store, push(true, revision));

    // When:
    store.dispatch(push(false, 3));

    // Then:
    expect(store.state).toEqual(new State(true, 20));
  });

Bdd(feature)
  .scenario('A push with an invalid server revision does not keep newer pushes from being applied.')
  .given('An item that is liked, with server revision 20, saved by a push.')
  .and('A push arrived with server revision {Revision}.')
  .when('A newer push arrives, with server revision 21, and the item not liked.')
  .then('The newer push is applied, so the item is not liked, with server revision 21.')
  .example(val('Revision', 'undefined'))
  .example(val('Revision', 'NaN'))
  .example(val('Revision', 'Infinity'))
  .run(async (ctx) => {
    // Given:
    const store = new Store<State>({ initialState: new State() });
    store.dispatch(push(true, 20));
    const revision = invalidRevisions[ctx.example.val('Revision') as string];
    dispatchIgnoringErrors(store, push(true, revision));

    // When:
    store.dispatch(push(false, 21));

    // Then:
    expect(store.state).toEqual(new State(false, 21));
  });

Bdd(feature)
  .scenario('A push with an invalid server revision does not keep server responses from being applied.')
  .given('An item that is not liked, with server revision 5.')
  .and('A push arrived with server revision {Revision}.')
  .when('The like is toggled, so the item is liked.')
  .and('The request finishes with server revision 6, and the server says the item is not liked.')
  .then('The server response is applied, so the item is not liked.')
  .and('The request finishes without error.')
  .example(val('Revision', 'undefined'))
  .example(val('Revision', 'NaN'))
  .example(val('Revision', 'Infinity'))
  .run(async (ctx) => {
    // Given:
    const server = new Server();
    const store = new Store<State>({ initialState: new State(false, 5) });
    const revision = invalidRevisions[ctx.example.val('Revision') as string];
    dispatchIgnoringErrors(store, push(false, revision));

    // When:
    const toggle = new ToggleLike(server);
    store.dispatch(toggle);
    expect(store.state.liked).toBe(true);

    await server.respond(0, { serverRevision: 6, liked: false });

    // Then:
    expect(store.state.liked).toBe(false);
    expect(toggle.status.isCompletedOk).toBe(true);
  });
