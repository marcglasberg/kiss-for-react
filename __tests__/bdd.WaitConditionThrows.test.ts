import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Wait condition that throws');

type St = { n: number };

class Inc extends KissAction<St> {
  reduce() { return { n: this.state.n + 1 }; }
}

class Delay extends KissAction<St> {
  async reduce() {
    await new Promise(r => setTimeout(r, 10));
    return null;
  }
}

Bdd(feature)
  .scenario('A waitCondition whose condition throws rejects its own promise, without affecting the action.')
  .given('A pending waitCondition whose condition throws when n becomes 1.')
  .and('Another pending waitCondition that waits for n to be 1.')
  .when('An action changes n to 1.')
  .then('The action completes ok, and dispatch does not throw.')
  .and('The throwing waitCondition rejects with the condition\'s error.')
  .and('The other waitCondition still resolves with the action.')
  .run(async (_) => {
    Store.log = () => {};
    const store = new Store<St>({ initialState: { n: 0 } });

    const failing = store.waitCondition(
      (s) => { if (s.n === 1) throw new Error('cond'); return false; },
      { timeoutMillis: 0 });
    const ok = store.waitCondition((s) => s.n === 1, { timeoutMillis: 0 });
    const failingResult = expect(failing).rejects.toThrow('cond');

    const action = new Inc();
    expect(() => store.dispatch(action)).not.toThrow();

    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.n).toBe(1);
    await failingResult;
    await expect(ok).resolves.toBe(action);
  });

Bdd(feature)
  .scenario('A waitActionCondition whose condition throws rejects its own promise, without affecting the action.')
  .given('A pending waitActionCondition whose condition throws when an action is dispatched.')
  .when('An action is dispatched.')
  .then('The action completes ok.')
  .and('The waitActionCondition rejects with the condition\'s error.')
  .run(async (_) => {
    Store.log = () => {};
    const store = new Store<St>({ initialState: { n: 0 } });

    const failing = store.waitActionCondition(
      (_actions, trigger) => { if (trigger !== null) throw new Error('cond'); return false; },
      { timeoutMillis: 0 });
    const failingResult = expect(failing).rejects.toThrow('cond');

    const action = new Delay();
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
    await failingResult;
  });
