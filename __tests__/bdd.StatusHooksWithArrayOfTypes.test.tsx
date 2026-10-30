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
  useStore,
} from '../src';
import { failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { Deferred } from './fixtures/deferred';

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Status hooks with an array of action types');

class State {
  constructor(readonly count: number) {}
}

/** An async action that stays pending until `finish` resolves, then fails if `fails` is true. */
abstract class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void> = Promise.resolve(), readonly fails = false) {
    super();
  }

  async reduce() {
    await this.finish;
    if (this.fails) throw new UserException(`${this.constructor.name} failed.`);
    return (state: State) => new State(state.count + 1);
  }
}

class LoadUser extends Load {}

class LoadPosts extends Load {}

class LoadComments extends Load {}

function createStore() {
  return new Store<State>({
    initialState: new State(0),
    logger: () => {},
    showUserException: () => {},
  });
}

/**
 * A component that passes an array written inline to all the status hooks, as users write it.
 * The array is a new array in each render. It records its renders, and what each commit showed.
 */
function screen() {
  const stats = { renders: 0, commits: [] as string[] };
  let clear: ((type: any) => void) | null = null;

  const Screen: React.FC = () => {
    stats.renders++;
    const isLoading = useIsWaiting([LoadUser, LoadPosts]);
    const isFailed = useIsFailed([LoadUser, LoadPosts]);
    const error = useExceptionFor([LoadUser, LoadPosts]);
    clear = useClearExceptionFor();
    const text = `loading=${isLoading},failed=${isFailed},error=${error?.message ?? '-'}`;
    useCommitProbe(stats.commits, () => text);
    return <>{text}</>;
  };

  return { Screen, stats, clear: (type: any) => clear!(type), last: () => stats.commits[stats.commits.length - 1] };
}

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('useIsWaiting with an array shows waiting while an action of any of the types runs.')
  .given('A component that calls useIsWaiting([LoadUser, LoadPosts]).')
  .when('LoadUser runs, then LoadPosts also runs, then LoadUser finishes, then LoadPosts finishes.')
  .then('The component shows waiting while at least one of them runs.')
  .and('It shows not waiting before they start, and after both finish.')
  .run(async (_) => {
    const store = createStore();
    const { Screen, last } = screen();
    await mount(<StoreProvider store={store}><Screen /></StoreProvider>);
    expect(last()).toBe('loading=false,failed=false,error=-');

    const finishUser = new Deferred();
    const finishPosts = new Deferred();
    const user = new LoadUser(finishUser.promise);
    const posts = new LoadPosts(finishPosts.promise);

    await act(async () => store.dispatch(user));
    expect(last()).toBe('loading=true,failed=false,error=-');

    await act(async () => store.dispatch(posts));
    expect(last()).toBe('loading=true,failed=false,error=-');

    await act(async () => {
      finishUser.resolve();
      await store.waitAllActions([user], { completeImmediately: true });
    });
    expect(last()).toBe('loading=true,failed=false,error=-');

    await act(async () => {
      finishPosts.resolve();
      await store.waitAllActions([posts], { completeImmediately: true });
    });
    expect(last()).toBe('loading=false,failed=false,error=-');
  });

Bdd(feature)
  .scenario('An array written inline in the component does not cause extra renders.')
  .given('A component that passes an array written inline to the status hooks.')
  .when('An action of a type that is not in the array starts and finishes.')
  .then('The component does not render again, since what the hooks return did not change.')
  .run(async (_) => {
    const store = createStore();
    const { Screen, stats } = screen();
    await mount(<StoreProvider store={store}><Screen /></StoreProvider>);
    const rendersBefore = stats.renders;

    const finish = new Deferred();
    const comments = new LoadComments(finish.promise);
    await act(async () => store.dispatch(comments));
    await act(async () => {
      finish.resolve();
      await store.waitAllActions([comments], { completeImmediately: true });
    });

    expect(store.state.count).toBe(1);
    expect(stats.renders).toBe(rendersBefore);
  });

Bdd(feature)
  .scenario('useIsFailed and useExceptionFor with an array show the failure of any of the types.')
  .given('A component that calls useIsFailed([LoadUser, LoadPosts]) and useExceptionFor([LoadUser, LoadPosts]).')
  .when('LoadPosts fails with a UserException.')
  .then('The component shows failed, and the exception of LoadPosts.')
  .and('When LoadUser also fails, the component shows the exception of LoadUser, since it comes first in the array.')
  .run(async (_) => {
    const store = createStore();
    const { Screen, last } = screen();
    await mount(<StoreProvider store={store}><Screen /></StoreProvider>);

    await act(async () => {
      await store.dispatchAndWait(new LoadPosts(undefined, true));
    });
    expect(last()).toBe('loading=false,failed=true,error=LoadPosts failed.');

    await act(async () => {
      await store.dispatchAndWait(new LoadUser(undefined, true));
    });
    expect(last()).toBe('loading=false,failed=true,error=LoadUser failed.');
  });

Bdd(feature)
  .scenario('useClearExceptionFor with an array clears the failures of all the types in the array.')
  .given('A component that shows the failures of LoadUser and LoadPosts.')
  .and('LoadUser and LoadPosts both failed.')
  .when('The function returned by useClearExceptionFor is called with the array [LoadUser, LoadPosts].')
  .then('The component shows no failure.')
  .and('The component rendered only once for the clear.')
  .run(async (_) => {
    const store = createStore();
    const { Screen, stats, clear, last } = screen();
    await mount(<StoreProvider store={store}><Screen /></StoreProvider>);

    await act(async () => {
      await store.dispatchAndWait(new LoadUser(undefined, true));
      await store.dispatchAndWait(new LoadPosts(undefined, true));
    });
    expect(last()).toBe('loading=false,failed=true,error=LoadUser failed.');
    const rendersBefore = stats.renders;

    await act(async () => clear([LoadUser, LoadPosts]));
    expect(last()).toBe('loading=false,failed=false,error=-');
    expect(stats.renders).toBe(rendersBefore + 1);
  });

type Types = typeof LoadUser | readonly (typeof LoadUser)[];

/** The argument given to the status hooks, for each example of the BDD below. */
const argumentFor: Record<string, Types> = {
  'LoadUser': LoadUser,
  '[LoadUser]': [LoadUser],
  '[LoadUser, LoadPosts]': [LoadUser, LoadPosts],
};

Bdd(feature)
  .scenario('All the status hooks accept one type, an array with one type, or an array with several types.')
  .given('A component that calls useIsWaiting, useIsFailed, useExceptionFor and useClearExceptionFor with {Argument}.')
  .when('A LoadUser action runs and fails, and then the failure is cleared.')
  .then('The component shows waiting while LoadUser runs.')
  .and('The component shows the failure and the exception of LoadUser after it fails.')
  .and('The component shows no failure after the failure is cleared.')
  .example(val('Argument', 'LoadUser'))
  .example(val('Argument', '[LoadUser]'))
  .example(val('Argument', '[LoadUser, LoadPosts]'))
  .run(async (ctx) => {
    const type = argumentFor[ctx.example.val('Argument') as string];
    const store = createStore();
    let clear: ((type: Types) => void) | null = null;
    const commits: string[] = [];

    const Status: React.FC = () => {
      const isWaiting = useIsWaiting(type);
      const isFailed = useIsFailed(type);
      const error = useExceptionFor(type);
      clear = useClearExceptionFor();
      const text = `waiting=${isWaiting},failed=${isFailed},error=${error?.message ?? '-'}`;
      useCommitProbe(commits, () => text);
      return <>{text}</>;
    };
    const last = () => commits[commits.length - 1];
    await mount(<StoreProvider store={store}><Status /></StoreProvider>);
    expect(last()).toBe('waiting=false,failed=false,error=-');

    const finish = new Deferred();
    const action = new LoadUser(finish.promise, true);
    await act(async () => store.dispatch(action));
    expect(last()).toBe('waiting=true,failed=false,error=-');

    await act(async () => {
      finish.resolve();
      await store.waitAllActions([action], { completeImmediately: true });
    });
    expect(last()).toBe('waiting=false,failed=true,error=LoadUser failed.');

    await act(async () => clear!(type));
    expect(last()).toBe('waiting=false,failed=false,error=-');
  });

Bdd(feature)
  .scenario('The abort function of useStore accepts an array of types.')
  .given('A component that gets the abort function from useStore.')
  .and('Actions of type LoadUser, LoadPosts and LoadComments are running.')
  .when('The component calls abort with the array [LoadUser, LoadPosts].')
  .then('The LoadUser and LoadPosts actions are aborted.')
  .and('The LoadComments action is not aborted.')
  .run(async (_) => {
    const store = createStore();
    let abort: ((type: readonly (typeof Load)[]) => void) | null = null;

    const Screen: React.FC = () => {
      abort = useStore().abort;
      return <>screen</>;
    };
    await mount(<StoreProvider store={store}><Screen /></StoreProvider>);

    const finish = new Deferred();
    const user = new LoadUser(finish.promise);
    const posts = new LoadPosts(finish.promise);
    const comments = new LoadComments(finish.promise);
    await act(async () => [user, posts, comments].forEach(action => store.dispatch(action)));

    await act(async () => abort!([LoadUser, LoadPosts]));
    expect(user.isAborted).toBe(true);
    expect(posts.isAborted).toBe(true);
    expect(comments.isAborted).toBe(false);

    await act(async () => {
      finish.resolve();
      await store.waitAllActions([user, posts, comments], { completeImmediately: true });
    });
    expect(store.state.count).toBe(1);
  });
