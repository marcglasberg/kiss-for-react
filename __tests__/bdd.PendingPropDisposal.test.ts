import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { Store } from '../src';
import { Deferred, nextTick } from './fixtures/deferred';

reporter(new FeatureFileReporter());

const feature = new Feature('Waiting for pending prop disposal');

Bdd(feature)
  .scenario('Disposing the store waits for resource cleanup that has already started.')
  .given('A store has an injected dependency and a resource with asynchronous cleanup.')
  .and('The resource cleanup started through <Operation>, but has not finished.')
  .when('The store is disposed before the resource cleanup finishes.')
  .then('The store disposal stays pending, and the injected dependency stays open.')
  .and('After the resource cleanup finishes, the dependency closes and the store disposal completes.')
  .and('The resource cleanup runs only once.')
  .example(val('Operation', 'store.disposeProp'))
  .example(val('Operation', 'store.disposeProps'))
  .example(val('Operation', 'store.setProp replacement'))
  .run(async (ctx) => {
    const { store, resource, releaseCleanup, cleanupFinished, events } = resourceStore();

    if (ctx.example.val('Operation') === 'store.disposeProp') {
      store.disposeProp('resource');
    } else if (ctx.example.val('Operation') === 'store.disposeProps') {
      store.disposeProps();
    } else {
      store.setProp('resource', {});
    }

    expect(events).toEqual(['resource cleanup started']);
    expect(store.prop('resource')).not.toBe(resource);

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    let whileCleanupIsPending: { disposalFinished: boolean; events: string[] };
    try {
      // Let the disposal advance as far as it can while the resource cleanup is blocked.
      await nextTick();
      whileCleanupIsPending = { disposalFinished, events: [...events] };
    } finally {
      releaseCleanup.resolve();
      await cleanupFinished.promise;
      await disposal;
    }

    expect({ whileCleanupIsPending, disposalFinished, events }).toEqual({
      whileCleanupIsPending: {
        disposalFinished: false,
        events: ['resource cleanup started'],
      },
      disposalFinished: true,
      events: ['resource cleanup started', 'resource closed', 'dependency closed'],
    });
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('Disposing the store waits for cleanup of a resource that is still in its props.')
  .given('A store has an injected dependency and a resource with asynchronous cleanup.')
  .and('The resource is still in the store props, and its cleanup has not started.')
  .when('The store is disposed.')
  .then('The resource cleanup starts, and the store waits while the dependency stays open.')
  .and('After the resource cleanup finishes, the dependency closes and the store disposal completes.')
  .and('The resource cleanup runs only once, and the store props are empty.')
  .run(async () => {
    const { store, resource, releaseCleanup, cleanupFinished, events } = resourceStore();
    expect(store.prop('resource')).toBe(resource);
    expect(events).toEqual([]);

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    let whileCleanupIsPending: { disposalFinished: boolean; events: string[] };
    try {
      await nextTick();
      whileCleanupIsPending = { disposalFinished, events: [...events] };
    } finally {
      releaseCleanup.resolve();
      await cleanupFinished.promise;
      await disposal;
    }

    expect({ whileCleanupIsPending, disposalFinished, events }).toEqual({
      whileCleanupIsPending: {
        disposalFinished: false,
        events: ['resource cleanup started'],
      },
      disposalFinished: true,
      events: ['resource cleanup started', 'resource closed', 'dependency closed'],
    });
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('Disposing the store waits for all the resource cleanups that have already started.')
  .given('A store has an injected dependency and two resources with asynchronous cleanup.')
  .and('Both resources were removed, and neither cleanup has finished.')
  .when('The store is disposed, and the cleanups finish in the reverse order of their start.')
  .then('The dependency closes only after the last cleanup finishes, and then the store disposal completes.')
  .run(async () => {
    const events: string[] = [];
    const store = storeWithDependency(events);
    const releaseA = addResource(store, 'a', events);
    const releaseB = addResource(store, 'b', events);

    store.disposeProp('a');
    store.disposeProp('b');
    expect(events).toEqual(['a cleanup started', 'b cleanup started']);

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    await nextTick();
    const whileBothPending = { disposalFinished, events: [...events] };

    releaseB.resolve();
    await nextTick();
    const whileOnePending = { disposalFinished, events: [...events] };

    releaseA.resolve();
    await disposal;

    expect({ whileBothPending, whileOnePending, events }).toEqual({
      whileBothPending: { disposalFinished: false, events: ['a cleanup started', 'b cleanup started'] },
      whileOnePending: { disposalFinished: false, events: ['a cleanup started', 'b cleanup started', 'b closed'] },
      events: ['a cleanup started', 'b cleanup started', 'b closed', 'a closed', 'dependency closed'],
    });
  });

Bdd(feature)
  .scenario('Disposing the store waits for a resource cleanup that another cleanup started.')
  .given('A store has an injected dependency and two resources with asynchronous cleanup.')
  .and('The cleanup of the first resource disposes the second resource, which starts its own cleanup.')
  .when('The first resource cleanup starts through <Operation>, and the store disposal runs before the cleanups finish.')
  .then('The store disposal waits for both cleanups.')
  .and('The dependency closes only after the second cleanup finishes, and then the store disposal completes.')
  .example(val('Operation', 'store.disposeProp, before store.dispose'))
  .example(val('Operation', 'store.dispose'))
  .run(async (ctx) => {
    const events: string[] = [];
    const store = storeWithDependency(events);
    const releaseFirst = addResource(store, 'first', events, () => store.disposeProp('second'));
    const releaseSecond = addResource(store, 'second', events);

    if (ctx.example.val('Operation') === 'store.disposeProp, before store.dispose') {
      store.disposeProp('first');
      expect(events).toEqual(['first cleanup started', 'second cleanup started']);
    }

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    await nextTick();
    const whileBothPending = { disposalFinished, events: [...events] };

    releaseFirst.resolve();
    await nextTick();
    const whileSecondPending = { disposalFinished, events: [...events] };

    releaseSecond.resolve();
    await disposal;

    expect({ whileBothPending, whileSecondPending, events }).toEqual({
      whileBothPending: { disposalFinished: false, events: ['first cleanup started', 'second cleanup started'] },
      whileSecondPending: {
        disposalFinished: false,
        events: ['first cleanup started', 'second cleanup started', 'first closed'],
      },
      events: ['first cleanup started', 'second cleanup started', 'first closed', 'second closed', 'dependency closed'],
    });
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('Disposing the store waits for the resource cleanup that logOut started.')
  .given('A store has an injected dependency and a resource with asynchronous cleanup.')
  .and('A logOut that disposes the props started the resource cleanup, which has not finished.')
  .when('The store is disposed before the resource cleanup finishes.')
  .then('The store disposal stays pending, and the dependency stays open.')
  .and('After the resource cleanup finishes, the dependency closes and the store disposal completes.')
  .run(async () => {
    const events: string[] = [];
    const store = storeWithDependency(events);
    const releaseCleanup = addResource(store, 'resource', events);

    const logOut = store.logOut({ initialState: 0, throttle: 0, actionsThrottle: 0, disposeProps: true });
    expect(events).toEqual(['resource cleanup started']);
    expect(store.props.size).toBe(0);

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    await nextTick();
    const whileCleanupIsPending = { disposalFinished, events: [...events] };

    releaseCleanup.resolve();
    await disposal;
    await logOut;

    expect({ whileCleanupIsPending, events }).toEqual({
      whileCleanupIsPending: { disposalFinished: false, events: ['resource cleanup started'] },
      events: ['resource cleanup started', 'resource closed', 'dependency closed'],
    });
  });

Bdd(feature)
  .scenario('Disposing the store waits for a resource cleanup that fails, and reports its error.')
  .given('A store has an errorObserver, an injected dependency, and a resource whose asynchronous cleanup fails.')
  .and('The resource was removed, and its cleanup has not failed yet.')
  .when('The store is disposed before the resource cleanup fails.')
  .then('The store disposal stays pending, and the dependency stays open.')
  .and('After the cleanup fails, the error is given to the errorObserver with a null action, the dependency closes, and the store disposal completes.')
  .run(async () => {
    const events: string[] = [];
    const observed: any[] = [];
    const error = new Error('Cleanup failed');
    const store = new Store({
      initialState: 0,
      logger: null,
      errorObserver: (params) => { observed.push(params); return null; },
      dependencies: () => ({ dispose() { events.push('dependency closed'); } }),
    });
    const failCleanup = new Deferred();
    store.setProp('resource', {}, {
      dispose: async () => {
        events.push('resource cleanup started');
        await failCleanup.promise;
        events.push('resource cleanup failed');
        throw error;
      },
    });

    store.disposeProp('resource');
    expect(events).toEqual(['resource cleanup started']);

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    await nextTick();
    const whileCleanupIsPending = { disposalFinished, observed: observed.length, events: [...events] };

    failCleanup.resolve();
    await disposal;

    expect({ whileCleanupIsPending, events }).toEqual({
      whileCleanupIsPending: { disposalFinished: false, observed: 0, events: ['resource cleanup started'] },
      events: ['resource cleanup started', 'resource cleanup failed', 'dependency closed'],
    });
    expect(observed.length).toBe(1);
    expect(observed[0].error).toBe(error);
    expect(observed[0].action).toBeNull();
  });

Bdd(feature)
  .scenario('A prop set while the store is being disposed is disposed right away, and the store disposal waits for it.')
  .given('A store has an injected dependency and a resource with asynchronous cleanup.')
  .and('The store disposal started, and is waiting for the resource cleanup.')
  .when('Another resource with asynchronous cleanup is set as a prop, as an action that is still running may do.')
  .then('The new resource is not kept, and its cleanup starts right away.')
  .and('The dependency closes only after both cleanups finish, and then the store disposal completes.')
  .run(async () => {
    const events: string[] = [];
    const store = storeWithDependency(events);
    const releaseEarly = addResource(store, 'early', events);

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    await nextTick();
    expect(events).toEqual(['early cleanup started']);

    const releaseLate = addResource(store, 'late', events);
    expect(store.prop('late')).toBeUndefined();
    expect(events).toEqual(['early cleanup started', 'late cleanup started']);

    releaseEarly.resolve();
    await nextTick();
    const whileLateIsPending = { disposalFinished, events: [...events] };

    releaseLate.resolve();
    await disposal;

    expect({ whileLateIsPending, events }).toEqual({
      whileLateIsPending: {
        disposalFinished: false,
        events: ['early cleanup started', 'late cleanup started', 'early closed'],
      },
      events: ['early cleanup started', 'late cleanup started', 'early closed', 'late closed', 'dependency closed'],
    });
  });

Bdd(feature)
  .scenario('The store forgets a resource cleanup that has finished, and does not wait for it again.')
  .given('A store has an injected dependency and a resource with asynchronous cleanup.')
  .and('The resource was removed, and its cleanup finished.')
  .when('The store is disposed.')
  .then('The store keeps no record of the finished cleanup.')
  .and('The dependency closes and the store disposal completes without waiting.')
  .run(async () => {
    const events: string[] = [];
    const store = storeWithDependency(events);
    const releaseCleanup = addResource(store, 'resource', events);

    store.disposeProp('resource');
    expect(pendingDisposals(store)).toBe(1);

    releaseCleanup.resolve();
    await nextTick();
    expect(events).toEqual(['resource cleanup started', 'resource closed']);
    expect(pendingDisposals(store)).toBe(0);

    let disposalFinished = false;
    const disposal = store.dispose().then(() => { disposalFinished = true; });
    await nextTick();
    expect(disposalFinished).toBe(true);
    await disposal;

    expect(events).toEqual(['resource cleanup started', 'resource closed', 'dependency closed']);
    expect(pendingDisposals(store)).toBe(0);
  });

/** A store whose injected dependency records when it closes. */
function storeWithDependency(events: string[]): Store<number> {
  return new Store({
    initialState: 0,
    logger: null,
    dependencies: () => ({
      dispose() { events.push('dependency closed'); },
    }),
  });
}

/**
 * Sets a prop whose asynchronous cleanup waits for the returned Deferred. The cleanup records
 * its start and its end in `events`, and calls `onStart` right after it starts, if given.
 */
function addResource(store: Store<number>, key: string, events: string[], onStart?: () => void): Deferred {
  const release = new Deferred();
  store.setProp(key, {}, {
    dispose: async () => {
      events.push(`${key} cleanup started`);
      onStart?.();
      await release.promise;
      events.push(`${key} closed`);
    },
  });
  return release;
}

/** The number of asynchronous prop cleanups the store is still keeping track of. */
function pendingDisposals(store: Store<number>): number {
  return (store as any)._pendingDisposals.size;
}

function resourceStore() {
  const releaseCleanup = new Deferred();
  const cleanupFinished = new Deferred();
  const events: string[] = [];
  const resource = {};
  const store = new Store({
    initialState: 0,
    logger: null,
    dependencies: () => ({
      dispose() { events.push('dependency closed'); },
    }),
  });
  store.setProp('resource', resource, {
    dispose: async () => {
      events.push('resource cleanup started');
      await releaseCleanup.promise;
      events.push('resource closed');
      cleanupFinished.resolve();
    },
  });
  return { store, resource, releaseCleanup, cleanupFinished, events };
}
