import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Store waitActionType');

type St = { name: string };

class ChangeName extends KissAction<St> {
  async reduce() {
    await new Promise((r) => setTimeout(r, 10));
    return () => ({ name: 'Bill' });
  }
}

class DoALot extends KissAction<St> {
  async reduce() {
    await new Promise((r) => setTimeout(r, 10));
    this.dispatch(new ChangeName());
    return null;
  }
}

Bdd(feature)
  .scenario('The store waits until no action of a given type is in progress.')
  .given('An async action of type ChangeName was dispatched and is in progress.')
  .when('We wait for the ChangeName type.')
  .then('The wait resolves with that action, after it finishes and changes the state.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { name: '' }, logger: () => {} });
    store.dispatch(new ChangeName());
    const action = await store.waitActionType(ChangeName);
    expect(action).toBeInstanceOf(ChangeName);
    expect(action!.status.isCompletedOk).toBe(true);
    expect(store.state.name).toBe('Bill');
  });

Bdd(feature)
  .scenario('To wait for an action that is dispatched later, the store waits for any action of that type to finish.')
  .given('An action that later dispatches a ChangeName action.')
  .when('We dispatch it, and wait for any ChangeName action to finish.')
  .then('The wait resolves with the ChangeName action, and its state change is applied.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { name: '' }, logger: () => {} });
    store.dispatch(new DoALot());
    const action = await store.waitAnyActionTypeFinishes([ChangeName]);
    expect(action).toBeInstanceOf(ChangeName);
    expect(store.state.name).toBe('Bill');
  });
