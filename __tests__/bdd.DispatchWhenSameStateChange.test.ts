import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('dispatchWhen met by the same state change');

type St = { cash: number, bought: number, log: string[] };

const initialState: St = { cash: 0, bought: 0, log: [] };

class SetCash extends KissAction<St> {
  constructor(readonly cash: number) { super(); }
  reduce() { return { ...this.state, cash: this.cash }; }
}

class Buy extends KissAction<St> {
  reduce() { return { ...this.state, cash: this.state.cash - 100, bought: this.state.bought + 1 }; }
}

class BuyAsync extends KissAction<St> {
  async reduce() {
    await delayMillis(1);
    return (state: St) => ({ ...state, cash: state.cash - 100, bought: state.bought + 1 });
  }
}

class Log extends KissAction<St> {
  constructor(readonly text: string) { super(); }
  reduce() { return { ...this.state, log: [...this.state.log, this.text] }; }
}

Bdd(feature)
  .scenario('A dispatchWhen is not dispatched if an earlier one, met by the same state change, made its condition false.')
  .given('Two dispatchWhen that buy for 100 when the cash is at least 100.')
  .when('The cash is set to 100.')
  .then('Only the first buy is dispatched, since after it the cash is 0.')
  .and('The cash never goes below zero.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 0 });

    // When:
    store.dispatch(new SetCash(100));

    // Then:
    expect(store.state.bought).toBe(1);
    expect(store.state.cash).toBe(0);
  });

Bdd(feature)
  .scenario('A dispatchWhen whose condition was made false keeps waiting, and is dispatched when it is met again.')
  .given('Two dispatchWhen that buy for 100 when the cash is at least 100.')
  .and('The cash was set to 100, so only the first one was dispatched.')
  .when('The cash is set to 100 again.')
  .then('The second buy is dispatched now.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatch(new SetCash(100));
    expect(store.state.bought).toBe(1);

    // When:
    store.dispatch(new SetCash(100));

    // Then:
    expect(store.state.bought).toBe(2);
    expect(store.state.cash).toBe(0);
  });

Bdd(feature)
  .scenario('A dispatchWhen whose condition was made false keeps its timeout.')
  .given('Two dispatchWhen that buy for 100 when the cash is at least 100, with a timeout and an onTimeout.')
  .and('The cash was set to 100, so only the first one was dispatched.')
  .when('The timeout expires, and the cash is never 100 again.')
  .then('The second buy is never dispatched, and its onTimeout is called.')
  .and('The first one does not call its onTimeout.')
  .run(async (_) => {
    // Given:
    const timedOut: string[] = [];
    const store = new Store<St>({ initialState });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 20, onTimeout: () => timedOut.push('1st') });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 20, onTimeout: () => timedOut.push('2nd') });
    store.dispatch(new SetCash(100));
    expect(store.state.bought).toBe(1);

    // When:
    await delayMillis(50);
    store.dispatch(new SetCash(100));

    // Then:
    expect(timedOut).toEqual(['2nd']);
    expect(store.state.bought).toBe(1);
    expect(store.state.cash).toBe(100);
  });

Bdd(feature)
  .scenario('All dispatchWhen met by the same state change are dispatched, if none makes the others false.')
  .given('Three dispatchWhen that log a text when the cash is at least 100.')
  .when('The cash is set to 100.')
  .then('The three are dispatched, in the order of the dispatchWhen calls.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState });
    store.dispatchWhen(new Log('A'), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Log('B'), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Log('C'), s => s.cash >= 100, { timeoutMillis: 0 });

    // When:
    store.dispatch(new SetCash(100));

    // Then:
    expect(store.state.log).toEqual(['A', 'B', 'C']);
  });

Bdd(feature)
  .scenario('A dispatchWhen whose condition is made false is skipped, but the ones after it are still dispatched.')
  .given('A dispatchWhen that buys for 100 when the cash is at least 100.')
  .and('Another one, that also buys for 100 when the cash is at least 100.')
  .and('A third one, that logs a text when the cash is at least 0.')
  .when('The cash is set to 100.')
  .then('The first buy and the log are dispatched, but not the second buy.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState: { ...initialState, cash: -1 } });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Log('A'), s => s.cash >= 0, { timeoutMillis: 0 });

    // When:
    store.dispatch(new SetCash(100));

    // Then:
    expect(store.state.bought).toBe(1);
    expect(store.state.cash).toBe(0);
    expect(store.state.log).toEqual(['A']);
  });

Bdd(feature)
  .scenario('An async dispatchWhen action does not change the state in between, so the next one is still dispatched.')
  .given('Two dispatchWhen with an async action that buys for 100 when the cash is at least 100.')
  .when('The cash is set to 100.')
  .then('Both async buys are dispatched, since the state only changes when they finish.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState });
    store.dispatchWhen(new BuyAsync(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new BuyAsync(), s => s.cash >= 100, { timeoutMillis: 0 });

    // When:
    store.dispatch(new SetCash(100));
    await store.waitAllActions([]);

    // Then:
    expect(store.state.bought).toBe(2);
    expect(store.state.cash).toBe(-100);
  });

Bdd(feature)
  .scenario('A dispatchWhen whose condition throws when checked again does not dispatch, and does not affect the others.')
  .given('A dispatchWhen that buys for 100 when the cash is at least 100.')
  .and('A dispatchWhen whose condition is met when the cash is 100, but throws when the cash is 0.')
  .and('A dispatchWhen that logs a text when the cash is at least 0.')
  .when('The cash is set to 100.')
  .then('The buy and the log are dispatched, but not the action of the condition that throws.')
  .and('The error is logged.')
  .run(async (_) => {
    // Given:
    const logs: string[] = [];
    const store = new Store<St>({ initialState: { ...initialState, cash: -1 }, logger: o => logs.push(String(o)) });
    store.dispatchWhen(new Buy(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Log('X'), s => {
      if (s.cash === 0) throw new Error('Condition failed');
      return s.cash >= 100;
    }, { timeoutMillis: 0 });
    store.dispatchWhen(new Log('A'), s => s.cash >= 0, { timeoutMillis: 0 });

    // When:
    store.dispatch(new SetCash(100));

    // Then:
    expect(store.state.bought).toBe(1);
    expect(store.state.log).toEqual(['A']);
    expect(logs.some(log => log.includes('dispatchWhen failed') && log.includes('Condition failed'))).toBe(true);

    // The failed dispatchWhen stopped waiting: it's not dispatched when its condition is met again.
    store.dispatch(new SetCash(100));
    expect(store.state.log).toEqual(['A']);
  });

Bdd(feature)
  .scenario('A logOut dispatched by a dispatchWhen action cancels the next ones met by the same state change.')
  .given('A dispatchWhen that logs out when the cash is at least 100.')
  .and('A dispatchWhen that logs a text when the cash is at least 100.')
  .when('The cash is set to 100.')
  .then('The log out cancels the second dispatchWhen, which is not dispatched.')
  .run(async (_) => {
    // Given:
    let logOutPromise: Promise<void> | undefined;

    class LogOut extends KissAction<St> {
      reduce() {
        logOutPromise = this.store.logOut({ initialState });
        return null;
      }
    }

    const store = new Store<St>({ initialState });
    store.dispatchWhen(new LogOut(), s => s.cash >= 100, { timeoutMillis: 0 });
    store.dispatchWhen(new Log('A'), s => s.cash >= 100, { timeoutMillis: 0 });

    // When:
    store.dispatch(new SetCash(100));
    await logOutPromise;

    // Then:
    expect(store.state.log).toEqual([]);
  });
