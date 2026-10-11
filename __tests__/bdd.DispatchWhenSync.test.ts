import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('dispatchWhen dispatches synchronously');

type St = { n: number };

class Inc extends KissAction<St> {
  reduce() { return { n: this.state.n + 1 }; }
}

class SetN extends KissAction<St> {
  constructor(readonly value: number) { super(); }
  reduce() { return { n: this.value }; }
}

class IncAsync extends KissAction<St> {
  async reduce() {
    await new Promise(r => setTimeout(r, 1));
    return (state: St) => ({ n: state.n + 1 });
  }
}

Bdd(feature)
  .scenario('If the condition is already true, the action is dispatched before dispatchWhen returns.')
  .given('The state already meets the condition.')
  .when('We call dispatchWhen with a sync action.')
  .then('The state was already changed by the action when dispatchWhen returns.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });

    store.dispatchWhen(new SetN(5), s => s.n === 0, { timeoutMillis: 0 });
    expect(store.state.n).toBe(5);

    store.dispatchWhen(new SetN(7), s => s.n === 5, { timeoutMillis: 1000 });
    expect(store.state.n).toBe(7);
  });

Bdd(feature)
  .scenario('When an action makes the condition true, the action is dispatched before that dispatch returns.')
  .given('A dispatchWhen waiting for n to be 1.')
  .when('A sync action changes n to 1.')
  .then('The dispatchWhen action was already dispatched when that dispatch returns.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });

    store.dispatchWhen(new SetN(100), s => s.n === 1, { timeoutMillis: 1000 });
    store.dispatch(new Inc());

    expect(store.state.n).toBe(100);
  });

Bdd(feature)
  .scenario('The action is dispatched in the state that met the condition, even if the next dispatch would change it.')
  .given('A dispatchWhen that sets n to 100 when n is 1.')
  .when('Two sync actions increment n, one right after the other.')
  .then('The dispatchWhen action is dispatched right after the first one, when n is 1.')
  .and('The second increment is applied after it.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });

    store.dispatchWhen(new SetN(100), s => s.n === 1, { timeoutMillis: 1000 });
    store.dispatch(new Inc());
    store.dispatch(new Inc());
    await new Promise(r => setTimeout(r, 0));

    expect(store.state.n).toBe(101);
  });

Bdd(feature)
  .scenario('When an async action makes the condition true, the action is dispatched as soon as the state changes.')
  .given('A dispatchWhen waiting for n to be 1.')
  .when('An async action changes n to 1.')
  .then('The dispatchWhen action was already dispatched when the async action finishes.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });

    store.dispatchWhen(new SetN(100), s => s.n === 1, { timeoutMillis: 1000 });
    await store.dispatchAndWait(new IncAsync());

    expect(store.state.n).toBe(100);
  });

Bdd(feature)
  .scenario('Other waits for the same state still see the state that met their condition.')
  .given('A dispatchWhen that resets n to 0 when n is 1.')
  .and('A waitCondition, created after it, that waits for n to be 1.')
  .when('An action changes n to 1.')
  .then('The waitCondition resolves with that action.')
  .and('The state is 0, because the dispatchWhen action was dispatched.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });

    store.dispatchWhen(new SetN(0), s => s.n === 1, { timeoutMillis: 1000 });
    const wait = store.waitCondition(s => s.n === 1, { timeoutMillis: 1000 });

    const action = new Inc();
    store.dispatch(action);

    expect(store.state.n).toBe(0);
    await expect(wait).resolves.toBe(action);
  });

Bdd(feature)
  .scenario('dispatchWhen does not throw, and does not dispatch, when the condition throws.')
  .given('A condition that throws.')
  .when('We call dispatchWhen with it, or the state changes while it waits.')
  .then('dispatchWhen and the action that changed the state do not throw.')
  .and('The dispatchWhen action is not dispatched.')
  .and('The error is logged.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = new Store<St>({ initialState: { n: 0 }, logger: (obj: any) => logs.push(String(obj)) });

    // Throws right away.
    expect(() => store.dispatchWhen(new SetN(100), () => { throw new Error('now'); }, { timeoutMillis: 0 }))
      .not.toThrow();

    // Throws later, when the state changes.
    store.dispatchWhen(new SetN(100), s => { if (s.n === 1) throw new Error('later'); return false; },
      { timeoutMillis: 0 });
    const action = new Inc();
    expect(() => store.dispatch(action)).not.toThrow();

    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.n).toBe(1);
    expect(logs.some(log => log.includes('dispatchWhen failed') && log.includes('now'))).toBe(true);
    expect(logs.some(log => log.includes('dispatchWhen failed') && log.includes('later'))).toBe(true);
  });

Bdd(feature)
  .scenario('When the condition is met, the timeout no longer fires.')
  .given('A dispatchWhen with a short timeout and an onTimeout callback.')
  .when('The condition is met before the timeout.')
  .then('The action is dispatched, and onTimeout is never called.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });
    let timeouts = 0;

    store.dispatchWhen(new SetN(100), s => s.n === 1, { timeoutMillis: 20, onTimeout: () => timeouts++ });
    store.dispatch(new Inc());
    await new Promise(r => setTimeout(r, 50));

    expect(store.state.n).toBe(100);
    expect(timeouts).toBe(0);
  });
