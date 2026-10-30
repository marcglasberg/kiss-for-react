import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';
import { Deferred } from './fixtures/deferred';

reporter(new FeatureFileReporter());

const feature = new Feature('Status of an array of action types');

class State {
  constructor(readonly count: number) {}
}

type Outcome = 'ok' | 'user exception' | 'error';

/** An async action that stays pending until `finish` resolves, then ends with `outcome`. */
abstract class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void> = Promise.resolve(), readonly outcome: Outcome = 'ok', readonly key?: string) {
    super();
  }

  get statusKey() {
    return this.key;
  }

  async reduce() {
    await this.finish;
    if (this.outcome === 'user exception') throw new UserException(`${this.constructor.name} failed.`);
    if (this.outcome === 'error') throw new Error(`${this.constructor.name} failed.`);
    return (state: State) => new State(state.count + 1);
  }
}

class LoadUser extends Load {}

class LoadPosts extends Load {}

class LoadComments extends Load {}

class LoadAdminPosts extends LoadPosts {}

/** A sync action, with a shape that is different from the `Load` actions. */
class Increment extends KissAction<State> {
  constructor(readonly fails = false) {
    super();
  }

  reduce() {
    if (this.fails) throw new UserException('Increment failed.');
    return new State(this.state.count + 1);
  }
}

/** A sync action that records what `this.isWaiting`, `this.isFailed` and `this.exceptionFor` say. */
class CheckFromAction extends KissAction<State> {
  seenWaiting: boolean | null = null;
  seenFailed: boolean | null = null;
  seenException: UserException | null = null;

  reduce() {
    this.seenWaiting = this.isWaiting([LoadUser, LoadPosts]);
    this.seenFailed = this.isFailed([LoadUser, LoadPosts]);
    this.seenException = this.exceptionFor([LoadUser, LoadPosts]);
    this.clearExceptionFor([LoadUser, LoadPosts]);
    return null;
  }
}

function createStore() {
  return new Store<State>({
    initialState: new State(0),
    logger: () => {},
    showUserException: () => {},
  });
}

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('isWaiting with an array is true while an action of any of the types runs.')
  .given('Two async action types, LoadUser and LoadPosts.')
  .when('LoadUser runs, then LoadPosts also runs, then LoadUser finishes, then LoadPosts finishes.')
  .then('isWaiting([LoadUser, LoadPosts]) is true while at least one of them runs.')
  .and('It is false before they start, and after both finish.')
  .run(async (_) => {
    const store = createStore();
    const types = [LoadUser, LoadPosts];
    expect(store.isWaiting(types)).toBe(false);

    const finishUser = new Deferred();
    const finishPosts = new Deferred();
    const user = store.dispatchAndWait(new LoadUser(finishUser.promise));
    expect(store.isWaiting(types)).toBe(true);

    const posts = store.dispatchAndWait(new LoadPosts(finishPosts.promise));
    expect(store.isWaiting(types)).toBe(true);

    finishUser.resolve();
    await user;
    expect(store.isWaiting(LoadUser)).toBe(false);
    expect(store.isWaiting(types)).toBe(true);

    finishPosts.resolve();
    await posts;
    expect(store.isWaiting(types)).toBe(false);
  });

Bdd(feature)
  .scenario('isWaiting with an array ignores the action types that are not in the array.')
  .given('An async action of type LoadComments is running.')
  .when('isWaiting is called with the array [LoadUser, LoadPosts].')
  .then('It is false.')
  .run(async (_) => {
    const store = createStore();
    const finish = new Deferred();
    const comments = store.dispatchAndWait(new LoadComments(finish.promise));

    expect(store.isWaiting(LoadComments)).toBe(true);
    expect(store.isWaiting([LoadUser, LoadPosts])).toBe(false);

    finish.resolve();
    await comments;
  });

Bdd(feature)
  .scenario('isWaiting with an array also matches the subclasses of the types.')
  .given('LoadAdminPosts is a subclass of LoadPosts.')
  .when('An action of type LoadAdminPosts is running.')
  .then('isWaiting([LoadUser, LoadPosts]) is true.')
  .and('isWaiting with an array of abstract types also works: isWaiting([Load]) is true.')
  .run(async (_) => {
    const store = createStore();
    const finish = new Deferred();
    const adminPosts = store.dispatchAndWait(new LoadAdminPosts(finish.promise));

    expect(store.isWaiting([LoadUser, LoadPosts])).toBe(true);
    expect(store.isWaiting([Load])).toBe(true);

    finish.resolve();
    await adminPosts;
    expect(store.isWaiting([LoadUser, LoadPosts])).toBe(false);
  });

Bdd(feature)
  .scenario('The status functions with an empty array say that nothing runs and nothing failed.')
  .given('An action of type LoadUser is running, and an action of type LoadPosts failed.')
  .when('isWaiting, isFailed and exceptionFor are called with an empty array.')
  .then('isWaiting and isFailed are false, and exceptionFor is null.')
  .and('clearExceptionFor with an empty array clears nothing.')
  .run(async (_) => {
    const store = createStore();
    await store.dispatchAndWait(new LoadPosts(undefined, 'user exception'));
    const finish = new Deferred();
    const user = store.dispatchAndWait(new LoadUser(finish.promise));

    expect(store.isWaiting([])).toBe(false);
    expect(store.isFailed([])).toBe(false);
    expect(store.exceptionFor([])).toBe(null);

    store.clearExceptionFor([]);
    expect(store.isFailed(LoadPosts)).toBe(true);

    finish.resolve();
    await user;
  });

Bdd(feature)
  .scenario('isFailed with an array is true if any of the types failed.')
  .given('Two async action types, LoadUser and LoadPosts.')
  .when('LoadUser succeeds, and LoadPosts fails.')
  .then('isFailed([LoadUser, LoadPosts]) is true.')
  .and('After LoadPosts runs again and succeeds, isFailed([LoadUser, LoadPosts]) is false.')
  .run(async (_) => {
    const store = createStore();
    const types = [LoadUser, LoadPosts];

    await store.dispatchAndWait(new LoadUser());
    expect(store.isFailed(types)).toBe(false);

    await expect(store.dispatchAndWait(new LoadPosts(undefined, 'error'))).rejects.toThrow('LoadPosts failed.');
    expect(store.isFailed(types)).toBe(true);
    expect(store.isFailed([LoadUser, LoadComments])).toBe(false);

    await store.dispatchAndWait(new LoadPosts());
    expect(store.isFailed(types)).toBe(false);
  });

Bdd(feature)
  .scenario('exceptionFor with an array returns the UserException of the first type in the array that has one.')
  .given('LoadUser and LoadPosts both failed with a UserException.')
  .when('exceptionFor is called with the array [LoadUser, LoadPosts], and with [LoadPosts, LoadUser].')
  .then('The first call returns the exception of LoadUser.')
  .and('The second call returns the exception of LoadPosts.')
  .run(async (_) => {
    const store = createStore();
    await store.dispatchAndWait(new LoadUser(undefined, 'user exception'));
    await store.dispatchAndWait(new LoadPosts(undefined, 'user exception'));

    expect(store.exceptionFor([LoadUser, LoadPosts])?.message).toBe('LoadUser failed.');
    expect(store.exceptionFor([LoadPosts, LoadUser])?.message).toBe('LoadPosts failed.');
  });

Bdd(feature)
  .scenario('exceptionFor with an array skips the types that failed with an error that is not a UserException.')
  .given('LoadUser failed with a plain Error, and LoadPosts failed with a UserException.')
  .when('exceptionFor is called with the array [LoadUser, LoadPosts].')
  .then('It returns the UserException of LoadPosts.')
  .and('isFailed([LoadUser]) is still true.')
  .and('When no type in the array has a UserException, it returns null.')
  .run(async (_) => {
    const store = createStore();
    await expect(store.dispatchAndWait(new LoadUser(undefined, 'error'))).rejects.toThrow('LoadUser failed.');
    await store.dispatchAndWait(new LoadPosts(undefined, 'user exception'));

    expect(store.exceptionFor([LoadUser, LoadPosts])?.message).toBe('LoadPosts failed.');
    expect(store.isFailed([LoadUser])).toBe(true);
    expect(store.exceptionFor([LoadUser, LoadComments])).toBe(null);
  });

Bdd(feature)
  .scenario('clearExceptionFor with an array clears the failures of all the types in the array, and only of them.')
  .given('LoadUser, LoadPosts and LoadComments failed.')
  .when('clearExceptionFor is called with the array [LoadUser, LoadPosts].')
  .then('LoadUser and LoadPosts are not failed anymore.')
  .and('LoadComments is still failed.')
  .and('The status listeners are notified only once.')
  .run(async (_) => {
    const store = createStore();
    await store.dispatchAndWait(new LoadUser(undefined, 'user exception'));
    await store.dispatchAndWait(new LoadPosts(undefined, 'user exception'));
    await store.dispatchAndWait(new LoadComments(undefined, 'user exception'));

    let notifications = 0;
    const unsubscribe = store._subscribeStatus(() => notifications++);
    store.clearExceptionFor([LoadUser, LoadPosts]);
    unsubscribe();

    expect(store.isFailed(LoadUser)).toBe(false);
    expect(store.isFailed(LoadPosts)).toBe(false);
    expect(store.isFailed(LoadComments)).toBe(true);
    expect(notifications).toBe(1);
  });

Bdd(feature)
  .scenario('With an array, a statusKey applies to all the types in the array.')
  .given('LoadUser runs with the key "a", and LoadPosts failed with the key "b".')
  .when('The status functions are called with the array [LoadUser, LoadPosts], and a statusKey.')
  .then('isWaiting is true only for the key "a".')
  .and('isFailed and exceptionFor find the failure only for the key "b".')
  .and('clearExceptionFor with the key "a" clears nothing, and with the key "b" clears the failure.')
  .run(async (_) => {
    const store = createStore();
    const types = [LoadUser, LoadPosts];
    await store.dispatchAndWait(new LoadPosts(undefined, 'user exception', 'b'));
    const finish = new Deferred();
    const user = store.dispatchAndWait(new LoadUser(finish.promise, 'ok', 'a'));

    expect(store.isWaiting(types, { statusKey: 'a' })).toBe(true);
    expect(store.isWaiting(types, { statusKey: 'b' })).toBe(false);

    expect(store.isFailed(types, { statusKey: 'b' })).toBe(true);
    expect(store.isFailed(types, { statusKey: 'a' })).toBe(false);
    expect(store.exceptionFor(types, { statusKey: 'b' })?.message).toBe('LoadPosts failed.');
    expect(store.exceptionFor(types, { statusKey: 'a' })).toBe(null);

    store.clearExceptionFor(types, { statusKey: 'a' });
    expect(store.isFailed(LoadPosts)).toBe(true);
    store.clearExceptionFor(types, { statusKey: 'b' });
    expect(store.isFailed(LoadPosts)).toBe(false);

    finish.resolve();
    await user;
  });

Bdd(feature)
  .scenario('Inside an action, the status functions also accept an array of types.')
  .given('An action of type LoadUser is running, and an action of type LoadPosts failed with a UserException.')
  .when('Another action calls this.isWaiting, this.isFailed, this.exceptionFor and this.clearExceptionFor with the array [LoadUser, LoadPosts].')
  .then('this.isWaiting and this.isFailed are true.')
  .and('this.exceptionFor returns the exception of LoadPosts.')
  .and('this.clearExceptionFor clears the failure of LoadPosts.')
  .run(async (_) => {
    const store = createStore();
    await store.dispatchAndWait(new LoadPosts(undefined, 'user exception'));
    const finish = new Deferred();
    const user = store.dispatchAndWait(new LoadUser(finish.promise));

    const check = new CheckFromAction();
    store.dispatch(check);

    expect(check.seenWaiting).toBe(true);
    expect(check.seenFailed).toBe(true);
    expect(check.seenException?.message).toBe('LoadPosts failed.');
    expect(store.isFailed(LoadPosts)).toBe(false);

    finish.resolve();
    await user;
  });

Bdd(feature)
  .scenario('The array can mix action types with different shapes, like sync and async actions.')
  .given('A sync action type Increment, and an async action type LoadUser.')
  .and('Increment failed with a UserException.')
  .when('The status functions are called with the array [LoadUser, Increment].')
  .then('The code compiles, and the status functions work.')
  .run(async (_) => {
    const store = createStore();
    store.dispatch(new Increment(true));
    const finish = new Deferred();
    const user = store.dispatchAndWait(new LoadUser(finish.promise));

    expect(store.isWaiting([LoadUser, Increment])).toBe(true);
    expect(store.isFailed([LoadUser, Increment])).toBe(true);
    expect(store.exceptionFor([LoadUser, Increment])?.message).toBe('Increment failed.');
    store.clearExceptionFor([LoadUser, Increment]);
    expect(store.isFailed(Increment)).toBe(false);

    finish.resolve();
    await user;
  });

/** The argument given to the status functions, for each example of the BDD below. */
const argumentFor: Record<string, typeof LoadUser | readonly (typeof LoadUser)[]> = {
  'LoadUser': LoadUser,
  '[LoadUser]': [LoadUser],
  '[LoadUser, LoadPosts]': [LoadUser, LoadPosts],
};

Bdd(feature)
  .scenario('All the status functions accept one type, an array with one type, or an array with several types.')
  .given('An action of type LoadUser.')
  .when('The status functions are called with {Argument}.')
  .then('isWaiting is true while LoadUser runs.')
  .and('abort aborts LoadUser.')
  .and('isFailed is true, and exceptionFor returns its exception, after LoadUser fails.')
  .and('clearExceptionFor clears the failure of LoadUser.')
  .example(val('Argument', 'LoadUser'))
  .example(val('Argument', '[LoadUser]'))
  .example(val('Argument', '[LoadUser, LoadPosts]'))
  .run(async (ctx) => {
    const type = argumentFor[ctx.example.val('Argument') as string];
    const store = createStore();

    // isWaiting and abort.
    const finish = new Deferred();
    const action = new LoadUser(finish.promise);
    const promise = store.dispatchAndWait(action);
    expect(store.isWaiting(type)).toBe(true);
    store.abort(type);
    expect(action.isAborted).toBe(true);
    finish.resolve();
    expect((await promise).isDispatchAborted).toBe(true);
    expect(store.isWaiting(type)).toBe(false);

    // isFailed, exceptionFor and clearExceptionFor.
    expect(store.isFailed(type)).toBe(false);
    await store.dispatchAndWait(new LoadUser(undefined, 'user exception'));
    expect(store.isFailed(type)).toBe(true);
    expect(store.exceptionFor(type)?.message).toBe('LoadUser failed.');
    store.clearExceptionFor(type);
    expect(store.isFailed(type)).toBe(false);
    expect(store.exceptionFor(type)).toBe(null);
  });

Bdd(feature)
  .scenario('abort with an array aborts the actions of all the types in the array, and only of them.')
  .given('Actions of type LoadUser, LoadPosts and LoadComments are running.')
  .when('The store aborts the array [LoadUser, LoadPosts].')
  .then('The LoadUser and LoadPosts actions are aborted, and finish without changing the state.')
  .and('The LoadComments action is not aborted, and changes the state when it finishes.')
  .run(async (_) => {
    const store = createStore();
    const finish = new Deferred();
    const user = new LoadUser(finish.promise);
    const posts = new LoadPosts(finish.promise);
    const comments = new LoadComments(finish.promise);
    const promises = [user, posts, comments].map(action => store.dispatchAndWait(action));

    store.abort([LoadUser, LoadPosts]);

    expect(user.isAborted).toBe(true);
    expect(posts.isAborted).toBe(true);
    expect(comments.isAborted).toBe(false);

    finish.resolve();
    const [userStatus, postsStatus, commentsStatus] = await Promise.all(promises);
    expect(userStatus.isDispatchAborted).toBe(true);
    expect(postsStatus.isDispatchAborted).toBe(true);
    expect(commentsStatus.isDispatchAborted).toBe(false);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('abort with an array and a statusKey aborts only the actions with that key.')
  .given('LoadUser runs with the key "a", and LoadPosts runs with the keys "a" and "b".')
  .when('The store aborts the array [LoadUser, LoadPosts] with the statusKey "a".')
  .then('Only the actions with the key "a" are aborted.')
  .run(async (_) => {
    const store = createStore();
    const finish = new Deferred();
    const userA = new LoadUser(finish.promise, 'ok', 'a');
    const postsA = new LoadPosts(finish.promise, 'ok', 'a');
    const postsB = new LoadPosts(finish.promise, 'ok', 'b');
    const promises = [userA, postsA, postsB].map(action => store.dispatchAndWait(action));

    store.abort([LoadUser, LoadPosts], { statusKey: 'a' });

    expect(userA.isAborted).toBe(true);
    expect(postsA.isAborted).toBe(true);
    expect(postsB.isAborted).toBe(false);

    finish.resolve();
    await Promise.all(promises);
  });
