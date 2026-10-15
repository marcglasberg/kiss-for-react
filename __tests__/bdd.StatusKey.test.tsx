/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act } from 'react';
import {
  KissAction,
  Store,
  StoreProvider,
  useClearExceptionFor,
  useExceptionFor,
  useIsFailed,
  useIsWaiting,
  UserException,
} from '../src';
import { failOnConsoleErrors, mount, unmountAll } from './fixtures/dom';
import { Deferred } from './fixtures/deferred';

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Status per key, with statusKey');

class State {
  constructor(readonly loaded: string[] = []) {}
}

type Outcome = 'ok' | 'user exception' | 'error';

/** Loads one user. Its `statusKey` is the user id. Stays pending until `finish` resolves. */
class LoadUser extends KissAction<State> {
  constructor(
    readonly userId: string,
    readonly finish: Promise<void> = Promise.resolve(),
    readonly outcome: Outcome = 'ok',
  ) {
    super();
  }

  get statusKey() {
    return this.userId;
  }

  async reduce() {
    await this.finish;
    if (this.outcome === 'user exception') throw new UserException(`User ${this.userId} failed.`);
    if (this.outcome === 'error') throw new Error(`User ${this.userId} failed.`);
    return (state: State) => new State([...state.loaded, this.userId]);
  }
}

/** Its `statusKey` is an array, compared by content. */
class LoadCart extends KissAction<State> {
  constructor(readonly userId: string, readonly cartId: number) {
    super();
  }

  get statusKey() {
    return [this.userId, this.cartId];
  }

  reduce(): null {
    throw new UserException(`Cart ${this.cartId} of ${this.userId} failed.`);
  }
}

/** Has no `statusKey`. */
class LoadAll extends KissAction<State> {
  reduce(): null {
    throw new UserException('All failed.');
  }
}

/** Checks the status of a user, from inside an action. */
class CheckUser extends KissAction<State> {
  result: { waiting: boolean, failed: boolean, message: string | null } | null = null;

  constructor(readonly userId: string) {
    super();
  }

  reduce() {
    this.result = {
      waiting: this.isWaiting(LoadUser, { statusKey: this.userId }),
      failed: this.isFailed(LoadUser, { statusKey: this.userId }),
      message: this.exceptionFor(LoadUser, { statusKey: this.userId })?.message ?? null,
    };
    return null;
  }
}

function createStore() {
  return new Store<State>({
    initialState: new State(),
    logger: () => {},
    showUserException: () => {},
  });
}

/** Dispatches `action` and swallows the rejection of its promise, if any. */
async function dispatchAndSwallow(store: Store<State>, action: KissAction<State>) {
  await store.dispatchAndWait(action).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// isWaiting

Bdd(feature)
  .scenario('`isWaiting` with a statusKey only sees the actions with that key.')
  .given('Two LoadUser actions running, for users "a" and "b".')
  .when('We ask `isWaiting` with and without a statusKey.')
  .then('Without a key, it is true. With "a" or "b", it is true. With "c", it is false.')
  .and('When "a" finishes, `isWaiting` with "a" is false, but with "b" and without a key is still true.')
  .run(async (_) => {
    const store = createStore();
    const finishA = new Deferred<void>();
    const finishB = new Deferred<void>();
    const promiseA = store.dispatchAndWait(new LoadUser('a', finishA.promise));
    const promiseB = store.dispatchAndWait(new LoadUser('b', finishB.promise));

    expect(store.isWaiting(LoadUser)).toBe(true);
    expect(store.isWaiting(LoadUser, { statusKey: 'a' })).toBe(true);
    expect(store.isWaiting(LoadUser, { statusKey: 'b' })).toBe(true);
    expect(store.isWaiting(LoadUser, { statusKey: 'c' })).toBe(false);

    finishA.resolve();
    await promiseA;
    expect(store.isWaiting(LoadUser, { statusKey: 'a' })).toBe(false);
    expect(store.isWaiting(LoadUser, { statusKey: 'b' })).toBe(true);
    expect(store.isWaiting(LoadUser)).toBe(true);

    finishB.resolve();
    await promiseB;
    expect(store.isWaiting(LoadUser)).toBe(false);
    expect(store.state.loaded).toEqual(['a', 'b']);
  });

Bdd(feature)
  .scenario('`isWaiting` with a statusKey is false for an action that has no statusKey.')
  .given('An action class that does not override `statusKey`, running.')
  .when('We ask `isWaiting` with some statusKey.')
  .then('It is false, while `isWaiting` without a key is true.')
  .run(async (_) => {
    const store = createStore();
    const finish = new Deferred<void>();

    class LoadSomething extends KissAction<State> {
      async reduce() { await finish.promise; return null; }
    }

    const promise = store.dispatchAndWait(new LoadSomething());
    expect(store.isWaiting(LoadSomething)).toBe(true);
    expect(store.isWaiting(LoadSomething, { statusKey: 'a' })).toBe(false);
    finish.resolve();
    await promise;
  });

// ---------------------------------------------------------------------------------------------
// isFailed and exceptionFor

Bdd(feature)
  .scenario('`isFailed` and `exceptionFor` with a statusKey only see the failures with that key.')
  .given('LoadUser failed for users "a" and "b", with different UserExceptions.')
  .when('We ask `isFailed` and `exceptionFor` with and without a statusKey.')
  .then('Without a key, `isFailed` is true, and `exceptionFor` is the most recent failure ("b").')
  .and('With "a" or "b", `isFailed` is true and `exceptionFor` is the exception of that user.')
  .and('With "c", `isFailed` is false and `exceptionFor` is null.')
  .run(async (_) => {
    const store = createStore();
    await dispatchAndSwallow(store, new LoadUser('a', Promise.resolve(), 'user exception'));
    await dispatchAndSwallow(store, new LoadUser('b', Promise.resolve(), 'user exception'));

    expect(store.isFailed(LoadUser)).toBe(true);
    expect(store.exceptionFor(LoadUser)?.message).toBe('User b failed.');

    expect(store.isFailed(LoadUser, { statusKey: 'a' })).toBe(true);
    expect(store.exceptionFor(LoadUser, { statusKey: 'a' })?.message).toBe('User a failed.');
    expect(store.isFailed(LoadUser, { statusKey: 'b' })).toBe(true);
    expect(store.exceptionFor(LoadUser, { statusKey: 'b' })?.message).toBe('User b failed.');

    expect(store.isFailed(LoadUser, { statusKey: 'c' })).toBe(false);
    expect(store.exceptionFor(LoadUser, { statusKey: 'c' })).toBe(null);
  });

Bdd(feature)
  .scenario('Dispatching an action again clears only the failure with the same statusKey.')
  .given('LoadUser failed for users "a" and "b".')
  .when('LoadUser for "a" is dispatched again, and succeeds.')
  .then('The failure of "a" is cleared, but "b" is still failed.')
  .and('`isFailed` without a key is still true, because of "b".')
  .run(async (_) => {
    const store = createStore();
    await dispatchAndSwallow(store, new LoadUser('a', Promise.resolve(), 'user exception'));
    await dispatchAndSwallow(store, new LoadUser('b', Promise.resolve(), 'user exception'));

    await store.dispatchAndWait(new LoadUser('a'));

    expect(store.isFailed(LoadUser, { statusKey: 'a' })).toBe(false);
    expect(store.isFailed(LoadUser, { statusKey: 'b' })).toBe(true);
    expect(store.isFailed(LoadUser)).toBe(true);
    expect(store.exceptionFor(LoadUser)?.message).toBe('User b failed.');
  });

Bdd(feature)
  .scenario('Failing again with the same statusKey replaces the previous failure.')
  .given('LoadUser failed for user "a" with one message.')
  .when('LoadUser for "a" fails again with another message.')
  .then('`exceptionFor` with "a" returns the new message, and there is only one failure for "a".')
  .run(async (_) => {
    const store = createStore();

    class LoadUserWithMessage extends KissAction<State> {
      constructor(readonly userId: string, readonly message: string) { super(); }
      get statusKey() { return this.userId; }
      async reduce(): Promise<null> { throw new UserException(this.message); }
    }

    await dispatchAndSwallow(store, new LoadUserWithMessage('a', 'first'));
    await dispatchAndSwallow(store, new LoadUserWithMessage('a', 'second'));

    expect(store.exceptionFor(LoadUserWithMessage, { statusKey: 'a' })?.message).toBe('second');

    // Clearing "a" once leaves nothing: there was a single failure for "a".
    store.clearExceptionFor(LoadUserWithMessage, { statusKey: 'a' });
    expect(store.isFailed(LoadUserWithMessage)).toBe(false);
  });

Bdd(feature)
  .scenario('A failure with a plain Error is failed per key, but has no exception.')
  .given('LoadUser failed for "a" with a plain Error, then for "b" with a UserException, then for "c" with a plain Error.')
  .when('We ask `isFailed` and `exceptionFor`.')
  .then('`isFailed` is true for "a", "b" and "c".')
  .and('`exceptionFor` is null for "a" and "c", and the UserException for "b".')
  .and('`exceptionFor` without a key skips the plain errors and returns the UserException of "b".')
  .run(async (_) => {
    const store = createStore();
    await dispatchAndSwallow(store, new LoadUser('a', Promise.resolve(), 'error'));
    await dispatchAndSwallow(store, new LoadUser('b', Promise.resolve(), 'user exception'));
    await dispatchAndSwallow(store, new LoadUser('c', Promise.resolve(), 'error'));

    expect(store.isFailed(LoadUser, { statusKey: 'a' })).toBe(true);
    expect(store.isFailed(LoadUser, { statusKey: 'b' })).toBe(true);
    expect(store.isFailed(LoadUser, { statusKey: 'c' })).toBe(true);

    expect(store.exceptionFor(LoadUser, { statusKey: 'a' })).toBe(null);
    expect(store.exceptionFor(LoadUser, { statusKey: 'b' })?.message).toBe('User b failed.');
    expect(store.exceptionFor(LoadUser, { statusKey: 'c' })).toBe(null);

    expect(store.isFailed(LoadUser)).toBe(true);
    expect(store.exceptionFor(LoadUser)?.message).toBe('User b failed.');
  });

Bdd(feature)
  .scenario('A statusKey that is an array is compared by its content.')
  .given('LoadCart, whose statusKey is `[userId, cartId]`, failed for user "a" and cart 1.')
  .when('We ask `isFailed` with a new array with the same content, and with another content.')
  .then('The same content matches, and the other does not.')
  .run(async (_) => {
    const store = createStore();
    try {
      store.dispatch(new LoadCart('a', 1));
    } catch (_) { /* The UserException is not thrown, but just in case. */ }

    expect(store.isFailed(LoadCart, { statusKey: ['a', 1] })).toBe(true);
    expect(store.exceptionFor(LoadCart, { statusKey: ['a', 1] })?.message).toBe('Cart 1 of a failed.');
    expect(store.isFailed(LoadCart, { statusKey: ['a', 2] })).toBe(false);
    expect(store.isFailed(LoadCart, { statusKey: ['b', 1] })).toBe(false);
  });

Bdd(feature)
  .scenario('An action without a statusKey is failed without a key, and is not seen with a key.')
  .given('LoadAll, which does not override `statusKey`, failed.')
  .when('We ask `isFailed` without a key, and with some key.')
  .then('Without a key, it is true. With a key, it is false.')
  .run(async (_) => {
    const store = createStore();
    store.dispatch(new LoadAll());

    expect(store.isFailed(LoadAll)).toBe(true);
    expect(store.exceptionFor(LoadAll)?.message).toBe('All failed.');
    expect(store.isFailed(LoadAll, { statusKey: 'a' })).toBe(false);
    expect(store.exceptionFor(LoadAll, { statusKey: 'a' })).toBe(null);
  });

// ---------------------------------------------------------------------------------------------
// Clearing

Bdd(feature)
  .scenario('`clearExceptionFor` with a statusKey clears only that failure; without it, all of the type.')
  .given('LoadUser failed for "a" and "b", and LoadAll failed.')
  .when('We call `clearExceptionFor(LoadUser, { statusKey: "a" })`.')
  .then('Only "a" is cleared.')
  .and('When we call `clearExceptionFor(LoadUser)` without a key, "b" is cleared too, but LoadAll is still failed.')
  .run(async (_) => {
    const store = createStore();
    await dispatchAndSwallow(store, new LoadUser('a', Promise.resolve(), 'user exception'));
    await dispatchAndSwallow(store, new LoadUser('b', Promise.resolve(), 'user exception'));
    store.dispatch(new LoadAll());

    store.clearExceptionFor(LoadUser, { statusKey: 'a' });
    expect(store.isFailed(LoadUser, { statusKey: 'a' })).toBe(false);
    expect(store.isFailed(LoadUser, { statusKey: 'b' })).toBe(true);

    store.clearExceptionFor(LoadUser);
    expect(store.isFailed(LoadUser, { statusKey: 'b' })).toBe(false);
    expect(store.isFailed(LoadUser)).toBe(false);
    expect(store.isFailed(LoadAll)).toBe(true);
  });

Bdd(feature)
  .scenario('`clearAllExceptions` clears the failures of all types and keys.')
  .given('LoadUser failed for "a" and "b", and LoadAll failed.')
  .when('We call `clearAllExceptions()` [How].')
  .then('Nothing is failed anymore.')
  .example(val('How', 'directly'))
  .example(val('How', 'through clearInternalActionProps'))
  .example(val('How', 'through setShutDown(true)'))
  .example(val('How', 'through logOut'))
  .example(val('How', 'through dispose'))
  .run(async (ctx) => {
    const how = ctx.example.val('How') as string;
    const store = createStore();
    await dispatchAndSwallow(store, new LoadUser('a', Promise.resolve(), 'user exception'));
    await dispatchAndSwallow(store, new LoadUser('b', Promise.resolve(), 'user exception'));
    store.dispatch(new LoadAll());
    expect(store.isFailed(LoadUser)).toBe(true);
    expect(store.isFailed(LoadAll)).toBe(true);

    if (how === 'directly') store.clearAllExceptions();
    else if (how === 'through clearInternalActionProps') store.clearInternalActionProps();
    else if (how === 'through setShutDown(true)') store.setShutDown(true);
    else if (how === 'through logOut') await store.logOut({ initialState: new State(), throttle: 0, actionsThrottle: 0 });
    else await store.dispose();

    expect(store.isFailed(LoadUser)).toBe(false);
    expect(store.isFailed(LoadUser, { statusKey: 'a' })).toBe(false);
    expect(store.isFailed(LoadUser, { statusKey: 'b' })).toBe(false);
    expect(store.isFailed(LoadAll)).toBe(false);
    expect(store.exceptionFor(LoadUser)).toBe(null);
  });

// ---------------------------------------------------------------------------------------------
// Inside actions

Bdd(feature)
  .scenario('Inside an action, `isWaiting`, `isFailed` and `exceptionFor` accept a statusKey.')
  .given('LoadUser is running for "a", and failed for "b".')
  .when('Another action checks "a" and "b" with a statusKey, in its reducer.')
  .then('It sees "a" waiting and not failed, and "b" failed with its message, not waiting.')
  .run(async (_) => {
    const store = createStore();
    const finishA = new Deferred<void>();
    const promiseA = store.dispatchAndWait(new LoadUser('a', finishA.promise));
    await dispatchAndSwallow(store, new LoadUser('b', Promise.resolve(), 'user exception'));

    const checkA = new CheckUser('a');
    const checkB = new CheckUser('b');
    store.dispatch(checkA);
    store.dispatch(checkB);

    expect(checkA.result).toEqual({ waiting: true, failed: false, message: null });
    expect(checkB.result).toEqual({ waiting: false, failed: true, message: 'User b failed.' });

    finishA.resolve();
    await promiseA;
  });

// ---------------------------------------------------------------------------------------------
// Hooks

/** A row for one user, showing its waiting, failed and exception status, and a button to clear it. */
function UserRow({ userId }: { userId: string }) {
  const isWaiting = useIsWaiting(LoadUser, { statusKey: userId });
  const isFailed = useIsFailed(LoadUser, { statusKey: userId });
  const error = useExceptionFor(LoadUser, { statusKey: userId });
  const clearExceptionFor = useClearExceptionFor();
  return (
    <div>
      <span data-testid={`row-${userId}`}>
        {userId}:{isWaiting ? 'waiting' : 'idle'}:{isFailed ? 'failed' : 'ok'}:{error?.message ?? '-'}
      </span>
      <button data-testid={`clear-${userId}`} onClick={() => clearExceptionFor(LoadUser, { statusKey: userId })} />
    </div>
  );
}

function rowText(container: HTMLElement, userId: string) {
  return container.querySelector(`[data-testid="row-${userId}"]`)!.textContent;
}

Bdd(feature)
  .scenario('The status hooks with a statusKey show the status of one user only.')
  .given('Two mounted rows, for users "a" and "b", using the status hooks with `statusKey`.')
  .when('LoadUser for "a" starts, and then fails with a UserException.')
  .then('Row "a" shows waiting, and then failed with the message. Row "b" stays idle and ok.')
  .and('When LoadUser for "a" is dispatched again and succeeds, row "a" is idle and ok again.')
  .run(async (_) => {
    const store = createStore();
    const m = await mount(
      <StoreProvider store={store}>
        <UserRow userId="a" />
        <UserRow userId="b" />
      </StoreProvider>,
    );
    expect(rowText(m.container, 'a')).toBe('a:idle:ok:-');
    expect(rowText(m.container, 'b')).toBe('b:idle:ok:-');

    const finish = new Deferred<void>();
    let promise!: Promise<unknown>;
    await act(async () => {
      promise = store.dispatchAndWait(new LoadUser('a', finish.promise, 'user exception'));
    });
    expect(rowText(m.container, 'a')).toBe('a:waiting:ok:-');
    expect(rowText(m.container, 'b')).toBe('b:idle:ok:-');

    await act(async () => {
      finish.resolve();
      await promise;
    });
    expect(rowText(m.container, 'a')).toBe('a:idle:failed:User a failed.');
    expect(rowText(m.container, 'b')).toBe('b:idle:ok:-');

    await act(async () => {
      await store.dispatchAndWait(new LoadUser('a'));
    });
    expect(rowText(m.container, 'a')).toBe('a:idle:ok:-');
    expect(rowText(m.container, 'b')).toBe('b:idle:ok:-');
  });

Bdd(feature)
  .scenario('`useClearExceptionFor` with a statusKey clears the failure of one user only.')
  .given('Two mounted rows, for users "a" and "b", and LoadUser failed for both.')
  .when('The clear button of row "a" is pressed.')
  .then('Row "a" is ok, and row "b" is still failed.')
  .and('When `clearAllExceptions()` is called on the store, row "b" is ok too.')
  .run(async (_) => {
    const store = createStore();
    const m = await mount(
      <StoreProvider store={store}>
        <UserRow userId="a" />
        <UserRow userId="b" />
      </StoreProvider>,
    );

    await act(async () => {
      await dispatchAndSwallow(store, new LoadUser('a', Promise.resolve(), 'user exception'));
      await dispatchAndSwallow(store, new LoadUser('b', Promise.resolve(), 'user exception'));
    });
    expect(rowText(m.container, 'a')).toBe('a:idle:failed:User a failed.');
    expect(rowText(m.container, 'b')).toBe('b:idle:failed:User b failed.');

    await act(async () => {
      (m.container.querySelector('[data-testid="clear-a"]') as HTMLButtonElement).click();
    });
    expect(rowText(m.container, 'a')).toBe('a:idle:ok:-');
    expect(rowText(m.container, 'b')).toBe('b:idle:failed:User b failed.');

    await act(async () => {
      store.clearAllExceptions();
    });
    expect(rowText(m.container, 'b')).toBe('b:idle:ok:-');
  });
