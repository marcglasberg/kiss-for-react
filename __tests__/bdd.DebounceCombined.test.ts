import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ActionStatus, KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Debounce combined with nonReentrant, throttle and fresh');
const logger = (_obj: any) => {};

class State {
  constructor(readonly text: string) {
  }

  toString() {
    return `State(${this.text})`;
  }
}

// Async action, debounced for 30 millis, that searches for `text`, and saves it in the state.
// The trace records its `before`, `reduce` and `after`.
class Search extends KissAction<State> {
  debounce: number | boolean = 30;

  constructor(readonly text: string, readonly trace: string[] = [], readonly reduceMillis = 1) { super(); }

  before() { this.trace.push(`before ${this.text}`); }

  async reduce() {
    this.trace.push(`reduce ${this.text}`);
    await delayMillis(this.reduceMillis);
    return (_state: State) => new State(this.text);
  }

  after() { this.trace.push(`after ${this.text}`); }
}

class SearchNonReentrant extends Search {
  nonReentrant = true;
}

class SearchThrottle extends Search {
  throttle = 300;
}

class SearchFresh extends Search {
  fresh = 300;
}

// The `Search` action that is debounced and also uses the given feature.
function searchWith(feature: string): typeof Search {
  if (feature === 'nonReentrant') return SearchNonReentrant;
  if (feature === 'throttle') return SearchThrottle;
  if (feature === 'fresh') return SearchFresh;
  throw new Error(`Unknown feature: ${feature}`);
}

const store = () => new Store<State>({ initialState: new State(''), logger: logger });

Bdd(feature)
  .scenario('Only the last of several quick dispatches runs its reducer, when debounce is combined with another feature.')
  .given('An action with debounce, combined with nonReentrant, throttle or fresh.')
  .when('The action is dispatched 3 times in quick succession.')
  .then('Only the last action runs its reducer, after the debounce period.')
  .and('No dispatch is aborted.')
  .and('The first two actions finish without running their reducers, and without failing.')
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .run(async (ctx) => {
    const SearchAction = searchWith(ctx.example.val('Feature'));
    const log: string[] = [];
    const st = store();

    const promises = [
      st.dispatchAndWait(new SearchAction('a', log)),
      st.dispatchAndWait(new SearchAction('ab', log)),
      st.dispatchAndWait(new SearchAction('abc', log)),
    ];
    const statuses: ActionStatus[] = await Promise.all(promises);

    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce abc']);
    expect(st.state.text).toBe('abc');
    expect(statuses.map(status => status.isDispatchAborted)).toEqual([false, false, false]);
    expect(statuses.map(status => status.isCompletedOk)).toEqual([true, true, true]);
  });

Bdd(feature)
  .scenario('Each dispatch resets the debounce period, when debounce is combined with another feature.')
  .given('An action with debounce, combined with nonReentrant, throttle or fresh.')
  .when('The action is dispatched several times, each one before the debounce period of the previous ends.')
  .then('No action runs until the dispatches stop for the debounce period.')
  .and('Then only the last action runs its reducer.')
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .run(async (ctx) => {
    class SearchAction extends searchWith(ctx.example.val('Feature')) {
      debounce = 150;
    }

    const log: string[] = [];
    const st = store();

    const texts = ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg'];
    for (const text of texts) {
      st.dispatch(new SearchAction(text, log));
      await delayMillis(30);
    }
    // 210 millis passed, which is more than the 150 millis debounce, but no action ran.
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual([]);

    await st.waitAllActions([]);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce abcdefg']);
    expect(st.state.text).toBe('abcdefg');
  });

Bdd(feature)
  .scenario('A debounced nonReentrant action is aborted if, when its debounce period ends, another one with the same key is running its reducer.')
  .given('An action with debounce and nonReentrant.')
  .and('The action was dispatched, and is running its slow reducer.')
  .when('The action is dispatched again.')
  .and('Its debounce period ends while the first reducer is still running.')
  .then('The second action is aborted, without running its reducer.')
  .and('Its before and after methods still run.')
  .and('The first action is not affected.')
  .run(async (_) => {
    const log: string[] = [];
    const st = store();

    const first = st.dispatchAndWait(new SearchNonReentrant('a', log, 150));
    await delayMillis(50);
    expect(log).toEqual(['before a', 'reduce a']);

    const secondStatus = await st.dispatchAndWait(new SearchNonReentrant('ab', log));
    expect(secondStatus.isDispatchAborted).toBe(true);
    expect(log).toEqual(['before a', 'reduce a', 'before ab', 'after ab']);
    expect(st.state.text).toBe('');

    const firstStatus = await first;
    expect(firstStatus.isCompletedOk).toBe(true);
    expect(st.state.text).toBe('a');
  });

Bdd(feature)
  .scenario('A debounced nonReentrant action dispatched while another one runs its reducer still runs, if the other one finished before its debounce period ends.')
  .given('An action with debounce and nonReentrant.')
  .and('The action was dispatched, and is running its reducer.')
  .when('The action is dispatched again.')
  .and('The first reducer finishes before the debounce period of the second action ends.')
  .then('The second action is not aborted, and runs its reducer.')
  .run(async (_) => {
    const log: string[] = [];
    const st = store();

    const first = st.dispatchAndWait(new SearchNonReentrant('a', log, 15));
    await delayMillis(40);
    expect(log).toEqual(['before a', 'reduce a']);

    const secondStatus = await st.dispatchAndWait(new SearchNonReentrant('ab', log));
    expect((await first).isCompletedOk).toBe(true);
    expect(secondStatus.isDispatchAborted).toBe(false);
    expect(secondStatus.isCompletedOk).toBe(true);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce a', 'reduce ab']);
    expect(st.state.text).toBe('ab');
  });

Bdd(feature)
  .scenario('The throttle period of a debounced action starts when its debounce period ends.')
  .given('An action with a 30 millis debounce and a 300 millis throttle.')
  .and('The action was dispatched, and ran its reducer after its debounce period.')
  .when('The action is dispatched a 2nd time, and its debounce period ends inside the throttle period.')
  .and('The action is dispatched a 3rd time, and its debounce period ends after the throttle period.')
  .then('The second action is aborted when its debounce period ends, without running its reducer.')
  .and('Its before and after methods still run.')
  .and('The third action runs its reducer.')
  .run(async (_) => {
    const log: string[] = [];
    const st = store();

    // The 1st debounce period ends at 30 millis, and the throttle period then ends at 330 millis.
    await st.dispatchAndWait(new SearchThrottle('a', log));
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce a']);

    // The 2nd debounce period ends at about 60 millis.
    const secondStatus = await st.dispatchAndWait(new SearchThrottle('ab', log));
    expect(secondStatus.isDispatchAborted).toBe(true);
    expect(log).toEqual(['before a', 'reduce a', 'after a', 'before ab', 'after ab']);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce a']);
    expect(st.state.text).toBe('a');

    // The 3rd debounce period ends at about 390 millis.
    await delayMillis(300);
    const thirdStatus = await st.dispatchAndWait(new SearchThrottle('abc', log));
    expect(thirdStatus.isCompletedOk).toBe(true);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce a', 'reduce abc']);
    expect(st.state.text).toBe('abc');
  });

Bdd(feature)
  .scenario('The fresh period of a debounced action starts when its debounce period ends.')
  .given('An action with a 30 millis debounce and a 300 millis fresh period.')
  .and('The action was dispatched, and ran its reducer after its debounce period.')
  .when('The action is dispatched a 2nd time, and its debounce period ends inside the fresh period.')
  .and('The action is dispatched a 3rd time, and its debounce period ends after the fresh period.')
  .then('The second action is aborted when its debounce period ends, without running its reducer.')
  .and('Its before and after methods still run.')
  .and('The third action runs its reducer.')
  .run(async (_) => {
    const log: string[] = [];
    const st = store();

    // The 1st debounce period ends at 30 millis, and the fresh period then ends at 330 millis.
    await st.dispatchAndWait(new SearchFresh('a', log));
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce a']);

    // The 2nd debounce period ends at about 60 millis.
    const secondStatus = await st.dispatchAndWait(new SearchFresh('ab', log));
    expect(secondStatus.isDispatchAborted).toBe(true);
    expect(log).toEqual(['before a', 'reduce a', 'after a', 'before ab', 'after ab']);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce a']);
    expect(st.state.text).toBe('a');

    // The 3rd debounce period ends at about 390 millis.
    await delayMillis(300);
    const thirdStatus = await st.dispatchAndWait(new SearchFresh('abc', log));
    expect(thirdStatus.isCompletedOk).toBe(true);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce a', 'reduce abc']);
    expect(st.state.text).toBe('abc');
  });

Bdd(feature)
  .scenario('A debounced action that did not run its reducer does not take its throttle lock or make its key fresh.')
  .given('An action with debounce, combined with throttle or fresh.')
  .and('The throttle lock or the fresh-key is the text being searched.')
  .and('The action was dispatched to search "a", and then to search "ab", in quick succession.')
  .and('So only "ab" was searched.')
  .when('The action is dispatched again, to search "a".')
  .then('It runs its reducer, since "a" was never searched.')
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .run(async (ctx) => {
    const feature = ctx.example.val('Feature');

    class SearchByText extends searchWith(feature) {
      throttleLockBuilder() { return this.text; }

      freshKeyParams() { return this.text; }
    }

    const log: string[] = [];
    const st = store();

    st.dispatch(new SearchByText('a', log));
    st.dispatch(new SearchByText('ab', log));
    await st.waitAllActions([]);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce ab']);

    const status = await st.dispatchAndWait(new SearchByText('a', log));
    expect(status.isDispatchAborted).toBe(false);
    expect(log.filter(entry => entry.startsWith('reduce'))).toEqual(['reduce ab', 'reduce a']);
    expect(st.state.text).toBe('a');
  });

Bdd(feature)
  .scenario('abortDispatch is still checked when a debounced action is dispatched.')
  .given('An action with debounce, combined with nonReentrant, throttle or fresh.')
  .and('Its abortDispatch returns true when the text is empty.')
  .and('The action was dispatched to search "a".')
  .when('The action is dispatched with an empty text, during the debounce period.')
  .then('The second action is aborted right away, and its before and after methods do not run.')
  .and('It does not reset the debounce period, so the first action runs its reducer.')
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .run(async (ctx) => {
    class SearchNotEmpty extends searchWith(ctx.example.val('Feature')) {
      abortDispatch() { return this.text === ''; }
    }

    const log: string[] = [];
    const st = store();

    const first = st.dispatchAndWait(new SearchNotEmpty('a', log));
    const secondStatus = await st.dispatchAndWait(new SearchNotEmpty('', log));
    expect(secondStatus.isDispatchAborted).toBe(true);

    expect((await first).isCompletedOk).toBe(true);
    expect(log).toEqual(['before a', 'reduce a', 'after a']);
    expect(st.state.text).toBe('a');
  });

Bdd(feature)
  .scenario('A debounced action is aborted if computing its key throws when its debounce period ends.')
  .given('An action with debounce, combined with nonReentrant, throttle or fresh.')
  .and('Computing its non-reentrant key, throttle lock or fresh-key throws an error.')
  .when('The action is dispatched.')
  .then('The action is aborted when its debounce period ends, without running its reducer.')
  .and('The error is not thrown.')
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .run(async (ctx) => {
    class SearchKeyThrows extends searchWith(ctx.example.val('Feature')) {
      computeNonReentrantKey(): any { throw new Error('key'); }

      throttleLockBuilder(): any { throw new Error('key'); }

      computeFreshKey(): any { throw new Error('key'); }
    }

    const log: string[] = [];
    const st = store();

    const status = await st.dispatchAndWait(new SearchKeyThrows('a', log));
    expect(status.isDispatchAborted).toBe(true);
    expect(log).toEqual(['before a', 'after a']);
    expect(st.state.text).toBe('');
  });
