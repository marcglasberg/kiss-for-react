import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('waitActionType inside an action');

type St = { n: number };

class Other extends KissAction<St> {
  async reduce() {
    await new Promise(r => setTimeout(r, 10));
    return (state: St) => ({ n: state.n + 1 });
  }
}

class WaitForOther extends KissAction<St> {
  waited: KissAction<St> | null | undefined = undefined;

  async reduce() {
    this.waited = await this.waitActionType(Other);
    return null;
  }
}

Bdd(feature)
  .scenario('Inside an action, waitActionType resolves right away when no action of that type is running.')
  .given('No action of type Other is running.')
  .when('An action calls waitActionType(Other), without passing completeImmediately.')
  .then('The action completes ok, and waitActionType returns null.')
  .run(async (_) => {
    Store.log = () => {};
    const store = new Store<St>({ initialState: { n: 0 } });

    const action = new WaitForOther();
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
    expect(action.waited).toBeNull();
  });

Bdd(feature)
  .scenario('Inside an action, waitActionType waits for a running action of that type to finish.')
  .given('An action of type Other is running.')
  .when('An action calls waitActionType(Other).')
  .then('It waits until Other finishes, and returns it.')
  .run(async (_) => {
    Store.log = () => {};
    const store = new Store<St>({ initialState: { n: 0 } });

    const other = new Other();
    store.dispatch(other);
    const action = new WaitForOther();
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
    expect(action.waited).toBe(other);
    expect(store.state.n).toBe(1);
  });

Bdd(feature)
  .scenario('Inside an action, waitActionType still throws when no action is running, if completeImmediately is false.')
  .given('No action of type Other is running.')
  .when('An action calls waitActionType(Other, { completeImmediately: false }).')
  .then('The action fails.')
  .run(async (_) => {
    Store.log = () => {};
    const store = new Store<St>({ initialState: { n: 0 } });

    class StrictWait extends KissAction<St> {
      async reduce() {
        await this.waitActionType(Other, { completeImmediately: false });
        return null;
      }
    }

    const action = new StrictWait();
    await expect(store.dispatchAndWait(action)).rejects.toThrow('No action of the given type was in progress');

    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActionTypes resolves right away when no action of those types is running.')
  .given('No action of type Other is running.')
  .when('An action calls waitAllActionTypes([Other]), without passing completeImmediately.')
  .then('The action completes ok.')
  .run(async (_) => {
    Store.log = () => {};
    const store = new Store<St>({ initialState: { n: 0 } });

    class WaitAll extends KissAction<St> {
      async reduce() {
        await this.waitAllActionTypes([Other]);
        return null;
      }
    }

    const action = new WaitAll();
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActionTypes waits for running actions of those types to finish.')
  .given('An action of type Other is running.')
  .when('An action calls waitAllActionTypes([Other]).')
  .then('It waits until Other finishes.')
  .run(async (_) => {
    Store.log = () => {};
    const store = new Store<St>({ initialState: { n: 0 } });

    class WaitAll extends KissAction<St> {
      nWhenDone = -1;
      async reduce() {
        await this.waitAllActionTypes([Other]);
        this.nWhenDone = this.state.n;
        return null;
      }
    }

    store.dispatch(new Other());
    const action = new WaitAll();
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
    expect(action.nWhenDone).toBe(1);
  });
