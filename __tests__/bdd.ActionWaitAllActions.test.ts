import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, StoreException, TimeoutException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('waitAllActions inside an action');

type St = { stocks: string[] };

class BuyAction extends KissAction<St> {
  constructor(readonly stock: string) {
    super();
  }

  async reduce() {
    await new Promise(r => setTimeout(r, 10));
    return (state: St) => ({ stocks: [...state.stocks, this.stock] });
  }
}

function createStore() {
  Store.log = () => {};
  return new Store<St>({ initialState: { stocks: [] } });
}

Bdd(feature)
  .scenario('Inside an action, waitAllActions with an empty list fails right away, instead of timing out.')
  .given('An action that dispatches two other actions.')
  .when('The action calls waitAllActions([]) to wait until no actions are in progress.')
  .then('The action fails with a StoreException, and not with a TimeoutException.')
  .and('It fails right away, since the action itself is in progress, so it could never complete.')
  .run(async (_) => {
    const store = createStore();

    class Outer extends KissAction<St> {
      async reduce() {
        this.dispatch(new BuyAction('IBM'));
        this.dispatch(new BuyAction('TSLA'));
        await this.waitAllActions([], { timeoutMillis: 300 });
        return null;
      }
    }

    const outer = new Outer();
    const start = Date.now();
    await expect(store.dispatchAndWait(outer)).rejects.toThrow('non-empty list of actions');

    expect(outer.status.originalError).toBeInstanceOf(StoreException);
    expect(outer.status.originalError).not.toBeInstanceOf(TimeoutException);
    expect(Date.now() - start).toBeLessThan(200);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActions with null fails right away, instead of timing out.')
  .given('An action that dispatches another action.')
  .when('The action calls waitAllActions(null).')
  .then('The action fails with a StoreException, and not with a TimeoutException.')
  .run(async (_) => {
    const store = createStore();

    class Outer extends KissAction<St> {
      async reduce() {
        this.dispatch(new BuyAction('IBM'));
        await this.waitAllActions(null, { timeoutMillis: 300 });
        return null;
      }
    }

    const outer = new Outer();
    await expect(store.dispatchAndWait(outer)).rejects.toThrow('non-empty list of actions');

    expect(outer.status.originalError).toBeInstanceOf(StoreException);
    expect(outer.status.originalError).not.toBeInstanceOf(TimeoutException);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActions waits for the given actions to finish.')
  .given('An action that dispatches two actions in parallel.')
  .when('The action calls waitAllActions with those two actions.')
  .then('It waits until both finish, and the action completes ok.')
  .run(async (_) => {
    const store = createStore();

    class Outer extends KissAction<St> {
      stocksWhenDone: string[] = [];

      async reduce() {
        const action1 = new BuyAction('IBM');
        const action2 = new BuyAction('TSLA');
        this.dispatch(action1);
        this.dispatch(action2);
        await this.waitAllActions([action1, action2]);
        this.stocksWhenDone = this.state.stocks;
        return null;
      }
    }

    const outer = new Outer();
    const status = await store.dispatchAndWait(outer);

    expect(status.originalError).toBe(null);
    expect(status.isCompletedOk).toBe(true);
    expect(outer.stocksWhenDone).toEqual(['IBM', 'TSLA']);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActions ignores the action itself, if it is in the list.')
  .given('An action that dispatches another action.')
  .when('The action calls waitAllActions with the other action and with itself.')
  .then('It waits only for the other action to finish, and the action completes ok.')
  .run(async (_) => {
    const store = createStore();

    class Outer extends KissAction<St> {
      stocksWhenDone: string[] = [];

      async reduce() {
        const buy = new BuyAction('IBM');
        this.dispatch(buy);
        await this.waitAllActions([buy, this], { timeoutMillis: 300 });
        this.stocksWhenDone = this.state.stocks;
        return null;
      }
    }

    const outer = new Outer();
    const status = await store.dispatchAndWait(outer);

    expect(status.originalError).toBe(null);
    expect(outer.stocksWhenDone).toEqual(['IBM']);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActions with only the action itself completes right away.')
  .given('An action that is in progress.')
  .when('The action calls waitAllActions with only itself.')
  .then('There is nothing else to wait for, so it completes right away, and the action completes ok.')
  .run(async (_) => {
    const store = createStore();

    class Outer extends KissAction<St> {
      async reduce() {
        await this.waitAllActions([this], { timeoutMillis: 300 });
        return null;
      }
    }

    const start = Date.now();
    const status = await store.dispatchAndWait(new Outer());

    expect(status.originalError).toBe(null);
    expect(Date.now() - start).toBeLessThan(200);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActionTypes with an empty list fails right away, instead of timing out.')
  .given('An action that dispatches another action.')
  .when('The action calls waitAllActionTypes([]) to wait until no actions are in progress.')
  .then('The action fails with a StoreException, and not with a TimeoutException.')
  .run(async (_) => {
    const store = createStore();

    class Outer extends KissAction<St> {
      async reduce() {
        this.dispatch(new BuyAction('IBM'));
        await this.waitAllActionTypes([], { timeoutMillis: 300 });
        return null;
      }
    }

    const outer = new Outer();
    await expect(store.dispatchAndWait(outer)).rejects.toThrow('non-empty list of action types');

    expect(outer.status.originalError).toBeInstanceOf(StoreException);
    expect(outer.status.originalError).not.toBeInstanceOf(TimeoutException);
  });

Bdd(feature)
  .scenario('Inside an action, waitAllActionTypes ignores the type of the action itself, if it is in the list.')
  .given('An action that dispatches a BuyAction.')
  .when('The action calls waitAllActionTypes with BuyAction and with its own type.')
  .then('It waits only for the BuyAction to finish, and the action completes ok.')
  .run(async (_) => {
    const store = createStore();

    class Outer extends KissAction<St> {
      stocksWhenDone: string[] = [];

      async reduce() {
        this.dispatch(new BuyAction('IBM'));
        await this.waitAllActionTypes([BuyAction, Outer], { timeoutMillis: 300 });
        this.stocksWhenDone = this.state.stocks;
        return null;
      }
    }

    const outer = new Outer();
    const status = await store.dispatchAndWait(outer);

    expect(status.originalError).toBe(null);
    expect(outer.stocksWhenDone).toEqual(['IBM']);
  });

Bdd(feature)
  .scenario('Outside of actions, store.waitAllActions([]) still waits until no actions are in progress.')
  .given('Two actions are dispatched in parallel.')
  .when('The test calls store.waitAllActions([]).')
  .then('It waits until both actions finish.')
  .run(async (_) => {
    const store = createStore();

    store.dispatch(new BuyAction('IBM'));
    store.dispatch(new BuyAction('TSLA'));
    await store.waitAllActions([]);

    expect(store.state.stocks).toEqual(['IBM', 'TSLA']);
    expect(store.actionsInProgress().size).toBe(0);
  });
