import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Wait any action type finishes');

class State {
  constructor(readonly count: number) {
  }
}

class SlowAction extends KissAction<State> {
  async reduce() {
    await delayMillis(50);
    return (state: State) => new State(state.count + 1);
  }
}

class OtherSlowAction extends KissAction<State> {
  async reduce() {
    await delayMillis(10);
    return (state: State) => new State(state.count + 10);
  }
}

Bdd(feature)
  .scenario('Waiting for an action type to finish, without passing options.')
  .given('No actions are in progress.')
  .and('We wait for any action of a type to finish, passing only the action types.')
  .when('An action of that type is dispatched and finishes.')
  .then('The wait resolves with the action that finished.')
  .and('The state was changed by that action.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(0)});

    const promise = store.waitAnyActionTypeFinishes([SlowAction]);

    const action = new SlowAction();
    store.dispatch(action);

    const finished = await promise;
    expect(finished).toBe(action);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Waiting without options ignores actions of other types.')
  .given('We wait for any action of a type to finish, passing only the action types.')
  .when('An action of another type finishes first.')
  .and('Then an action of the awaited type finishes.')
  .then('The wait resolves only with the action of the awaited type.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(0)});

    const promise = store.waitAnyActionTypeFinishes([SlowAction]);

    const action = new SlowAction();
    store.dispatch(new OtherSlowAction());
    store.dispatch(action);

    const finished = await promise;
    expect(finished).toBe(action);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('Waiting for an action type to finish, passing a timeout.')
  .given('We wait for any action of a type to finish, with a short timeout.')
  .when('No action of that type is dispatched.')
  .then('The wait fails with a timeout.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(0)});

    await expect(store.waitAnyActionTypeFinishes([SlowAction], {timeoutMillis: 20}))
      .rejects.toThrow('Timeout');
  });
