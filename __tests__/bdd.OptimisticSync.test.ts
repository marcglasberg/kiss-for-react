import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { OptimisticSync, Poll, Store, StoreException, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Optimistic sync actions');

class State {
  constructor(readonly likes: Record<string, boolean> = {}) {
  }

  isLiked(itemId: string): boolean {
    return this.likes[itemId] ?? false;
  }

  setLiked(itemId: string, liked: boolean): State {
    return new State({ ...this.likes, [itemId]: liked });
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

/**
 * A fake server. Each request waits until the test responds to it, or fails it.
 * The log has the requests ('send: A=true') and the calls to `onFinish` ('finish: A=true').
 */
class Server {
  readonly requests: Array<{ value: boolean, response: Deferred }> = [];
  readonly log: string[] = [];

  send(itemId: string, value: boolean): Promise<any> {
    this.log.push(`send: ${itemId}=${value}`);
    const response = new Deferred();
    this.requests.push({ value, response });
    return response.promise;
  }

  /** Responds to the request with the given index (0 is the first request). */
  async respond(index: number, response?: any) {
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
 * concurrent requests.
 */
class ToggleLike extends OptimisticSync<State, boolean> {
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

  sendValueToServer(liked: boolean) {
    return this.server.send(this.itemId, liked);
  }

  onFinish(error: any): Promise<State | null> | State | null {
    const result = (error === null) ? `${this.itemId}=${this.state.isLiked(this.itemId)}` : `error ${error.message}`;
    this.server.log.push(`finish: ${result}`);
    return null;
  }
}

/** Applies the server response (a boolean) to the state. */
class ToggleLikeWithResponse extends ToggleLike {
  applyServerResponseToState(state: State, liked: boolean) {
    return state.setLiked(this.itemId, liked);
  }
}

// ----------------------------------------------------------------------------

Bdd(feature)
  .scenario('The optimistic value is applied right away, and sent to the server.')
  .given('An item that is not liked.')
  .when('The like is toggled.')
  .then('The item is liked right away, before the server responds.')
  .and('The value is sent to the server.')
  .and('The action is in progress until the server responds.')
  .and('When the server responds, onFinish is called.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const action = new ToggleLike('A', server);
    store.dispatch(action);

    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true']);
    expect(store.isWaiting(ToggleLike)).toBe(true);

    await server.respond(0);

    expect(store.isWaiting(ToggleLike)).toBe(false);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('Changes made while a request is in flight are sent in a single follow-up request.')
  .given('An item that is not liked.')
  .when('The like is toggled 4 times, before the first request finishes.')
  .then('Every toggle changes the state right away.')
  .and('Only the first toggle sends a request.')
  .and('When the first request finishes, a single follow-up request sends the latest value.')
  .and('onFinish is called only once, after the follow-up request finishes.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(true);
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(false);
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(true);
    store.dispatch(new ToggleLike('A', server));
    expect(store.state.isLiked('A')).toBe(false);

    expect(server.log).toEqual(['send: A=true']);

    await server.respond(0);
    expect(server.log).toEqual(['send: A=true', 'send: A=false']);

    await server.respond(1);
    expect(server.log).toEqual(['send: A=true', 'send: A=false', 'finish: A=false']);
    expect(store.isWaiting(ToggleLike)).toBe(false);
  });

Bdd(feature)
  .scenario('Follow-up requests are sent until the state stabilizes.')
  .given('An item that is not liked.')
  .and('The like was toggled, and its request is in flight.')
  .when('The like is toggled again while each request is in flight.')
  .then('When each request finishes, a follow-up request sends the latest value.')
  .and('When a request finishes and the state did not change, there are no more requests.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));

    store.dispatch(new ToggleLike('A', server));
    await server.respond(0);
    expect(server.requests.map(request => request.value)).toEqual([true, false]);

    store.dispatch(new ToggleLike('A', server));
    await server.respond(1);
    expect(server.requests.map(request => request.value)).toEqual([true, false, true]);

    await server.respond(2);
    expect(server.requests.map(request => request.value)).toEqual([true, false, true]);
    expect(server.log.at(-1)).toBe('finish: A=true');
    expect(store.isWaiting(ToggleLike)).toBe(false);
  });

Bdd(feature)
  .scenario('If the state goes back to the sent value, no follow-up request is needed.')
  .given('An item that is not liked.')
  .when('The like is toggled 3 times, before the first request finishes.')
  .then('Only one request is sent, since the state ends with the same value that was sent.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('A', server));

    await server.respond(0);

    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('Only the dispatch that sends the requests waits for them.')
  .given('An item that is not liked.')
  .when('The like is toggled twice with dispatchAndWait, before the first request finishes.')
  .then('The second dispatch applies its value, and finishes right away, without sending a request.')
  .and('The first dispatch only finishes after the follow-up request finishes.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    let firstFinished = false;
    const first = new ToggleLike('A', server);
    store.dispatchAndWait(first).then(() => firstFinished = true);

    const second = new ToggleLike('A', server);
    await store.dispatchAndWait(second);

    expect(second.status.isCompletedOk).toBe(true);
    expect(second.lastSentValue).toBeUndefined();
    expect(store.state.isLiked('A')).toBe(false);

    await server.respond(0);
    expect(firstFinished).toBe(false);
    expect(first.lastSentValue).toBe(false);

    await server.respond(1);
    expect(firstFinished).toBe(true);
    expect(first.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('The optimistic value of each dispatch is kept in the action.')
  .given('An item that is not liked.')
  .when('The like is toggled twice.')
  .then('The optimisticValue of each action is the value it applied.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const first = new ToggleLike('A', server);
    const second = new ToggleLike('A', server);
    store.dispatch(first);
    store.dispatch(second);

    expect(first.optimisticValue).toBe(true);
    expect(second.optimisticValue).toBe(false);

    await server.respond(0);
    await server.respond(1);
  });

// ----------------------------------------------------------------------------
// Keys

Bdd(feature)
  .scenario('Different keys can have concurrent requests.')
  .given('Two items, A and B, that are not liked.')
  .when('Both likes are toggled.')
  .then('Both requests are sent right away.')
  .and('Each one finishes on its own.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new ToggleLike('B', server));

    expect(server.log).toEqual(['send: A=true', 'send: B=true']);

    await server.respond(1);
    expect(server.log).toEqual(['send: A=true', 'send: B=true', 'finish: B=true']);

    await server.respond(0);
    expect(server.log).toEqual(['send: A=true', 'send: B=true', 'finish: B=true', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('By default, actions of different classes have different keys.')
  .given('Two optimistic sync classes for the same item, that do not override computeOptimisticSyncKey.')
  .when('Both are dispatched.')
  .then('Both send their requests right away.')
  .run(async (_) => {
    class OtherToggleLike extends ToggleLike {
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    store.dispatch(new OtherToggleLike('A', server));

    expect(server.log).toEqual(['send: A=true', 'send: A=false']);

    await server.respond(0);
    await server.respond(1);
  });

Bdd(feature)
  .scenario('Different action classes can share the same key.')
  .given('Two optimistic sync classes for the same item, that override computeOptimisticSyncKey to return the item.')
  .when('Both are dispatched.')
  .then('Only the first one sends a request right away.')
  .and('The other change is sent by the first action, in a follow-up request.')
  .run(async (_) => {
    class SharedToggleLike extends ToggleLike {
      computeOptimisticSyncKey() {
        return this.itemId;
      }
    }

    class OtherSharedToggleLike extends SharedToggleLike {
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new SharedToggleLike('A', server));
    store.dispatch(new OtherSharedToggleLike('A', server));
    expect(server.log).toEqual(['send: A=true']);

    await server.respond(0);
    expect(server.log).toEqual(['send: A=true', 'send: A=false']);

    await server.respond(1);
  });

// ----------------------------------------------------------------------------
// Server response

Bdd(feature)
  .scenario('The server response is applied to the state, when the state stabilizes.')
  .given('An optimistic sync that applies the server response to the state.')
  .when('The like is toggled twice, before the first request finishes.')
  .and('Each request returns a response.')
  .then('The response of the first request is not applied, since a follow-up request is needed.')
  .and('The response of the last request is applied.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeWithResponse('A', server));
    store.dispatch(new ToggleLikeWithResponse('A', server));
    expect(store.state.isLiked('A')).toBe(false);

    // Responds `true`, but the state changed to `false`, so the response is not applied.
    await server.respond(0, true);
    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual(['send: A=true', 'send: A=false']);

    // The server says it's still liked. Now the state is stable, so the response is applied.
    await server.respond(1, true);
    expect(store.state.isLiked('A')).toBe(true);
    expect(server.log).toEqual(['send: A=true', 'send: A=false', 'finish: A=true']);
  });

Bdd(feature)
  .scenario('By default, the server response is not applied to the state.')
  .given('An optimistic sync that does not say how to apply the server response.')
  .when('The like is toggled, and the server returns a different value.')
  .then('The state keeps the optimistic value.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    await server.respond(0, false);

    expect(store.state.isLiked('A')).toBe(true);
  });

// ----------------------------------------------------------------------------
// onFinish

Bdd(feature)
  .scenario('The state returned by onFinish is applied.')
  .given('An optimistic sync whose onFinish returns a new state.')
  .when('The like is toggled, and the request succeeds.')
  .then('The state returned by onFinish is applied.')
  .run(async (_) => {
    class ToggleLikeAndMark extends ToggleLike {
      async onFinish(_error: any) {
        return this.state.setLiked('finished', true);
      }
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeAndMark('A', server));
    await server.respond(0);

    expect(store.state.isLiked('A')).toBe(true);
    expect(store.state.isLiked('finished')).toBe(true);
  });

Bdd(feature)
  .scenario('The key is released before onFinish runs.')
  .given('An optimistic sync whose onFinish takes some time.')
  .and('The like was toggled, and its request finished.')
  .when('The like is toggled again while onFinish is running.')
  .then('The new toggle sends its own request right away.')
  .run(async (_) => {
    const finishing = new Deferred();

    class ToggleLikeSlowFinish extends ToggleLike {
      async onFinish(_error: any) {
        this.server.log.push('finishing');
        await finishing.promise;
        return null;
      }
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeSlowFinish('A', server));
    await server.respond(0);
    expect(server.log).toEqual(['send: A=true', 'finishing']);

    store.dispatch(new ToggleLikeSlowFinish('A', server));
    expect(server.log).toEqual(['send: A=true', 'finishing', 'send: A=false']);

    finishing.resolve(undefined);
    await server.respond(1);
  });

// ----------------------------------------------------------------------------
// Errors

Bdd(feature)
  .scenario('When a request fails, the optimistic value stays, onFinish gets the error, and the action fails.')
  .given('An item that is not liked.')
  .when('The like is toggled twice, and the first request fails.')
  .then('The state keeps the latest optimistic value.')
  .and('There is no follow-up request.')
  .and('onFinish is called with the error.')
  .and('The action fails with the error, and the error is shown to the user.')
  .run(async (_) => {
    const error = new UserException('Request failed.');
    const shown: UserException[] = [];
    const store = new Store<State>({
      initialState: new State(),
      showUserException: (exception: UserException, _count: number, next: () => void) => {
        shown.push(exception);
        next();
      },
    });

    const server = new Server();
    const action = new ToggleLike('A', server);
    store.dispatch(action);
    store.dispatch(new ToggleLike('A', server));

    await server.fail(0, error);

    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual(['send: A=true', 'finish: error Request failed.']);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(shown).toEqual([error]);
  });

Bdd(feature)
  .scenario('After a request fails, the key is released.')
  .given('The like was toggled, and its request failed.')
  .when('The like is toggled again.')
  .then('The new toggle sends its own request right away.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLike('A', server));
    await server.fail(0, new UserException('Request failed.'));

    store.dispatch(new ToggleLike('A', server));
    expect(server.log).toEqual(['send: A=true', 'finish: error Request failed.', 'send: A=false']);

    await server.respond(1);
  });

Bdd(feature)
  .scenario('onFinish can roll back the optimistic value when the request fails.')
  .given('An optimistic sync whose onFinish rolls back to the initial value, if the state still has its optimistic value.')
  .and('An item that is not liked.')
  .when('The like is toggled, and the request fails.')
  .then('The item is not liked again.')
  .run(async (_) => {
    class ToggleLikeWithRollback extends ToggleLike {
      onFinish(error: any) {
        if (error !== null && this.getValueFromState(this.state) === this.optimisticValue)
          return this.applyOptimisticValueToState(this.state, this.getValueFromState(this.initialState));
        return null;
      }
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeWithRollback('A', server));
    expect(store.state.isLiked('A')).toBe(true);

    await server.fail(0, new UserException('Request failed.'));
    expect(store.state.isLiked('A')).toBe(false);
  });

Bdd(feature)
  .scenario('If onFinish throws, its error becomes the action error.')
  .given('An optimistic sync whose onFinish throws an error.')
  .when('The like is toggled, and the request {Result}.')
  .then('The action fails with the error thrown by onFinish.')
  .example(val('Result', 'succeeds'))
  .example(val('Result', 'fails'))
  .run(async (ctx) => {
    const finishError = new UserException('onFinish failed.');

    class ToggleLikeFinishThrows extends ToggleLike {
      onFinish(_error: any): State | null {
        throw finishError;
      }
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const action = new ToggleLikeFinishThrows('A', server);
    store.dispatch(action);

    if (ctx.example.val('Result') === 'succeeds') await server.respond(0);
    else await server.fail(0, new UserException('Request failed.'));

    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(finishError);
  });

Bdd(feature)
  .scenario('The number of follow-up requests is limited.')
  .given('An optimistic sync with maxFollowUpRequests 2.')
  .when('The like keeps being toggled while each request is in flight.')
  .then('After 2 follow-up requests, the action fails with a StoreException, instead of sending another.')
  .and('onFinish is called with the error.')
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
      await server.respond(i);
    }

    expect(server.requests.length).toBe(3);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(server.log.at(-1)).toMatch(/^finish: error Too many follow-up requests/);
  });

Bdd(feature)
  .scenario('The comparison that decides the follow-up requests can be customized.')
  .given('An optimistic sync whose ifShouldSendAnotherRequest always returns false.')
  .when('The like is toggled twice, before the first request finishes.')
  .then('There is no follow-up request.')
  .run(async (_) => {
    class ToggleLikeNoFollowUp extends ToggleLike {
      ifShouldSendAnotherRequest() {
        return false;
      }
    }

    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    store.dispatch(new ToggleLikeNoFollowUp('A', server));
    store.dispatch(new ToggleLikeNoFollowUp('A', server));
    await server.respond(0);

    expect(store.state.isLiked('A')).toBe(false);
    expect(server.log).toEqual(['send: A=true', 'finish: A=false']);
  });

// ----------------------------------------------------------------------------
// Clearing

Bdd(feature)
  .scenario('clearInternalActionProps releases the keys, and stops the actions with a request in flight.')
  .given('The like was toggled twice, and the first request is in flight.')
  .when('The internal action props are cleared.')
  .and('The like is toggled again.')
  .then('The new toggle sends its own request right away.')
  .and('When the old request finishes, the old action is aborted.')
  .and('It does not send a follow-up request, and does not call onFinish.')
  .run(async (_) => {
    const server = new Server();
    const store = new Store<State>({ initialState: new State() });

    const old = new ToggleLike('A', server);
    store.dispatch(old);
    store.dispatch(new ToggleLike('A', server));

    store.clearInternalActionProps();

    const newer = new ToggleLike('A', server);
    store.dispatch(newer);
    expect(server.log).toEqual(['send: A=true', 'send: A=true']);

    await server.respond(0);
    expect(old.status.isDispatchAborted).toBe(true);
    expect(store.isFailed(ToggleLike)).toBe(false);
    expect(server.log).toEqual(['send: A=true', 'send: A=true']);

    await server.respond(1);
    expect(newer.status.isCompletedOk).toBe(true);
    expect(server.log).toEqual(['send: A=true', 'send: A=true', 'finish: A=true']);
  });

// ----------------------------------------------------------------------------
// Check internet

Bdd(feature)
  .scenario('With checkInternet, when there is no internet, nothing is applied or sent.')
  .given('An optimistic sync that checks for internet.')
  .and('There is no internet.')
  .when('The like is toggled.')
  .then('No optimistic value is applied.')
  .and('No request is sent.')
  .and('The action fails.')
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

Bdd(feature)
  .scenario('An optimistic sync cannot use some features.')
  .given('An optimistic sync that uses {Feature}.')
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

    const props: Record<string, any> = {
      nonReentrant: true,
      retry: { on: true },
      unlimitedRetryCheckInternet: true,
      debounce: true,
      throttle: true,
      fresh: true,
      sequential: true,
      poll: Poll.start,
    };

    class ToggleLikeWithFeature extends ToggleLike {
      constructor(itemId: string, server: Server) {
        super(itemId, server);
        (this as any)[feature] = props[feature];
      }

      createPollingAction() {
        return new ToggleLike(this.itemId, this.server);
      }
    }

    const store = new Store<State>({ initialState: new State() });

    expect(() => store.dispatch(new ToggleLikeWithFeature('A', new Server()))).toThrow(StoreException);
    expect(store.state.isLiked('A')).toBe(false);
  });
